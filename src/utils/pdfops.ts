// Shared helpers for the page-tree commands (`merge`, `split`, `extract`) and
// the encryption-aware commands (`encrypt`, `decrypt`). Pure and dependency-free
// except for the pdfnative error classes re-exported through core-bridge.

import { CliError, ErrorCode } from './error.js';
import { validatePath } from './io.js';
import type { ParsedArgs } from './args.js';
import { getStringFlag } from './args.js';
import { PdfPasswordError, PdfEncryptionUnsupportedError } from '../core-bridge/index.js';
import type { EncryptionOptions } from '../core-bridge/index.js';

/**
 * Parse the optional `--max-output-size` flag (bytes). Accepts a positive
 * integer, or `0` / `none` / `off` to disable the guard (maps to `Infinity`).
 * Returns `undefined` when the flag is absent (pdfnative applies its 256 MiB
 * default).
 */
export function parseMaxOutputSize(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === '0' || trimmed === 'none' || trimmed === 'off') {
        return Number.POSITIVE_INFINITY;
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== trimmed) {
        throw new CliError(
            `Invalid --max-output-size "${raw}". Expected a positive integer (bytes) or 0/none to disable.`,
            2,
        );
    }
    return n;
}

/**
 * Merge positional source paths with any repeated `--input` values, in order,
 * validating each against path traversal. De-duplication is intentionally NOT
 * performed — a caller may legitimately repeat a document.
 */
export function collectSourcePaths(
    positionals: readonly string[],
    inputFlags: readonly string[],
): string[] {
    const sources = [...positionals, ...inputFlags].map((s) => s.trim()).filter((s) => s.length > 0);
    for (const path of sources) validatePath(path);
    return sources;
}

/**
 * Parse the optional `--chunk-size` flag (bytes) for the streaming page-tree
 * variants. pdfnative clamps to 1 KiB–16 MiB; we only require a positive
 * integer. Returns `undefined` when absent (pdfnative applies its 64 KiB
 * default).
 */
export function parseChunkSize(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== trimmed) {
        throw new CliError(
            `Invalid --chunk-size "${raw}". Expected a positive integer (bytes).`,
            2,
        );
    }
    return n;
}

// ── Encryption / password helpers (pdfnative 1.6.0) ───────────────────
//
// Secret hygiene: passwords are read from a flag OR an environment variable,
// with the ENVIRONMENT WINNING (same convention as `sign` key material). This
// lets automation keep secrets out of argv/process listings. Passwords are
// never logged or echoed in error messages.

/**
 * Return the first argument that is a non-empty string, else undefined. Used to
 * layer env → flag(s) precedence while treating an EMPTY env/flag value as
 * absent — so `PDFNATIVE_PASSWORD=""` does not silently override `--password`.
 */
export function firstNonEmpty(...vals: readonly (string | undefined)[]): string | undefined {
    for (const v of vals) {
        if (v !== undefined && v !== '') return v;
    }
    return undefined;
}

/** Password used to OPEN an encrypted source (`--password` / $PDFNATIVE_PASSWORD). */
export function resolveSourcePassword(flags: ParsedArgs['flags']): string | undefined {
    return firstNonEmpty(process.env['PDFNATIVE_PASSWORD'], getStringFlag(flags, 'password'));
}

/** Owner password for NEW output (`--owner-password` / $PDFNATIVE_ENCRYPT_OWNER_PASS). */
export function resolveOwnerPassword(flags: ParsedArgs['flags']): string | undefined {
    return firstNonEmpty(process.env['PDFNATIVE_ENCRYPT_OWNER_PASS'], getStringFlag(flags, 'owner-password'));
}

/** User password for NEW output (`--user-password` / $PDFNATIVE_ENCRYPT_USER_PASS). */
export function resolveUserPassword(flags: ParsedArgs['flags']): string | undefined {
    return firstNonEmpty(process.env['PDFNATIVE_ENCRYPT_USER_PASS'], getStringFlag(flags, 'user-password'));
}

const VALID_PT_PERMISSIONS = new Set(['print', 'copy', 'modify', 'extract', 'extracttext']);

/** Normalise an `aes-128|aes-256|128|256` value to pdfnative's `'aes128'|'aes256'`. */
export function normalizeEncryptAlgo(raw: string | undefined): 'aes128' | 'aes256' {
    if (raw === undefined) return 'aes128';
    const v = raw.trim().toLowerCase().replace(/[-_]/g, '');
    if (v === '' || v === 'aes128' || v === '128') return 'aes128';
    if (v === 'aes256' || v === '256') return 'aes256';
    throw new CliError(`Invalid encryption algorithm "${raw}". Valid: aes-128, aes-256.`, 2);
}

/**
 * Parse `--permissions print,copy,modify,extract` into the pdfnative shape.
 * Shared by the page-tree commands and `render` (same permission set).
 */
export function parsePermissions(raw: string | undefined): EncryptionOptions['permissions'] | undefined {
    if (raw === undefined) return undefined;
    const perms: Record<string, boolean> = {};
    for (const token of raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)) {
        const lower = token.toLowerCase();
        if (!VALID_PT_PERMISSIONS.has(lower)) {
            throw new CliError(
                `Invalid permission "${token}" in --permissions. Valid: print, copy, modify, extract.`,
                2,
            );
        }
        const key = lower === 'extract' || lower === 'extracttext' ? 'extractText' : lower;
        perms[key] = true;
    }
    return perms;
}

/**
 * Resolve the `--encrypt` trigger on the page-tree commands. A bare `--encrypt`
 * enables AES-128; `--encrypt aes-256` (or `256`) selects the algorithm.
 */
export function readEncryptTrigger(
    flags: ParsedArgs['flags'],
): { enabled: boolean; algoRaw: string | undefined } {
    const v = flags['encrypt'];
    if (v === undefined) return { enabled: false, algoRaw: undefined };
    if (typeof v === 'boolean') return { enabled: v, algoRaw: undefined };
    const s = (typeof v === 'string' ? v : (v[0] ?? '')).trim();
    // Allow `--encrypt=false|off|0|no` to disable rather than be read as an algorithm.
    if (/^(false|off|0|no)$/i.test(s)) return { enabled: false, algoRaw: undefined };
    return { enabled: true, algoRaw: s };
}

/**
 * Build page-tree re-encryption options ({@link EncryptionOptions}) from flags.
 * The owner password is required (empty is rejected). `algoRaw` is the explicit
 * algorithm value (from `--algorithm` on `encrypt`, or the `--encrypt` value on
 * merge/split/extract). Throws with usage (exit 2) on invalid input.
 */
export function buildEncryptOptions(args: ParsedArgs, algoRaw: string | undefined): EncryptionOptions {
    const owner = resolveOwnerPassword(args.flags);
    if (owner === undefined || owner.length === 0) {
        throw new CliError(
            'Encryption requires an owner password. Provide --owner-password <pass> or $PDFNATIVE_ENCRYPT_OWNER_PASS.',
            2,
        );
    }
    const user = resolveUserPassword(args.flags);
    const perms = parsePermissions(getStringFlag(args.flags, 'permissions'));
    const opts: { -readonly [K in keyof EncryptionOptions]: EncryptionOptions[K] } = {
        ownerPassword: owner,
        algorithm: normalizeEncryptAlgo(algoRaw),
    };
    if (user !== undefined) opts.userPassword = user;
    if (perms !== undefined) opts.permissions = perms;
    return opts;
}

/**
 * Map a value thrown by a pdfnative parse/crypto call to a {@link CliError}
 * with the correct stable error code, without leaking secrets. `context` is a
 * short human prefix (e.g. "Failed to read PDF").
 */
export function mapPdfError(e: unknown, context: string): CliError {
    if (e instanceof PdfPasswordError) {
        return new CliError(`${context}: ${e.message}`, 1, ErrorCode.PASSWORD);
    }
    if (e instanceof PdfEncryptionUnsupportedError) {
        return new CliError(`${context}: ${e.message}`, 1, ErrorCode.UNSUPPORTED);
    }
    const message = e instanceof Error ? e.message : String(e);
    return new CliError(`${context}: ${message}`, 1, ErrorCode.PARSE);
}
