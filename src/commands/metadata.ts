// `pdfnative metadata` — update a PDF's document metadata (/Info dictionary,
// mirrored to the XMP packet when the document carries one) through pdfnative's
// INCREMENTAL modifier (ISO 32000-1 §7.5.6). New objects are appended after the
// original bytes — the previous revision stays byte-for-byte intact, so any
// existing digital signature remains valid for its revision. That preservation
// is the reason this command exists instead of a rebuild.
//
// Fields come either from per-field flags (--title/--author/--subject/
// --keywords/--mod-date) or from a JSON object (--from-json), never both.
// Without --mod-date the library stamps the current instant into /ModDate
// (non-deterministic output); pass a fixed ISO 8601 date for reproducible bytes.
//
// Encrypted sources: the document is OPENED with --password (or
// $PDFNATIVE_PASSWORD) via openPdf's password support. Note that pdfnative's
// incremental modifier does not document re-encrypting appended objects (unlike
// `fillForm`), so writing metadata into an encrypted PDF may not be supported
// end-to-end by the engine yet.

import { openPdf, createModifier } from '../core-bridge/index.js';
import type { PdfMetadataUpdate, PdfReader } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, readBinaryFile, writeOutput, assertJsonSizeLimit } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';

type MutableMetadataUpdate = { -readonly [K in keyof PdfMetadataUpdate]: PdfMetadataUpdate[K] };

/** The /Info string fields settable per-flag and via --from-json. */
const STRING_FIELDS = ['title', 'author', 'subject', 'keywords'] as const;

/** Parse an ISO 8601 date given on the command line (`--mod-date`). Usage error on failure. */
function parseModDateFlag(raw: string): Date {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) {
        throw new CliError(`Invalid --mod-date "${raw}". Expected ISO 8601 (e.g. 2026-01-15T00:00:00Z).`, 2);
    }
    return t;
}

/** Parse the `modDate` string inside a --from-json payload. Input error on failure. */
function parseModDateJson(raw: string): Date {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) {
        throw new CliError(
            `Invalid modDate "${raw}" in --from-json. Expected an ISO 8601 string.`,
            1,
            ErrorCode.INPUT,
        );
    }
    return t;
}

/**
 * Load and validate a --from-json payload: a single object with any of
 * { title, author, subject, keywords, modDate } — all strings, `modDate` an
 * ISO 8601 instant. Unknown keys are rejected (E_INPUT) so typos never pass
 * silently.
 */
async function loadUpdateFromJson(path: string): Promise<MutableMetadataUpdate> {
    let buf: Uint8Array;
    try {
        buf = await readBinaryFile(path);
    } catch (e) {
        if (e instanceof CliError) throw e;
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Cannot read --from-json file "${path}": ${message}`, 1, ErrorCode.IO);
    }
    assertJsonSizeLimit(Buffer.from(buf));

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(buf));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --from-json JSON: ${message}`, 1, ErrorCode.PARSE);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new CliError(
            '--from-json must be a JSON object: { "title"?, "author"?, "subject"?, "keywords"?, "modDate"? }.',
            1,
            ErrorCode.INPUT,
        );
    }

    const obj = parsed as Record<string, unknown>;
    const update: MutableMetadataUpdate = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if ((STRING_FIELDS as readonly string[]).includes(key)) {
            if (typeof value !== 'string') {
                throw new CliError(`--from-json field "${key}" must be a string.`, 1, ErrorCode.INPUT);
            }
            update[key as (typeof STRING_FIELDS)[number]] = value;
        } else if (key === 'modDate') {
            if (typeof value !== 'string') {
                throw new CliError('--from-json field "modDate" must be an ISO 8601 string.', 1, ErrorCode.INPUT);
            }
            update.modDate = parseModDateJson(value);
        } else {
            throw new CliError(
                `Unknown key "${key}" in --from-json. Valid: ${[...STRING_FIELDS, 'modDate'].join(', ')}.`,
                1,
                ErrorCode.INPUT,
            );
        }
    }
    return update;
}

export async function metadata(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const fromJsonPath = getStringFlag(args.flags, 'from-json');
    const password = resolveSourcePassword(args.flags);
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    // Per-field flags. Validate scalar flags up-front so usage errors (exit 2)
    // are reported before any I/O (same convention as `sign`).
    const flagUpdate: MutableMetadataUpdate = {};
    for (const key of STRING_FIELDS) {
        const value = getStringFlag(args.flags, key);
        if (value !== undefined) flagUpdate[key] = value;
    }
    const modDateRaw = getStringFlag(args.flags, 'mod-date');
    if (modDateRaw !== undefined) flagUpdate.modDate = parseModDateFlag(modDateRaw);

    const hasFieldFlags = Object.keys(flagUpdate).length > 0;
    if (fromJsonPath !== undefined && hasFieldFlags) {
        throw new CliError(
            '--from-json is mutually exclusive with the per-field flags (--title, --author, --subject, --keywords, --mod-date).',
            2,
        );
    }

    const update: MutableMetadataUpdate = fromJsonPath !== undefined
        ? await loadUpdateFromJson(fromJsonPath)
        : flagUpdate;

    const fields = Object.keys(update);
    if (fields.length === 0) {
        throw new CliError(
            'metadata requires at least one field: --title, --author, --subject, --keywords, --mod-date, or --from-json <file>.',
            2,
        );
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let reader: PdfReader;
    try {
        reader = openPdf(pdfBytes, password !== undefined ? { password } : undefined);
    } catch (e) {
        throw mapPdfError(e, 'Failed to read PDF');
    }

    if (dryRun) {
        emitStatus({ command: 'metadata', dryRun: true, output: outputPath ?? '-', fields });
        return;
    }

    const modifier = createModifier(reader);
    let outBytes: Uint8Array;
    try {
        // When `modDate` is absent the library stamps the current instant —
        // exactly the documented default — so we never synthesize one here.
        modifier.updateMetadata(update);
        outBytes = modifier.save();
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to write updated PDF: ${message}`, 1, ErrorCode.RUNTIME);
    }

    await writeOutput(outBytes, outputPath);
    emitStatus({
        command: 'metadata',
        dryRun: false,
        output: outputPath ?? '-',
        fields,
        bytes: outBytes.length,
    });
}
