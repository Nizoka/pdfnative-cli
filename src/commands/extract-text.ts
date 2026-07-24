// `pdfnative extract-text` — extract reading-order Unicode text from a PDF
// (pdfnative 1.6.0 `extractText`). Built for agents / RAG pipelines: text on
// stdout as plain text, a JSON array, or NDJSON (one line per page). Encrypted
// documents are supported via --password. No OCR — image-only pages yield
// empty text.

import { extractText, openPdf } from '../core-bridge/index.js';
import type { ExtractTextOptions, ExtractedPageText } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import { isJsonMode } from '../utils/agent.js';
import { selectFields, serializeJson, parseFieldList } from '../utils/projection.js';
import { resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';
import { parsePageList } from '../utils/pages.js';

const VALID_FORMATS = new Set(['text', 'json', 'ndjson']);

/** Parse `--max-length` (chars): positive integer, or 0/none/off to disable. */
function parseMaxLength(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === '0' || trimmed === 'none' || trimmed === 'off') return Number.POSITIVE_INFINITY;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== trimmed) {
        throw new CliError(
            `Invalid --max-length "${raw}". Expected a positive integer (chars) or 0/none to disable.`,
            2,
        );
    }
    return n;
}

/** Shape a page for JSON/NDJSON output (drop `runs` when not requested). */
function pageToJson(p: ExtractedPageText, includeRuns: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = { pageIndex: p.pageIndex, text: p.text };
    if (includeRuns && p.runs !== undefined) out.runs = p.runs;
    return out;
}

export async function extractTextCmd(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const format = getStringFlag(args.flags, 'format', 'f') ?? 'text';
    const includeRuns = hasFlag(args.flags, 'runs');
    const pagesSpec = getStringFlag(args.flags, 'pages');
    const password = resolveSourcePassword(args.flags);
    const maxTextLength = parseMaxLength(getStringFlag(args.flags, 'max-length'));

    if (!VALID_FORMATS.has(format)) {
        throw new CliError(
            `Invalid --format value "${format}". Valid: text, json, ndjson.`,
            2,
        );
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    const opts: { -readonly [K in keyof ExtractTextOptions]: ExtractTextOptions[K] } = {};
    if (password !== undefined) opts.password = password;
    if (includeRuns) opts.includeRuns = true;
    if (maxTextLength !== undefined) opts.maxTextLength = maxTextLength;

    // A --pages selector is 1-based (like split/extract); extractText wants
    // 0-based indices. Resolve the page count first for friendly bounds errors.
    if (pagesSpec !== undefined) {
        let pageCount: number;
        try {
            pageCount = openPdf(pdfBytes, password !== undefined ? { password } : undefined).pageCount;
        } catch (e) {
            throw mapPdfError(e, 'Failed to read PDF');
        }
        opts.pages = parsePageList(pagesSpec, pageCount);
    }

    let pages: ExtractedPageText[];
    try {
        pages = extractText(pdfBytes, opts);
    } catch (e) {
        throw mapPdfError(e, 'Failed to extract text');
    }

    if (format === 'text') {
        // Form-feed page delimiter (pdftotext convention), reversible by callers.
        process.stdout.write(pages.map((p) => p.text).join('\f') + '\n');
        return;
    }

    if (format === 'ndjson') {
        // One compact JSON object per page — ideal for streaming/RAG ingestion.
        const lines = pages.map((p) => serializeJson(pageToJson(p, includeRuns), false));
        process.stdout.write(lines.join('\n') + (lines.length > 0 ? '\n' : ''));
        return;
    }

    // format === 'json'
    const summary = hasFlag(args.flags, 'summary');
    const fieldsRaw = getStringFlag(args.flags, 'fields');
    let out: unknown = summary
        ? { pages: pages.length, characters: pages.reduce((n, p) => n + p.text.length, 0) }
        : pages.map((p) => pageToJson(p, includeRuns));
    if (fieldsRaw !== undefined) {
        out = selectFields(out, parseFieldList(fieldsRaw));
    }
    const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
    process.stdout.write(serializeJson(out, pretty) + '\n');
}
