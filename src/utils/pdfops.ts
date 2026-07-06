// Shared helpers for the page-tree commands (`merge`, `split`, `extract`).
// Pure and dependency-free.

import { CliError } from './error.js';
import { validatePath } from './io.js';

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
