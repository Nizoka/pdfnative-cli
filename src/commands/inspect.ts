import { openPdf, validatePdfUA, validatePdfX, isStream, readFormFields, listSignatures, nameValue } from '../core-bridge/index.js';
import type { PdfReader, PdfUAValidationResult, PdfXValidationResult, PageLabelRange, ParsedAnnotation, PdfEncryptionInfo, PdfSignatureInfo, PdfDict } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { isJsonMode } from '../utils/agent.js';
import { selectFields, serializeJson, parseFieldList } from '../utils/projection.js';
import { resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';
import { pdfDateToIso } from '../utils/pdfdate.js';

/** `--check` assertions; `pdfx` (structural PDF/X-4, pdfnative 1.8.0) since v1.5.0. */
const VALID_CHECKS = new Set(['pdfa', 'signed', 'encrypted', 'pdfua', 'pdfx']);

/** Parametrized check: `--check "signatures>=N"` (N non-placeholder signatures). */
const SIG_COUNT_CHECK = /^signatures>=(\d+)$/;

interface PageInfo {
    readonly index: number;
    readonly width: number | null;
    readonly height: number | null;
    readonly rotation: number;
    readonly annotations: number;
    readonly formFields: number;
    /** `/CropBox` — viewer display region, when present on the page dict. */
    readonly cropBox?: readonly number[];
    /** `/TrimBox` — finished page size after cutting (ISO 32000-1 §14.11.2). */
    readonly trimBox?: readonly number[];
    /** `/BleedBox` — content clipped in production. */
    readonly bleedBox?: readonly number[];
    /** `/ArtBox` — meaningful-content extent. */
    readonly artBox?: readonly number[];
    /** `/UserUnit` — user-space unit in multiples of 1/72 inch (large-format pages). */
    readonly userUnit?: number;
}

/** One entry of `inspect --signatures` (pdfnative 1.7.0 `listSignatures`).
 *  `contentsLength` replaces the raw `/Contents` bytes — key material and
 *  CMS blobs are never emitted. */
interface SignatureDetail {
    readonly fieldName: string | null;
    readonly subFilter: string;
    readonly byteRange: readonly number[];
    readonly isDocTimestamp: boolean;
    readonly isPlaceholder: boolean;
    readonly sigObjNum: number;
    readonly contentsLength: number;
}

interface AnnotationInfo {
    readonly page: number;
    readonly subtype: string;
    readonly contents: string | null;
    readonly title: string | null;
    readonly url: string | null;
}

interface PageLabelInfo {
    readonly startPage: number;
    readonly style: string | null;
    readonly prefix: string | null;
    readonly start: number | null;
}

interface EncryptionDetail {
    readonly algorithm: string;
    readonly revision: number;
    readonly authenticatedAs: string;
}

interface FormFieldInfo {
    readonly name: string;
    readonly type: string;
    readonly value: string | readonly string[] | boolean | null;
    readonly readOnly: boolean;
    readonly required: boolean;
    readonly options?: readonly string[];
}

interface InspectResult {
    readonly version: string;
    readonly pageCount: number;
    readonly encrypted: boolean;
    readonly pdfaConformance: string | null;
    /** XMP `pdfxid:GTS_PDFXVersion` (e.g. `PDF/X-4`), or null (v1.5.0). */
    readonly pdfxConformance: string | null;
    readonly signatures: number;
    readonly metadata: {
        readonly title: string | null;
        readonly author: string | null;
        readonly creationDate: string | null;
        readonly subject: string | null;
        readonly producer: string | null;
        /** `/Info /Trapped` (ISO 32000-1 §14.11.6) — omitted when absent. */
        readonly trapped?: 'True' | 'False' | 'Unknown';
    };
    readonly pageLabels?: readonly PageLabelInfo[];
    readonly encryption?: EncryptionDetail | null;
    readonly formFields?: readonly FormFieldInfo[];
    readonly pages?: readonly PageInfo[];
    readonly annotations?: readonly AnnotationInfo[];
    readonly pdfua?: {
        readonly valid: boolean;
        readonly errors: readonly string[];
        readonly warnings: readonly string[];
    };
    /** `--pdfx` / `--check pdfx`: pdfnative's structural ISO 15930-7 validator (v1.5.0). */
    readonly pdfx?: {
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

/** The PDF/X claim from XMP (`<pdfxid:GTS_PDFXVersion>PDF/X-4</…>`), or null. */
function extractPdfxConformance(reader: PdfReader): string | null {
    const xmp = readXmp(reader);
    if (xmp === null) return null;
    const element = /<pdfxid:GTS_PDFXVersion>\s*([^<]+?)\s*<\/pdfxid:GTS_PDFXVersion>/.exec(xmp)?.[1];
    if (element !== undefined) return element;
    const attribute = /\bpdfxid:GTS_PDFXVersion="([^"]+)"/.exec(xmp)?.[1];
    return attribute ?? null;
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
            if (!(field instanceof Map)) continue;
            const ft = field.get('FT');
            if (ft !== undefined && nameValue(ft) === 'Sig') {
                count++;
            }
        }
        return count;
    } catch {
        return 0;
    }
}

/** Read a `[x1 y1 x2 y2]` page-box entry from the page dict, or undefined.
 *  No /Pages-tree inheritance is attempted — consistent with the MediaBox
 *  handling above, and the production boxes are not inheritable anyway
 *  (only MediaBox/CropBox/Rotate/Resources are, ISO 32000-1 §7.7.3.4). */
function readPageBox(reader: PdfReader, page: PdfDict, key: string): readonly number[] | undefined {
    const raw = page.get(key);
    if (raw === undefined) return undefined;
    let value: unknown;
    try {
        value = reader.resolveValue(raw as Parameters<PdfReader['resolveValue']>[0]);
    } catch {
        return undefined;
    }
    if (!Array.isArray(value) || value.length !== 4) return undefined;
    return value.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? (value as readonly number[])
        : undefined;
}

/** Read the page's `/UserUnit` (positive finite number), or undefined. */
function readUserUnit(reader: PdfReader, page: PdfDict): number | undefined {
    const raw = page.get('UserUnit');
    if (raw === undefined) return undefined;
    let value: unknown;
    try {
        value = reader.resolveValue(raw as Parameters<PdfReader['resolveValue']>[0]);
    } catch {
        return undefined;
    }
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Read `/Info /Trapped` (a PDF *name*: /True, /False or /Unknown), or undefined. */
function readTrapped(info: PdfDict | null): 'True' | 'False' | 'Unknown' | undefined {
    if (info === null) return undefined;
    const raw = info.get('Trapped');
    if (raw === undefined) return undefined;
    const v = nameValue(raw);
    return v === 'True' || v === 'False' || v === 'Unknown' ? v : undefined;
}

/** Project a pdfnative signature entry to the stable CLI shape (never the raw /Contents bytes). */
function toSignatureDetail(s: PdfSignatureInfo): SignatureDetail {
    return {
        fieldName: s.fieldName ?? null,
        subFilter: s.subFilter,
        byteRange: s.byteRange,
        isDocTimestamp: s.isDocTimestamp,
        isPlaceholder: s.isPlaceholder,
        sigObjNum: s.sigObjNum,
        contentsLength: s.contents.length,
    };
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
                    if (annot instanceof Map) {
                        const subtype = annot.get('Subtype');
                        if (subtype !== undefined && nameValue(subtype) === 'Widget') {
                            formFields++;
                        }
                    }
                } catch {
                    // best-effort — keep counting other annotations
                }
            }
        }
        const cropBox = readPageBox(reader, page, 'CropBox');
        const trimBox = readPageBox(reader, page, 'TrimBox');
        const bleedBox = readPageBox(reader, page, 'BleedBox');
        const artBox = readPageBox(reader, page, 'ArtBox');
        const userUnit = readUserUnit(reader, page);
        out.push({
            index: i,
            width,
            height,
            rotation,
            annotations,
            formFields,
            ...(cropBox !== undefined ? { cropBox } : {}),
            ...(trimBox !== undefined ? { trimBox } : {}),
            ...(bleedBox !== undefined ? { bleedBox } : {}),
            ...(artBox !== undefined ? { artBox } : {}),
            ...(userUnit !== undefined ? { userUnit } : {}),
        });
    }
    return out;
}

function runPdfUaCheck(bytes: Uint8Array): NonNullable<InspectResult['pdfua']> {
    const res: PdfUAValidationResult = validatePdfUA(bytes);
    return { valid: res.valid, errors: res.errors, warnings: res.warnings };
}

/**
 * pdfnative 1.8.0 `validatePdfX()`: the structural PDF/X-4 prerequisites
 * (header, XMP identification, OutputIntent profile, page boxes, embedded
 * fonts, annotations, actions, embedded files, OPI/PostScript/reference
 * XObjects, LZW, transfer functions, device colour). veraPDF does not cover
 * PDF/X; a `valid` result is not a certified preflight.
 */
function runPdfXCheck(bytes: Uint8Array): NonNullable<InspectResult['pdfx']> {
    const res: PdfXValidationResult = validatePdfX(bytes);
    return { valid: res.valid, errors: res.errors, warnings: res.warnings };
}

/** Read the document's /PageLabels number tree (pdfnative 1.5.0), or undefined. */
function inspectPageLabels(reader: PdfReader): readonly PageLabelInfo[] | undefined {
    let ranges: PageLabelRange[] | null;
    try {
        ranges = reader.getPageLabels();
    } catch {
        return undefined;
    }
    if (ranges === null || ranges.length === 0) return undefined;
    return ranges.map((r) => ({
        startPage: r.startPage,
        style: r.style ?? null,
        prefix: r.prefix ?? null,
        start: r.start ?? null,
    }));
}

/** Report the document's encryption scheme (pdfnative 1.6.0), or null. */
function inspectEncryption(reader: PdfReader): EncryptionDetail | null {
    const enc: PdfEncryptionInfo | null = reader.encryption;
    if (enc === null) return null;
    return { algorithm: enc.algorithm, revision: enc.revision, authenticatedAs: enc.authenticatedAs };
}

/** Enumerate interactive form fields (pdfnative 1.6.0 `readFormFields`). */
function inspectFormFields(bytes: Uint8Array, password: string | undefined): readonly FormFieldInfo[] {
    const fields = readFormFields(bytes, password !== undefined ? { password } : undefined);
    return fields.map((f) => ({
        name: f.name,
        type: f.type,
        value: f.value,
        readOnly: f.readOnly,
        required: f.required,
        ...(f.options !== undefined ? { options: f.options.map((o) => o.export) } : {}),
    }));
}

/** Read markup / link annotations across all pages (pdfnative 1.5.0). */
function inspectAnnotations(reader: PdfReader): readonly AnnotationInfo[] {
    const out: AnnotationInfo[] = [];
    for (let i = 0; i < reader.pageCount; i++) {
        let annots: ParsedAnnotation[];
        try {
            annots = reader.getAnnotations(i);
        } catch {
            continue;
        }
        for (const a of annots) {
            out.push({
                page: i + 1,
                subtype: a.subtype,
                contents: a.contents ?? null,
                title: a.title ?? null,
                url: a.url ?? null,
            });
        }
    }
    return out;
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
        pdfx: result.pdfxConformance,
    };
}

function evaluateChecks(
    checks: readonly string[],
    result: InspectResult,
    signedCount: number,
): CheckResult {
    const out: { name: string; passed: boolean }[] = [];
    for (const c of checks) {
        const sigCount = SIG_COUNT_CHECK.exec(c);
        if (!VALID_CHECKS.has(c) && sigCount === null) {
            throw new CliError(
                `Invalid --check value "${c}". Valid: ${[...VALID_CHECKS].join(', ')}, signatures>=N.`,
                2,
            );
        }
        if (c === 'pdfa') out.push({ name: c, passed: result.pdfaConformance !== null });
        if (c === 'signed') out.push({ name: c, passed: signedCount > 0 });
        if (c === 'encrypted') out.push({ name: c, passed: result.encrypted });
        if (c === 'pdfua') out.push({ name: c, passed: result.pdfua?.valid === true });
        if (c === 'pdfx') out.push({ name: c, passed: result.pdfx?.valid === true });
        if (sigCount !== null) {
            const wanted = Number.parseInt(sigCount[1] as string, 10);
            out.push({ name: c, passed: signedCount >= wanted });
        }
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
    const includeAnnotations = hasFlag(args.flags, 'annotations');
    const includeFormFields = hasFlag(args.flags, 'form-fields');
    const includeEncryption = hasFlag(args.flags, 'encryption');
    const includeSignatures = hasFlag(args.flags, 'signatures');
    const password = resolveSourcePassword(args.flags);
    const checks = getStringFlagAll(args.flags, 'check');
    const includePdfua = hasFlag(args.flags, 'pdfua') || checks.includes('pdfua');
    const includePdfx = hasFlag(args.flags, 'pdfx') || checks.includes('pdfx');
    // v1.5.0: normalise /Info dates (D:YYYYMMDDHHmmSS+HH'mm') to ISO 8601.
    const isoDates = hasFlag(args.flags, 'iso-dates');

    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let reader: PdfReader;
    try {
        reader = openPdf(pdfBytes, password !== undefined ? { password } : undefined);
    } catch (e) {
        throw mapPdfError(e, 'Failed to read PDF');
    }

    const info = reader.getInfo();
    const trapped = readTrapped(info);
    const rawCreationDate = info !== null ? safeInfoString(info.get('CreationDate')) : null;
    const baseResult: InspectResult = {
        version: extractVersion(reader),
        pageCount: reader.pageCount,
        encrypted: extractEncrypted(reader),
        pdfaConformance: extractPdfaConformance(reader),
        pdfxConformance: extractPdfxConformance(reader),
        signatures: countSignatures(reader),
        metadata: {
            title: info !== null ? safeInfoString(info.get('Title')) : null,
            author: info !== null ? safeInfoString(info.get('Author')) : null,
            creationDate: rawCreationDate !== null && isoDates ? pdfDateToIso(rawCreationDate) : rawCreationDate,
            subject: info !== null ? safeInfoString(info.get('Subject')) : null,
            producer: info !== null ? safeInfoString(info.get('Producer')) : null,
            ...(trapped !== undefined ? { trapped } : {}),
        },
    };

    // --signatures / signature-count checks: enumerate the signature fields via
    // pdfnative 1.7.0 `listSignatures`. Non-placeholder, non-timestamp entries
    // are what `--check signed` / `--check "signatures>=N"` count. When only a
    // check needs the count and enumeration fails (e.g. an encryption scheme the
    // standalone lister cannot open), fall back to the legacy /Sig field count.
    const sigCountChecks = checks.filter((c) => c === 'signed' || SIG_COUNT_CHECK.test(c));
    let signatureDetails: readonly SignatureDetail[] | undefined;
    let signedCount = baseResult.signatures;
    if (includeSignatures || sigCountChecks.length > 0) {
        try {
            signatureDetails = listSignatures(pdfBytes).map(toSignatureDetail);
            signedCount = signatureDetails.filter((s) => !s.isPlaceholder && !s.isDocTimestamp).length;
        } catch (e) {
            if (includeSignatures) throw mapPdfError(e, 'Failed to list signatures');
        }
    }

    const pageLabels = inspectPageLabels(reader);
    let formFields: readonly FormFieldInfo[] | undefined;
    if (includeFormFields) {
        try {
            formFields = inspectFormFields(pdfBytes, password);
        } catch (e) {
            throw mapPdfError(e, 'Failed to read form fields');
        }
    }
    const result: InspectResult = {
        ...baseResult,
        ...(pageLabels !== undefined ? { pageLabels } : {}),
        ...(includeEncryption ? { encryption: inspectEncryption(reader) } : {}),
        ...(formFields !== undefined ? { formFields } : {}),
        ...(includePages ? { pages: inspectPages(reader) } : {}),
        ...(includeAnnotations ? { annotations: inspectAnnotations(reader) } : {}),
        ...(includePdfua ? { pdfua: runPdfUaCheck(pdfBytes) } : {}),
        ...(includePdfx ? { pdfx: runPdfXCheck(pdfBytes) } : {}),
        ...(verbose ? { verbose: buildVerbose(reader) } : {}),
    };

    if (format === 'json') {
        const summary = hasFlag(args.flags, 'summary');
        const fieldsRaw = getStringFlag(args.flags, 'fields');
        // With --signatures the top-level `signatures` field carries the
        // detailed entries instead of the bare count (opt-in shape change; the
        // --summary verdict keeps its stable numeric `signatures`).
        let out: unknown = summary
            ? toInspectSummary(result)
            : (includeSignatures && signatureDetails !== undefined
                ? { ...result, signatures: signatureDetails }
                : result);
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
            `PDF/X:          ${result.pdfxConformance ?? 'none'}`,
            `Signatures:     ${result.signatures}`,
            `Title:          ${result.metadata.title ?? '—'}`,
            `Author:         ${result.metadata.author ?? '—'}`,
            `Created:        ${result.metadata.creationDate ?? '—'}`,
            `Subject:        ${result.metadata.subject ?? '—'}`,
            `Producer:       ${result.metadata.producer ?? '—'}`,
        ];
        if (result.metadata.trapped !== undefined) {
            lines.push(`Trapped:        ${result.metadata.trapped}`);
        }
        if (includeSignatures && signatureDetails !== undefined) {
            lines.push('Signatures detail:');
            for (let i = 0; i < signatureDetails.length; i++) {
                const s = signatureDetails[i] as SignatureDetail;
                const tags = [
                    s.isDocTimestamp ? 'doc-timestamp' : '',
                    s.isPlaceholder ? 'placeholder' : '',
                ].filter((t) => t !== '').join(', ');
                lines.push(
                    `  #${i + 1} ${s.fieldName ?? '(unnamed)'} [${s.subFilter !== '' ? s.subFilter : '?'}] contents=${s.contentsLength}B obj=${s.sigObjNum}${tags !== '' ? ` (${tags})` : ''}`,
                );
            }
        }
        if (result.pages !== undefined) {
            lines.push('Pages detail:');
            for (const p of result.pages) {
                const extras: string[] = [];
                if (p.cropBox !== undefined) extras.push(`crop=[${p.cropBox.join(' ')}]`);
                if (p.trimBox !== undefined) extras.push(`trim=[${p.trimBox.join(' ')}]`);
                if (p.bleedBox !== undefined) extras.push(`bleed=[${p.bleedBox.join(' ')}]`);
                if (p.artBox !== undefined) extras.push(`art=[${p.artBox.join(' ')}]`);
                if (p.userUnit !== undefined) extras.push(`userUnit=${p.userUnit}`);
                lines.push(
                    `  #${p.index + 1}: ${p.width ?? '?'}x${p.height ?? '?'}pt rot=${p.rotation}° annots=${p.annotations} fields=${p.formFields}${extras.length > 0 ? ` ${extras.join(' ')}` : ''}`,
                );
            }
        }
        if (result.encryption !== undefined) {
            if (result.encryption === null) {
                lines.push('Encryption:     none');
            } else {
                lines.push(
                    `Encryption:     ${result.encryption.algorithm} (R${result.encryption.revision}, opened as ${result.encryption.authenticatedAs})`,
                );
            }
        }
        if (result.formFields !== undefined) {
            lines.push(`Form fields:    ${result.formFields.length}`);
            for (const f of result.formFields) {
                const flags = [f.required ? 'required' : '', f.readOnly ? 'read-only' : ''].filter((s) => s !== '').join(', ');
                const val = f.value === null ? '' : Array.isArray(f.value) ? f.value.join('|') : String(f.value);
                lines.push(`  ${f.name} [${f.type}]${val !== '' ? ` = ${val}` : ''}${flags !== '' ? ` (${flags})` : ''}`);
            }
        }
        if (result.pageLabels !== undefined) {
            lines.push('Page labels:');
            for (const l of result.pageLabels) {
                lines.push(
                    `  from #${l.startPage + 1}: style=${l.style ?? 'none'}${l.prefix !== null ? ` prefix="${l.prefix}"` : ''}${l.start !== null ? ` start=${l.start}` : ''}`,
                );
            }
        }
        if (result.annotations !== undefined) {
            lines.push(`Annotations:    ${result.annotations.length}`);
            for (const a of result.annotations) {
                const detail = a.url ?? a.contents ?? a.title ?? '';
                lines.push(`  page ${a.page} ${a.subtype}${detail !== '' ? `: ${detail}` : ''}`);
            }
        }
        if (result.pdfua !== undefined) {
            lines.push(`PDF/UA:         ${result.pdfua.valid ? 'valid' : 'invalid'}`);
            for (const err of result.pdfua.errors) lines.push(`  error:   ${err}`);
            for (const warn of result.pdfua.warnings) lines.push(`  warning: ${warn}`);
        }
        if (result.pdfx !== undefined) {
            lines.push(`PDF/X check:    ${result.pdfx.valid ? 'valid' : 'invalid'} (structural, ISO 15930-7)`);
            for (const err of result.pdfx.errors) lines.push(`  error:   ${err}`);
            for (const warn of result.pdfx.warnings) lines.push(`  warning: ${warn}`);
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
        const evaluation = evaluateChecks(checks, result, signedCount);
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
