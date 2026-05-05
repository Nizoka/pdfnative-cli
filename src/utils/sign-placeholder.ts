/**
 * PDF signature placeholder injector — ISO 32000-1 §12.8 + §7.5.6.
 *
 * pdfnative's `signPdfBytes` requires the input PDF to already contain a
 * `/Sig` dictionary with a `/Contents <00…00>` placeholder and a
 * `/ByteRange [0 0000000000 0000000000 0000000000]` placeholder. A freshly
 * `render`-ed PDF doesn't ship one (no AcroForm), so this module performs an
 * **incremental update** that:
 *
 *   1. Adds a `/Sig` indirect object with the two placeholders (built via
 *      pdfnative's `buildSigDict`).
 *   2. Adds a signature widget annotation field that references the /Sig.
 *   3. Re-emits the catalog with `/AcroForm << /Fields [F R] /SigFlags 3 >>`.
 *   4. Re-emits the first page with `/Annots [F R]` (preserving any existing
 *      annotations).
 *   5. Appends an xref subsection + trailer with `/Prev` pointing to the
 *      original `startxref` (non-destructive — original bytes are preserved).
 *
 * Security: all dictionaries are re-emitted from parsed `PdfValue`s — never
 * via raw text mutation — so malformed input cannot smuggle PDF syntax.
 *
 * @internal — exported for tests; CLI consumers go through `sign`.
 */

import {
    openPdf,
    buildSigDict,
    isRef,
    isName,
    isArray,
    isDict,
} from '../core-bridge/index.js';
import type {
    PdfRef,
    PdfDict,
    PdfArray,
    PdfValue,
    PdfSignOptions,
} from '../core-bridge/index.js';
import { CliError } from './error.js';

// Default placeholder size — matches pdfnative's DEFAULT_CONTENTS_SIZE (16 384
// bytes = 32 768 hex chars). Large enough for an RSA-2048 + EC P-256 CMS with
// a small chain. Match exactly so `signPdfBytes` doesn't reject it.
const DEFAULT_PLACEHOLDER_BYTES = 16384;

/** Serialize a parsed `PdfValue` back to PDF source. Stream values rejected. */
function serializeValue(v: PdfValue): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'string') {
        // PDF literal string — escape backslash and parens.
        return '(' + v.replace(/[\\()]/g, '\\$&') + ')';
    }
    if (isArray(v)) return '[' + (v as PdfArray).map(serializeValue).join(' ') + ']';
    if (isDict(v)) {
        const parts: string[] = [];
        for (const [k, val] of v as PdfDict) {
            parts.push(`/${k} ${serializeValue(val)}`);
        }
        return '<< ' + parts.join(' ') + ' >>';
    }
    if (isName(v)) return '/' + v.value;
    if (isRef(v)) return `${v.num} ${v.gen} R`;
    throw new CliError('Cannot inject signature placeholder: unsupported PdfValue (stream).', 1);
}

/** ASCII 8-bit-clean encode of a string into PDF byte stream. */
function asLatin1(s: string): Uint8Array {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return bytes;
}

/** Pad the xref offset field (10 digits, zero-padded). */
function padOffset(n: number): string {
    return String(n).padStart(10, '0');
}

/**
 * Detect whether the PDF already carries a sig placeholder we can reuse.
 * pdfnative's `signPdfBytes` only needs the literal `/Contents <00…0>` +
 * `/ByteRange [0 0000000000 0000000000 0000000000]` strings — we do a fast
 * substring check instead of re-parsing.
 */
export function hasSignaturePlaceholder(pdfBytes: Uint8Array): boolean {
    // Use Latin-1 view (PDF is byte-oriented; structure is ASCII).
    let s = '';
    for (let i = 0; i < Math.min(pdfBytes.length, 5_000_000); i++) {
        s += String.fromCharCode(pdfBytes[i] as number);
    }
    return s.includes('/ByteRange [0 0000000000 0000000000 0000000000]')
        && s.includes('/Contents <0');
}

interface InjectionResult {
    readonly bytes: Uint8Array;
}

/**
 * Inject a signature placeholder into a freshly-rendered PDF via incremental
 * update. Returns a NEW byte array — does not mutate the input.
 *
 * Throws `CliError` if the PDF is incompatible (encrypted, multi-page with a
 * pre-existing AcroForm collision, or missing a first page).
 */
export function injectSignaturePlaceholder(
    pdfBytes: Uint8Array,
    options: PdfSignOptions,
    placeholderBytes: number = DEFAULT_PLACEHOLDER_BYTES,
): InjectionResult {
    const reader = openPdf(pdfBytes);
    const trailer = reader.trailer;

    if (trailer.has('Encrypt')) {
        throw new CliError(
            'Cannot inject signature placeholder: PDF is encrypted. '
            + 'Decrypt first or sign before encrypting.',
            1,
        );
    }

    const rootRef = trailer.get('Root');
    if (rootRef === undefined || !isRef(rootRef)) {
        throw new CliError('Cannot inject signature placeholder: trailer has no /Root reference.', 1);
    }
    const catalog = reader.resolve(rootRef);
    if (!isDict(catalog)) {
        throw new CliError('Cannot inject signature placeholder: catalog is not a dictionary.', 1);
    }

    if (catalog.has('AcroForm')) {
        throw new CliError(
            'Cannot inject signature placeholder: PDF already has an /AcroForm. '
            + 'Existing AcroForm merging is not supported in v0.3.0.',
            1,
        );
    }

    // Locate the first page reference.
    const pages = reader.getPages();
    if (pages.length === 0) {
        throw new CliError('Cannot inject signature placeholder: PDF has no pages.', 1);
    }
    // We need the first page's REF (not its dict) to point /Annots at it and
    // re-emit it. Walk the /Pages tree manually.
    const pagesRef = catalog.get('Pages');
    if (pagesRef === undefined || !isRef(pagesRef)) {
        throw new CliError('Cannot inject signature placeholder: catalog has no /Pages reference.', 1);
    }
    const pagesDict = reader.resolve(pagesRef);
    if (!isDict(pagesDict)) {
        throw new CliError('Cannot inject signature placeholder: /Pages is not a dictionary.', 1);
    }
    const kids = pagesDict.get('Kids');
    if (kids === undefined || !isArray(kids) || kids.length === 0) {
        throw new CliError('Cannot inject signature placeholder: /Pages has no /Kids.', 1);
    }
    const firstPageRef = kids[0];
    if (firstPageRef === undefined || !isRef(firstPageRef)) {
        throw new CliError('Cannot inject signature placeholder: first page is not an indirect reference.', 1);
    }
    const firstPageDict = reader.resolve(firstPageRef);
    if (!isDict(firstPageDict)) {
        throw new CliError('Cannot inject signature placeholder: first page is not a dictionary.', 1);
    }

    // Allocate two new object numbers after the existing maximum.
    let maxNum = 0;
    for (const num of reader.xref.entries.keys()) {
        if (num > maxNum) maxNum = num;
    }
    const sigDictObjNum = maxNum + 1;
    const sigFieldObjNum = maxNum + 2;

    // Build the /Sig dictionary content via pdfnative (it owns the exact
    // /Contents + /ByteRange placeholder format that signPdfBytes scans for).
    const sigDictBody = buildSigDict(options, placeholderBytes);

    // Build the signature widget+field as a single combined annotation
    // (ISO 32000-1 §12.7.1 — fields and widgets MAY be the same object).
    const sigFieldBody =
        '<< /Type /Annot /Subtype /Widget /FT /Sig'
        + ' /T (Signature1)'
        + ` /V ${sigDictObjNum} 0 R`
        + ` /P ${firstPageRef.num} ${firstPageRef.gen} R`
        + ' /Rect [0 0 0 0]'
        + ' /F 132' // Print + Locked (no visual rendering, no UI mutation)
        + ' >>';

    // Re-emit the catalog with /AcroForm added.
    const newCatalog = new Map(catalog) as PdfDict;
    const acroFormDict = new Map<string, PdfValue>([
        ['Fields', [{ type: 'ref', num: sigFieldObjNum, gen: 0 }] satisfies PdfArray],
        ['SigFlags', 3],
    ]) as PdfDict;
    newCatalog.set('AcroForm', acroFormDict);
    const newCatalogBody = serializeValue(newCatalog);

    // Re-emit the first page with /Annots augmented.
    const newPage = new Map(firstPageDict) as PdfDict;
    const existingAnnots = newPage.get('Annots');
    const sigFieldRef: PdfRef = { type: 'ref', num: sigFieldObjNum, gen: 0 };
    const newAnnots: PdfArray
        = existingAnnots === undefined
            ? [sigFieldRef]
            : isArray(existingAnnots)
                ? [...(existingAnnots as PdfArray), sigFieldRef]
                : (() => {
                    throw new CliError(
                        'Cannot inject signature placeholder: page /Annots is not an array.',
                        1,
                    );
                })();
    newPage.set('Annots', newAnnots);
    const newPageBody = serializeValue(newPage);

    // Compose the incremental update body.
    // PDF spec requires the incremental section to start with a newline so
    // the appended objects are clearly separated from any previous content.
    const objects: Array<{ num: number; body: string; offset: number }> = [];

    let cursor = pdfBytes.length;
    // Some renderers emit no trailing newline. Ensure one.
    let prefix = '';
    if (pdfBytes[pdfBytes.length - 1] !== 0x0a) {
        prefix = '\n';
        cursor += 1;
    }

    function emit(num: number, body: string): void {
        const line = `${num} 0 obj\n${body}\nendobj\n`;
        objects.push({ num, body: line, offset: cursor });
        cursor += line.length;
    }

    emit(sigDictObjNum, sigDictBody);
    emit(sigFieldObjNum, sigFieldBody);
    emit(rootRef.num, newCatalogBody);
    emit(firstPageRef.num, newPageBody);

    // Build xref subsection. Emit ONE entry per modified/new object number.
    // Sort by object number ascending (xref subsections must be contiguous;
    // we use individual subsections per object to avoid filler).
    const sortedObjs = [...objects].sort((a, b) => a.num - b.num);
    let xrefStr = 'xref\n';
    for (const o of sortedObjs) {
        xrefStr += `${o.num} 1\n`;
        xrefStr += `${padOffset(o.offset)} 00000 n \n`;
    }

    const xrefOffset = cursor;
    const originalStartxref = findStartxref(pdfBytes);

    const newSize = maxNum + 3; // existing maxNum + sigDict + sigField (+1 for [0])

    const trailerStr =
        'trailer\n'
        + `<< /Size ${newSize}`
        + ` /Root ${rootRef.num} ${rootRef.gen} R`
        + ` /Prev ${originalStartxref}`
        + ' >>\n'
        + 'startxref\n'
        + `${xrefOffset}\n`
        + '%%EOF\n';

    const incremental = prefix
        + objects.map((o) => o.body).join('')
        + xrefStr
        + trailerStr;

    const incrementalBytes = asLatin1(incremental);
    const out = new Uint8Array(pdfBytes.length + incrementalBytes.length);
    out.set(pdfBytes, 0);
    out.set(incrementalBytes, pdfBytes.length);
    return { bytes: out };
}

/**
 * Locate the original `startxref` byte offset from the tail of the PDF.
 * We do this manually (mirrors pdfnative's `findStartxref` logic) so the
 * helper is self-contained and doesn't expand the core-bridge surface.
 */
function findStartxref(pdfBytes: Uint8Array): number {
    // Scan the last 1024 bytes for `startxref\n<num>`.
    const tailLen = Math.min(pdfBytes.length, 4096);
    let tail = '';
    for (let i = pdfBytes.length - tailLen; i < pdfBytes.length; i++) {
        tail += String.fromCharCode(pdfBytes[i] as number);
    }
    const idx = tail.lastIndexOf('startxref');
    if (idx < 0) {
        throw new CliError(
            'Cannot inject signature placeholder: original PDF has no startxref.',
            1,
        );
    }
    const after = tail.slice(idx + 'startxref'.length);
    const m = after.match(/\s*(\d+)/);
    if (m === null || m[1] === undefined) {
        throw new CliError(
            'Cannot inject signature placeholder: malformed startxref in original PDF.',
            1,
        );
    }
    return Number.parseInt(m[1], 10);
}
