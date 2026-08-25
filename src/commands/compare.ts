// `pdfnative compare` — textual + structural diff of two PDF documents.
//
// Two comparison modes, combinable (`--mode text|structure|both`, default both):
//   • structure — page count, per-page geometry (MediaBox size, Trim/Bleed/Art
//     boxes, /UserUnit — all within ±--tolerance points), /Info metadata
//     (Title/Author/Subject/Keywords/Trapped), form-field inventory, per-page
//     annotation counts, encryption scheme, and signature inventory.
//   • text — per-page reading-order text (pdfnative `extractText`), compared
//     line by line (or as whitespace-collapsed text with --ignore-whitespace),
//     optionally restricted with --pages.
//
// A VISUAL (rasterised, pixel-level) diff is intentionally OUT OF SCOPE:
// pdfnative has no rasteriser. This command compares content and structure,
// never rendered pixels.
//
// Exit codes: 0 identical; differences → the report is printed to stdout FIRST
// (both formats), then exit 1 with E_CHECK_FAILED (same convention as
// `inspect --check`); unreadable file → E_IO (1); bad usage → 2.

import { openPdf, extractText, listSignatures, readFormFields } from '../core-bridge/index.js';
import type { PdfReader, PdfDict, PdfValue, ExtractTextOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readBinaryFile } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isJsonMode } from '../utils/agent.js';
import { serializeJson } from '../utils/projection.js';
import { mapPdfError } from '../utils/pdfops.js';
import { parsePageList } from '../utils/pages.js';

type DiffKind =
    | 'pageCount' | 'pageSize' | 'box' | 'userUnit' | 'metadata'
    | 'formFields' | 'annotations' | 'encryption' | 'signatures' | 'text';

/** One reported difference. `a`/`b` are always JSON-serializable — never raw bytes. */
interface Difference {
    readonly kind: DiffKind;
    readonly page?: number; // 1-based
    readonly path?: string;
    readonly a?: unknown;
    readonly b?: unknown;
    readonly detail?: string;
}

type CompareMode = 'structure' | 'text';

interface LoadedDoc {
    readonly label: 'A' | 'B';
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly reader: PdfReader;
    readonly password: string | undefined;
}

const VALID_MODES = new Set(['text', 'structure', 'both']);
const VALID_FORMATS = new Set(['text', 'json']);
/** Optional page boxes compared coordinate-wise when present (ISO 32000-1 §14.11.2). */
const PAGE_BOXES = ['TrimBox', 'BleedBox', 'ArtBox'] as const;
/** /Info keys compared in structure mode. */
const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Trapped'] as const;
const EXCERPT_MAX = 160;

function parseTolerance(raw: string | undefined): number {
    if (raw === undefined) return 0;
    const n = Number.parseFloat(raw.trim());
    if (!Number.isFinite(n) || n < 0) {
        throw new CliError(`Invalid --tolerance "${raw}". Expected a number >= 0 (points).`, 2);
    }
    return n;
}

async function loadDoc(label: 'A' | 'B', path: string, password: string | undefined): Promise<LoadedDoc> {
    let bytes: Uint8Array;
    try {
        bytes = await readBinaryFile(path);
    } catch (e) {
        if (e instanceof CliError) throw e;
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Cannot read PDF ${label} ("${path}"): ${message}`, 1, ErrorCode.IO);
    }
    let reader: PdfReader;
    try {
        reader = openPdf(bytes, password !== undefined ? { password } : undefined);
    } catch (e) {
        throw mapPdfError(e, `Failed to open PDF ${label} ("${path}")`);
    }
    return { label, path, bytes, reader, password };
}

// ── Structure helpers ─────────────────────────────────────────────────

/** Read a page-dictionary array of `len` numbers (resolving refs), or null. */
function readNumberArray(reader: PdfReader, dict: PdfDict, key: string, len: number): readonly number[] | null {
    const raw = dict.get(key);
    if (raw === undefined) return null;
    const val = reader.resolveValue(raw);
    if (!Array.isArray(val) || val.length !== len) return null;
    const out: number[] = [];
    for (const el of val) {
        const n = reader.resolveValue(el as PdfValue);
        if (typeof n !== 'number' || !Number.isFinite(n)) return null;
        out.push(n);
    }
    return out;
}

function boxSize(box: readonly number[]): { readonly width: number; readonly height: number } {
    return {
        width: Math.abs((box[2] as number) - (box[0] as number)),
        height: Math.abs((box[3] as number) - (box[1] as number)),
    };
}

function readUserUnit(reader: PdfReader, page: PdfDict): number {
    const raw = page.get('UserUnit');
    if (raw === undefined) return 1;
    const v = reader.resolveValue(raw);
    return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

/** /Info string value (parens-wrapped literals unwrapped), or null. */
function infoValue(reader: PdfReader, info: PdfDict | null, key: string): string | null {
    if (info === null) return null;
    const raw = info.get(key);
    if (raw === undefined) return null;
    const val = reader.resolveValue(raw);
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) return trimmed.slice(1, -1);
    return trimmed;
}

interface FormSummary { readonly count: number; readonly names: readonly string[] }

/** Form-field inventory; a document without an AcroForm yields { 0, [] }. */
function formSummary(doc: LoadedDoc): FormSummary {
    try {
        const fields = readFormFields(doc.bytes, doc.password !== undefined ? { password: doc.password } : undefined);
        return { count: fields.length, names: fields.map((f) => f.name).sort() };
    } catch {
        return { count: 0, names: [] };
    }
}

interface SignatureSummary {
    readonly count: number;
    readonly fieldNames: readonly (string | null)[];
    readonly docTimestamps: number;
}

function signatureSummary(doc: LoadedDoc): SignatureSummary {
    try {
        const sigs = listSignatures(doc.bytes);
        return {
            count: sigs.length,
            fieldNames: sigs.map((s) => s.fieldName ?? null),
            docTimestamps: sigs.filter((s) => s.isDocTimestamp).length,
        };
    } catch {
        return { count: 0, fieldNames: [], docTimestamps: 0 };
    }
}

type EncryptionSummary = { readonly algorithm: string; readonly revision: number } | null;

function encryptionSummary(doc: LoadedDoc): EncryptionSummary {
    const enc = doc.reader.encryption;
    return enc === null ? null : { algorithm: enc.algorithm, revision: enc.revision };
}

function annotationCount(reader: PdfReader, pageIndex: number): number {
    try {
        return reader.getAnnotations(pageIndex).length;
    } catch {
        return 0;
    }
}

function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function fmtPt(n: number): number {
    return Number(n.toFixed(2));
}

function compareStructure(a: LoadedDoc, b: LoadedDoc, tolerance: number, minPages: number): Difference[] {
    const diffs: Difference[] = [];
    const within = (x: number, y: number): boolean => Math.abs(x - y) <= tolerance;

    // Per-page geometry over the pages both documents share.
    for (let i = 0; i < minPages; i++) {
        const pageA = a.reader.getPage(i);
        const pageB = b.reader.getPage(i);

        const mediaA = readNumberArray(a.reader, pageA, 'MediaBox', 4);
        const mediaB = readNumberArray(b.reader, pageB, 'MediaBox', 4);
        if (mediaA === null || mediaB === null) {
            if ((mediaA === null) !== (mediaB === null)) {
                diffs.push({
                    kind: 'pageSize', page: i + 1, a: mediaA, b: mediaB,
                    detail: 'MediaBox present in one document only',
                });
            }
        } else {
            const sizeA = boxSize(mediaA);
            const sizeB = boxSize(mediaB);
            if (!within(sizeA.width, sizeB.width) || !within(sizeA.height, sizeB.height)) {
                diffs.push({
                    kind: 'pageSize', page: i + 1,
                    a: { width: sizeA.width, height: sizeA.height },
                    b: { width: sizeB.width, height: sizeB.height },
                    detail: `${fmtPt(sizeA.width)}x${fmtPt(sizeA.height)}pt vs ${fmtPt(sizeB.width)}x${fmtPt(sizeB.height)}pt`,
                });
            }
        }

        for (const boxName of PAGE_BOXES) {
            const boxA = readNumberArray(a.reader, pageA, boxName, 4);
            const boxB = readNumberArray(b.reader, pageB, boxName, 4);
            if (boxA === null && boxB === null) continue;
            if (boxA === null || boxB === null) {
                diffs.push({
                    kind: 'box', page: i + 1, path: boxName, a: boxA, b: boxB,
                    detail: `${boxName} present in one document only`,
                });
                continue;
            }
            if (boxA.some((v, k) => !within(v, boxB[k] as number))) {
                diffs.push({ kind: 'box', page: i + 1, path: boxName, a: [...boxA], b: [...boxB] });
            }
        }

        const uuA = readUserUnit(a.reader, pageA);
        const uuB = readUserUnit(b.reader, pageB);
        if (uuA !== uuB) {
            diffs.push({ kind: 'userUnit', page: i + 1, a: uuA, b: uuB });
        }

        const annA = annotationCount(a.reader, i);
        const annB = annotationCount(b.reader, i);
        if (annA !== annB) {
            diffs.push({
                kind: 'annotations', page: i + 1, a: annA, b: annB,
                detail: `${annA} vs ${annB} annotation(s)`,
            });
        }
    }

    // /Info metadata.
    const infoA = a.reader.getInfo();
    const infoB = b.reader.getInfo();
    for (const key of INFO_KEYS) {
        const va = infoValue(a.reader, infoA, key);
        const vb = infoValue(b.reader, infoB, key);
        if (va !== vb) {
            diffs.push({ kind: 'metadata', path: key, a: va, b: vb });
        }
    }

    // Interactive form fields (count + fully-qualified names).
    const formA = formSummary(a);
    const formB = formSummary(b);
    if (!sameJson(formA, formB)) {
        diffs.push({
            kind: 'formFields', a: formA, b: formB,
            detail: `${formA.count} vs ${formB.count} form field(s)`,
        });
    }

    // Encryption (presence + algorithm/revision — never key material).
    const encA = encryptionSummary(a);
    const encB = encryptionSummary(b);
    if (!sameJson(encA, encB)) {
        diffs.push({
            kind: 'encryption', a: encA, b: encB,
            detail: `${encA === null ? 'not encrypted' : encA.algorithm} vs ${encB === null ? 'not encrypted' : encB.algorithm}`,
        });
    }

    // Signature inventory (count, field names, document timestamps).
    const sigA = signatureSummary(a);
    const sigB = signatureSummary(b);
    if (!sameJson(sigA, sigB)) {
        diffs.push({
            kind: 'signatures', a: sigA, b: sigB,
            detail: `${sigA.count} vs ${sigB.count} signature(s)`,
        });
    }

    return diffs;
}

// ── Text helpers ──────────────────────────────────────────────────────

function excerpt(line: string): string {
    return line.length > EXCERPT_MAX ? `${line.slice(0, EXCERPT_MAX)}…` : line;
}

function collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Extract text for the given 0-based pages, as pageIndex → text. */
function extractPageTexts(doc: LoadedDoc, pages: readonly number[]): ReadonlyMap<number, string> {
    const opts: { -readonly [K in keyof ExtractTextOptions]: ExtractTextOptions[K] } = { pages: [...pages] };
    if (doc.password !== undefined) opts.password = doc.password;
    try {
        return new Map(extractText(doc.bytes, opts).map((p) => [p.pageIndex, p.text]));
    } catch (e) {
        throw mapPdfError(e, `Failed to extract text from PDF ${doc.label}`);
    }
}

function compareText(
    a: LoadedDoc,
    b: LoadedDoc,
    pageIndices: readonly number[],
    ignoreWhitespace: boolean,
): Difference[] {
    const diffs: Difference[] = [];
    const textsA = extractPageTexts(a, pageIndices);
    const textsB = extractPageTexts(b, pageIndices);

    for (const idx of pageIndices) {
        const ta = textsA.get(idx) ?? '';
        const tb = textsB.get(idx) ?? '';

        if (ignoreWhitespace) {
            const na = collapseWhitespace(ta);
            const nb = collapseWhitespace(tb);
            if (na !== nb) {
                diffs.push({
                    kind: 'text', page: idx + 1,
                    a: excerpt(na), b: excerpt(nb),
                    detail: 'normalized text differs',
                });
            }
            continue;
        }

        // Simple line-by-line scan (no LCS): report the first differing line.
        const linesA = ta.split(/\r?\n/);
        const linesB = tb.split(/\r?\n/);
        const max = Math.max(linesA.length, linesB.length);
        for (let l = 0; l < max; l++) {
            if ((linesA[l] ?? '') !== (linesB[l] ?? '')) {
                diffs.push({
                    kind: 'text', page: idx + 1,
                    a: excerpt(linesA[l] ?? ''), b: excerpt(linesB[l] ?? ''),
                    detail: `text differs from line ${l + 1}`,
                });
                break;
            }
        }
    }
    return diffs;
}

// ── Report rendering ──────────────────────────────────────────────────

function renderTextReport(
    pathA: string,
    pathB: string,
    modes: readonly CompareMode[],
    diffs: readonly Difference[],
): string {
    const lines: string[] = [
        `compare  A: ${pathA}`,
        `         B: ${pathB}`,
        `mode: ${modes.join(', ')}`,
    ];
    if (diffs.length === 0) {
        lines.push('identical');
    } else {
        lines.push(`differences (${diffs.length}):`);
        for (const d of diffs) {
            const where = (d.page !== undefined ? ` page ${d.page}` : '') + (d.path !== undefined ? ` ${d.path}` : '');
            lines.push(`  [${d.kind}]${where}${d.detail !== undefined ? `: ${d.detail}` : ''}`);
            if (d.a !== undefined || d.b !== undefined) {
                lines.push(`      a: ${JSON.stringify(d.a ?? null)}`);
                lines.push(`      b: ${JSON.stringify(d.b ?? null)}`);
            }
        }
    }
    return lines.join('\n') + '\n';
}

// ── Command ───────────────────────────────────────────────────────────

export async function compare(args: ParsedArgs): Promise<void> {
    if (args.positionals.length !== 2) {
        throw new CliError(
            `compare requires exactly two PDF paths (got ${args.positionals.length}): pdfnative compare <a.pdf> <b.pdf>.`,
            2,
        );
    }
    const pathA = args.positionals[0] as string;
    const pathB = args.positionals[1] as string;

    const modeRaw = getStringFlag(args.flags, 'mode') ?? 'both';
    const format = getStringFlag(args.flags, 'format') ?? 'text';
    const tolerance = parseTolerance(getStringFlag(args.flags, 'tolerance'));
    const ignoreWhitespace = hasFlag(args.flags, 'ignore-whitespace');
    const pagesSpec = getStringFlag(args.flags, 'pages');

    if (!VALID_MODES.has(modeRaw)) {
        throw new CliError(`Invalid --mode value "${modeRaw}". Valid: text, structure, both.`, 2);
    }
    if (!VALID_FORMATS.has(format)) {
        throw new CliError(`Invalid --format value "${format}". Valid: text, json.`, 2);
    }
    const modes: readonly CompareMode[] = modeRaw === 'both' ? ['structure', 'text'] : [modeRaw as CompareMode];

    const a = await loadDoc('A', pathA, getStringFlag(args.flags, 'password-a'));
    const b = await loadDoc('B', pathB, getStringFlag(args.flags, 'password-b'));

    const diffs: Difference[] = [];
    const pcA = a.reader.pageCount;
    const pcB = b.reader.pageCount;
    if (pcA !== pcB) {
        diffs.push({ kind: 'pageCount', a: pcA, b: pcB, detail: `${pcA} vs ${pcB} page(s)` });
    }
    const minPages = Math.min(pcA, pcB);

    if (modes.includes('structure')) {
        diffs.push(...compareStructure(a, b, tolerance, minPages));
    }

    if (modes.includes('text')) {
        // --pages is 1-based (like split/extract); validated against the page
        // count both documents share, then deduplicated in selector order.
        const pageIndices = pagesSpec !== undefined
            ? [...new Set(parsePageList(pagesSpec, minPages))]
            : Array.from({ length: minPages }, (_, i) => i);
        diffs.push(...compareText(a, b, pageIndices, ignoreWhitespace));
    }

    const equal = diffs.length === 0;
    const report = { equal, modes, differences: diffs };

    if (format === 'json') {
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        process.stdout.write(serializeJson(report, pretty) + '\n');
    } else {
        process.stdout.write(renderTextReport(pathA, pathB, modes, diffs));
    }

    // Differences → exit 1 with E_CHECK_FAILED, AFTER the report reached
    // stdout (mirrors `inspect --check`): human mode puts the summary on
    // stderr and throws an empty message so the dispatcher does not re-print
    // it; agent mode carries the summary in the JSON error envelope.
    if (!equal) {
        const detail = `documents differ: ${diffs.length} difference(s)`;
        if (!isJsonMode()) {
            process.stderr.write(detail + '\n');
            throw new CliError('', 1, ErrorCode.CHECK_FAILED);
        }
        throw new CliError(detail, 1, ErrorCode.CHECK_FAILED);
    }

    emitStatus({ command: 'compare', equal: true, modes, differences: 0 });
}
