// `pdfnative annotate` — attach markup annotations to an existing PDF
// (pdfnative 1.5.0 annotation API + incremental modifier). The annotations are
// described by a JSON array (`--annotations <file>`), each entry being a markup
// annotation plus a 1-based `page`. The document is updated with an incremental
// save, so the original bytes are preserved (existing signatures stay intact).
// Encrypted documents are supported via --password / $PDFNATIVE_PASSWORD: the
// reader decrypts transparently and the modifier re-encrypts the appended
// annotation objects under the source's existing scheme (createModifier itself
// takes no password — the { password } option rides on openPdf).

import {
    openPdf,
    createModifier,
    buildAnnotationBody,
    validateURL,
} from '../core-bridge/index.js';
import type { MarkupAnnotation, AnnotationRect } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, readBinaryFile, writeOutput, assertJsonSizeLimit } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';

const ANNOTATION_TYPES = new Set([
    'text', 'highlight', 'underline', 'strikeout', 'squiggly',
    'square', 'circle', 'line', 'freetext',
    // v1.5.0 — /Link with a URI action (ROADMAP item "link annotations on existing PDFs")
    'link',
]);

/** A `link` entry: an external URI over a click rectangle (ISO 32000-1 §12.5.6.5 / §12.6.4.7). */
interface LinkSpec {
    readonly url: string;
    readonly rect: AnnotationRect;
}

interface AnnotationSpec {
    readonly page: number; // 1-based
    readonly annotation: MarkupAnnotation | null;
    /** Set for `type: "link"`; the CLI builds the /Link dictionary itself. */
    readonly link: LinkSpec | null;
}

/** Numbers in a PDF dictionary: no exponent, at most two decimals (ISO 32000-1 §7.3.3). */
function fmtNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Escape a URL for a PDF literal string (ISO 32000-1 §7.3.4.2). `validateURL`
 * has already rejected control characters and non-http(s)/mailto schemes.
 */
function escapeUrlForPdf(url: string): string {
    return url.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * The /Link dictionary body for `PdfModifier.addAnnotation()`. pdfnative's own
 * `buildLinkAnnotation()` returns a complete indirect object (`N 0 obj … endobj`)
 * for the document builder, whereas the modifier takes a dictionary body, so
 * the CLI emits the same dictionary (Border 0, Print flag, URI action) itself
 * with the engine's `validateURL` as the security boundary.
 */
function buildLinkBody(link: LinkSpec): string {
    const [x1, y1, x2, y2] = link.rect;
    return `<< /Type /Annot /Subtype /Link /Rect [${fmtNum(x1)} ${fmtNum(y1)} ${fmtNum(x2)} ${fmtNum(y2)}] `
        + `/Border [0 0 0] /F 4 /A << /Type /Action /S /URI /URI (${escapeUrlForPdf(link.url)}) >> >>`;
}

function isNumberArray(value: unknown, length: number): boolean {
    return Array.isArray(value)
        && value.length === length
        && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Validate + narrow one raw annotation entry into a typed {@link AnnotationSpec}. */
function parseAnnotationEntry(raw: unknown, index: number): AnnotationSpec {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new CliError(`Annotation #${index + 1} must be an object.`, 1, ErrorCode.INPUT);
    }
    const obj = raw as Record<string, unknown>;

    const page = obj['page'];
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
        throw new CliError(`Annotation #${index + 1} needs a 1-based integer "page".`, 1, ErrorCode.INPUT);
    }

    const type = obj['type'];
    if (typeof type !== 'string' || !ANNOTATION_TYPES.has(type)) {
        throw new CliError(
            `Annotation #${index + 1} has invalid "type" (got ${JSON.stringify(type)}). `
            + `Valid: ${[...ANNOTATION_TYPES].join(', ')}.`,
            1,
            ErrorCode.INPUT,
        );
    }

    if (!isNumberArray(obj['rect'], 4)) {
        throw new CliError(
            `Annotation #${index + 1} needs "rect": [x1, y1, x2, y2] (four numbers).`,
            1,
            ErrorCode.INPUT,
        );
    }

    if (type === 'link') {
        const url = obj['url'];
        if (typeof url !== 'string' || url.trim().length === 0) {
            throw new CliError(`Link annotation #${index + 1} needs a "url" (http:, https: or mailto:).`, 1, ErrorCode.INPUT);
        }
        if (!validateURL(url)) {
            throw new CliError(
                `Link annotation #${index + 1}: blocked URL — only http:, https: and mailto: schemes without control characters are allowed.`,
                1,
                ErrorCode.INPUT,
            );
        }
        return { page, annotation: null, link: { url, rect: obj['rect'] as AnnotationRect } };
    }

    if (type === 'line' && (!isNumberArray(obj['start'], 2) || !isNumberArray(obj['end'], 2))) {
        throw new CliError(
            `Line annotation #${index + 1} needs "start": [x, y] and "end": [x, y].`,
            1,
            ErrorCode.INPUT,
        );
    }

    // Re-key only the fields pdfnative's builders understand — never spread the
    // raw object, so unexpected keys can't leak into the emitted dictionary.
    const rect = obj['rect'] as AnnotationRect;
    const base: Record<string, unknown> = { type, rect };
    for (const key of ['contents', 'color', 'opacity', 'title', 'modified', 'flags'] as const) {
        if (obj[key] !== undefined) base[key] = obj[key];
    }
    if (type === 'text') {
        if (obj['open'] !== undefined) base['open'] = obj['open'];
        if (obj['icon'] !== undefined) base['icon'] = obj['icon'];
    } else if (type === 'highlight' || type === 'underline' || type === 'strikeout' || type === 'squiggly') {
        if (obj['quadPoints'] !== undefined) base['quadPoints'] = obj['quadPoints'];
    } else if (type === 'square' || type === 'circle') {
        if (obj['interiorColor'] !== undefined) base['interiorColor'] = obj['interiorColor'];
        if (obj['borderWidth'] !== undefined) base['borderWidth'] = obj['borderWidth'];
    } else if (type === 'line') {
        base['start'] = obj['start'];
        base['end'] = obj['end'];
        if (obj['borderWidth'] !== undefined) base['borderWidth'] = obj['borderWidth'];
    } else if (type === 'freetext') {
        if (obj['fontSize'] !== undefined) base['fontSize'] = obj['fontSize'];
    }

    return { page, annotation: base as unknown as MarkupAnnotation, link: null };
}

function parseAnnotationsJson(text: string): AnnotationSpec[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --annotations JSON: ${message}`, 1, ErrorCode.PARSE);
    }
    // Accept either a bare array or { annotations: [...] }.
    const list = Array.isArray(parsed)
        ? parsed
        : (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>)['annotations'])
            ? (parsed as Record<string, unknown>)['annotations'] as unknown[]
            : null);
    if (list === null) {
        throw new CliError(
            '--annotations must be a JSON array (or { "annotations": [...] }).',
            1,
            ErrorCode.INPUT,
        );
    }
    if (list.length === 0) {
        throw new CliError('--annotations contains no annotations.', 1, ErrorCode.INPUT);
    }
    return list.map((entry, i) => parseAnnotationEntry(entry, i));
}

export async function annotate(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const annotationsPath = getStringFlag(args.flags, 'annotations');
    const password = resolveSourcePassword(args.flags);
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (annotationsPath === undefined) {
        throw new CliError('annotate requires --annotations <file.json>.', 2);
    }

    const annBuf = await readBinaryFile(annotationsPath);
    assertJsonSizeLimit(Buffer.from(annBuf));
    const specs = parseAnnotationsJson(new TextDecoder('utf-8', { fatal: false }).decode(annBuf));

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    const reader = (() => {
        try {
            return openPdf(pdfBytes, password !== undefined ? { password } : undefined);
        } catch (e) {
            // Wrong/missing password → E_PASSWORD; unsupported scheme →
            // E_UNSUPPORTED; anything else → E_PARSE. Never echoes the password.
            throw mapPdfError(e, 'Failed to read PDF');
        }
    })();

    // Bounds-check every page reference before touching the document.
    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i] as AnnotationSpec;
        if (spec.page > reader.pageCount) {
            throw new CliError(
                `Annotation #${i + 1} targets page ${spec.page}, but the document has ${reader.pageCount} page(s).`,
                1,
                ErrorCode.INPUT,
            );
        }
    }

    if (dryRun) {
        emitStatus({ command: 'annotate', dryRun: true, annotations: specs.length, output: outputPath ?? '-' });
        return;
    }

    const modifier = createModifier(reader);
    for (const spec of specs) {
        const body = spec.link !== null
            ? buildLinkBody(spec.link)
            : buildAnnotationBody(spec.annotation as MarkupAnnotation);
        modifier.addAnnotation(spec.page - 1, body);
    }

    let outBytes: Uint8Array;
    try {
        outBytes = modifier.save();
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to write annotated PDF: ${message}`, 1, ErrorCode.RUNTIME);
    }

    await writeOutput(outBytes, outputPath);
    emitStatus({
        command: 'annotate',
        dryRun: false,
        annotations: specs.length,
        output: outputPath ?? '-',
        bytes: outBytes.length,
    });
}
