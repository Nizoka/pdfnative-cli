import { openPdf, validatePdfUA, isStream } from '../core-bridge/index.js';
import type { PdfReader, PdfUAValidationResult } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { isJsonMode } from '../utils/agent.js';
import { selectFields, serializeJson, parseFieldList } from '../utils/projection.js';

const VALID_CHECKS = new Set(['pdfa', 'signed', 'encrypted', 'pdfua']);

interface PageInfo {
    readonly index: number;
    readonly width: number | null;
    readonly height: number | null;
    readonly rotation: number;
    readonly annotations: number;
    readonly formFields: number;
}

interface InspectResult {
    readonly version: string;
    readonly pageCount: number;
    readonly encrypted: boolean;
    readonly pdfaConformance: string | null;
    readonly signatures: number;
    readonly metadata: {
        readonly title: string | null;
        readonly author: string | null;
        readonly creationDate: string | null;
        readonly subject: string | null;
        readonly producer: string | null;
    };
    readonly pages?: readonly PageInfo[];
    readonly pdfua?: {
        readonly valid: boolean;
        readonly errors: readonly string[];
        readonly warnings: readonly string[];
    };
    readonly verbose?: {
        readonly trailerKeys: readonly string[];
        readonly catalogKeys: readonly string[];
        readonly objectCount: number;
        readonly xmpMetadata: string | null;
    };
}

interface CheckResult {
    readonly checks: readonly string[];
    readonly allPassed: boolean;
}

function safeInfoString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        return trimmed.slice(1, -1);
    }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) return null;
    return trimmed.length > 0 ? trimmed : null;
}

function extractVersion(reader: PdfReader): string {
    const header = new TextDecoder('ascii', { fatal: false }).decode(
        reader.bytes.slice(0, 20),
    );
    const match = /^%PDF-(\d+\.\d+)/.exec(header);
    return match !== null ? (match[1] as string) : 'unknown';
}

function extractEncrypted(reader: PdfReader): boolean {
    return reader.trailer.get('Encrypt') !== undefined;
}

function readXmp(reader: PdfReader): string | null {
    try {
        const catalog = reader.getCatalog();
        const metaRef = catalog.get('Metadata');
        if (metaRef === undefined) return null;
        const metaObj = reader.resolveValue(metaRef);
        if (!isStream(metaObj)) {
            return null;
        }
        const decoded = reader.decodeStream(
            metaObj as Parameters<PdfReader['decodeStream']>[0],
        );
        return new TextDecoder('utf-8', { fatal: false }).decode(decoded);
    } catch {
        return null;
    }
}

function extractPdfaConformance(reader: PdfReader): string | null {
    const xmp = readXmp(reader);
    if (xmp === null) return null;
    const partMatch = /pdfaid:part[^>]*>(\d+)</.exec(xmp);
    const confMatch = /pdfaid:conformance[^>]*>([A-Za-z]+)</.exec(xmp);
    if (partMatch !== null && confMatch !== null) {
        return `${partMatch[1] as string}${(confMatch[1] as string).toLowerCase()}`;
    }
    return null;
}

function countSignatures(reader: PdfReader): number {
    try {
        const catalog = reader.getCatalog();
        const acroRef = catalog.get('AcroForm');
        if (acroRef === undefined) return 0;
        const acro = reader.resolveValue(acroRef);
        if (!(acro instanceof Map)) return 0;
        const fieldsVal = acro.get('Fields');
        if (!Array.isArray(fieldsVal)) return 0;
        let count = 0;
        for (const ref of fieldsVal) {
            const field = reader.resolveValue(ref as Parameters<PdfReader['resolveValue']>[0]);
            if (field instanceof Map && field.get('FT') === '/Sig') {
                count++;
            }
        }
        return count;
    } catch {
        return 0;
    }
}

function inspectPages(reader: PdfReader): readonly PageInfo[] {
    const out: PageInfo[] = [];
    for (let i = 0; i < reader.pageCount; i++) {
        const page = reader.getPage(i);
        const mediaBox = page.get('MediaBox');
        let width: number | null = null;
        let height: number | null = null;
        const box = Array.isArray(mediaBox) ? mediaBox : null;
        if (box !== null && box.length === 4) {
            const w = box[2];
            const h = box[3];
            if (typeof w === 'number') width = w;
            if (typeof h === 'number') height = h;
        }
        const rotation = typeof page.get('Rotate') === 'number'
            ? (page.get('Rotate') as number)
            : 0;
        const annots = page.get('Annots');
        let annotations = 0;
        let formFields = 0;
        if (Array.isArray(annots)) {
            for (const ref of annots) {
                annotations++;
                try {
                    const annot = reader.resolveValue(ref as Parameters<PdfReader['resolveValue']>[0]);
                    if (annot instanceof Map && annot.get('Subtype') === '/Widget') {
                        formFields++;
                    }
                } catch {
                    // best-effort — keep counting other annotations
                }
            }
        }
        out.push({ index: i, width, height, rotation, annotations, formFields });
    }
    return out;
}

function runPdfUaCheck(bytes: Uint8Array): NonNullable<InspectResult['pdfua']> {
    const res: PdfUAValidationResult = validatePdfUA(bytes);
    return { valid: res.valid, errors: res.errors, warnings: res.warnings };
}

function buildVerbose(reader: PdfReader): InspectResult['verbose'] {
    const trailerKeys: string[] = [];
    for (const k of reader.trailer.keys()) trailerKeys.push(k);
    const catalogKeys: string[] = [];
    try {
        for (const k of reader.getCatalog().keys()) catalogKeys.push(k);
    } catch {
        // catalog not resolvable — leave empty
    }
    const objectCount = reader.xref?.entries?.size ?? 0;
    const xmp = readXmp(reader);
    return {
        trailerKeys,
        catalogKeys,
        objectCount,
        xmpMetadata: xmp,
    };
}

/** Canonical minimal verdict for agents (`--summary`). Stable, schema-pinned. */
function toInspectSummary(result: InspectResult): Record<string, unknown> {
    return {
        pages: result.pageCount,
        encrypted: result.encrypted,
        signatures: result.signatures,
        pdfa: result.pdfaConformance,
    };
}

function evaluateChecks(checks: readonly string[], result: InspectResult): CheckResult {
    const out: { name: string; passed: boolean }[] = [];
    for (const c of checks) {
        if (!VALID_CHECKS.has(c)) {
            throw new CliError(
                `Invalid --check value "${c}". Valid: ${[...VALID_CHECKS].join(', ')}.`,
                2,
            );
        }
        if (c === 'pdfa') out.push({ name: c, passed: result.pdfaConformance !== null });
        if (c === 'signed') out.push({ name: c, passed: result.signatures > 0 });
        if (c === 'encrypted') out.push({ name: c, passed: result.encrypted });
        if (c === 'pdfua') out.push({ name: c, passed: result.pdfua?.valid === true });
    }
    return {
        checks: out.map((x) => `${x.name}=${x.passed ? 'pass' : 'fail'}`),
        allPassed: out.every((x) => x.passed),
    };
}

export async function inspect(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const format = getStringFlag(args.flags, 'format', 'f') ?? 'json';
    const verbose = hasFlag(args.flags, 'verbose');
    const includePages = hasFlag(args.flags, 'pages');
    const checks = getStringFlagAll(args.flags, 'check');
    const includePdfua = hasFlag(args.flags, 'pdfua') || checks.includes('pdfua');

    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let reader: PdfReader;
    try {
        reader = openPdf(pdfBytes);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read PDF: ${message}`, 1, ErrorCode.PARSE);
    }

    const info = reader.getInfo();
    const baseResult: InspectResult = {
        version: extractVersion(reader),
        pageCount: reader.pageCount,
        encrypted: extractEncrypted(reader),
        pdfaConformance: extractPdfaConformance(reader),
        signatures: countSignatures(reader),
        metadata: {
            title: info !== null ? safeInfoString(info.get('Title')) : null,
            author: info !== null ? safeInfoString(info.get('Author')) : null,
            creationDate: info !== null ? safeInfoString(info.get('CreationDate')) : null,
            subject: info !== null ? safeInfoString(info.get('Subject')) : null,
            producer: info !== null ? safeInfoString(info.get('Producer')) : null,
        },
    };

    const result: InspectResult = {
        ...baseResult,
        ...(includePages ? { pages: inspectPages(reader) } : {}),
        ...(includePdfua ? { pdfua: runPdfUaCheck(pdfBytes) } : {}),
        ...(verbose ? { verbose: buildVerbose(reader) } : {}),
    };

    if (format === 'json') {
        const summary = hasFlag(args.flags, 'summary');
        const fieldsRaw = getStringFlag(args.flags, 'fields');
        let out: unknown = summary ? toInspectSummary(result) : result;
        if (fieldsRaw !== undefined) {
            out = selectFields(out, parseFieldList(fieldsRaw));
        }
        // Compact for agents (--json), pretty for humans; --pretty forces pretty.
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        process.stdout.write(serializeJson(out, pretty) + '\n');
    } else {
        const lines = [
            `Version:        ${result.version}`,
            `Pages:          ${result.pageCount}`,
            `Encrypted:      ${result.encrypted ? 'yes' : 'no'}`,
            `PDF/A:          ${result.pdfaConformance ?? 'none'}`,
            `Signatures:     ${result.signatures}`,
            `Title:          ${result.metadata.title ?? '—'}`,
            `Author:         ${result.metadata.author ?? '—'}`,
            `Created:        ${result.metadata.creationDate ?? '—'}`,
            `Subject:        ${result.metadata.subject ?? '—'}`,
            `Producer:       ${result.metadata.producer ?? '—'}`,
        ];
        if (result.pages !== undefined) {
            lines.push('Pages detail:');
            for (const p of result.pages) {
                lines.push(
                    `  #${p.index + 1}: ${p.width ?? '?'}x${p.height ?? '?'}pt rot=${p.rotation}° annots=${p.annotations} fields=${p.formFields}`,
                );
            }
        }
        if (result.pdfua !== undefined) {
            lines.push(`PDF/UA:         ${result.pdfua.valid ? 'valid' : 'invalid'}`);
            for (const err of result.pdfua.errors) lines.push(`  error:   ${err}`);
            for (const warn of result.pdfua.warnings) lines.push(`  warning: ${warn}`);
        }
        if (result.verbose !== undefined) {
            lines.push(`Trailer keys:   ${result.verbose.trailerKeys.join(', ')}`);
            lines.push(`Catalog keys:   ${result.verbose.catalogKeys.join(', ')}`);
            lines.push(`Object count:   ${result.verbose.objectCount}`);
            if (result.verbose.xmpMetadata !== null) {
                lines.push(`XMP metadata:   (${result.verbose.xmpMetadata.length} chars)`);
            }
        }
        process.stdout.write(lines.join('\n') + '\n');
    }

    // --check semantics: if any check is given, exit code reflects the result.
    if (checks.length > 0) {
        const evaluation = evaluateChecks(checks, result);
        if (!evaluation.allPassed) {
            const detail = `check failed: ${evaluation.checks.join(', ')}`;
            // exit 1 = check failure (semantic), distinct from a usage error (2)
            // or runtime error (1). Human mode prints the breakdown to stderr and
            // throws an empty message (the dispatcher would otherwise re-print it);
            // agent mode carries the detail in the JSON error envelope instead.
            if (!isJsonMode()) {
                process.stderr.write(detail + '\n');
                throw new CliError('', 1, ErrorCode.CHECK_FAILED);
            }
            throw new CliError(detail, 1, ErrorCode.CHECK_FAILED);
        }
    }
}
