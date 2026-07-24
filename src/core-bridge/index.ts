// Selective re-exports from pdfnative — keeps the CLI surface minimal.
// All PDF logic lives in pdfnative; this module is the only import point.

// ── Render (free-form documents) ─────────────────────────────────────
export { buildDocumentPDFBytes, buildDocumentPDFStream } from 'pdfnative';

// ── Render (table-centric, --variant table) ──────────────────────────
export { buildPDFBytes, buildPDFStream } from 'pdfnative';

// ── Render (page-by-page streaming, v1.2.0) ──────────────────────────
export { buildDocumentPDFStreamPageByPage, buildPDFStreamPageByPage } from 'pdfnative';
// ── Render (true constant-memory streaming, v1.3.0) ──────────────
export { buildDocumentPDFStreamTrue, buildPDFStreamTrue } from 'pdfnative';

// ── PDF/A conformance targets (single source of truth, v1.2.0) ───────
export { PDF_A_CONFORMANCE_TARGETS } from 'pdfnative';

// ── Compression bootstrap (Node Flate) ───────────────────────────────
export { initNodeCompression } from 'pdfnative';

// ── Sign ─────────────────────────────────────────────────────────────
export { signPdfBytes, buildSigDict, addSignaturePlaceholder } from 'pdfnative';
export { parseRsaPrivateKey, parseCertificate } from 'pdfnative';

// ── Sign — native constant-time crypto provider (v1.4.0) ─────────────
// Lets the CLI route CMS signing through node:crypto instead of the pure-JS
// RSA/ECDSA math, for constant-time (side-channel-resistant) signatures.
export { setCryptoProvider, getCryptoProvider } from 'pdfnative';
export type { CryptoProvider } from 'pdfnative';

// ── One-time async crypto bootstrap (initCrypto must run before any
// RSA / ECDSA key parsing or CMS verification). pdfnative throws
// "ASN.1 module must be imported before RSA key parsing" otherwise.
import { initCrypto as _pnInitCrypto } from 'pdfnative';
let _cryptoReady: Promise<void> | null = null;
export function ensureCryptoReady(): Promise<void> {
    if (_cryptoReady === null) _cryptoReady = _pnInitCrypto();
    return _cryptoReady;
}

// ── Verify ───────────────────────────────────────────────────────────
export {
    derDecode,
    verifyCertSignature,
    isSelfSigned,
    rsaVerifyHash,
    ecdsaVerify,
    decodeEcPublicKey,
} from 'pdfnative';

// ── Inspect / Verify — PDF parser helpers ────────────────────────────
export { openPdf, isRef, isName, isDict, isArray, isStream, nameValue } from 'pdfnative';

// ── Page-tree manipulation — merge / split / extract (v1.4.0) ─────────
export { mergePdfs, splitPdf, extractPages } from 'pdfnative';
export type { PageRange, MergeOptions } from 'pdfnative';

// ── Streaming page-tree — constant-memory merge/split/extract (v1.6.0) ─
export { streamMergedPdfs, streamSplitPdf, streamExtractPages } from 'pdfnative';
export type { StreamMergeOptions, SplitPdfStream, PdfSourceInput } from 'pdfnative';

// ── Encryption / decryption on read + re-encryption (v1.6.0) ──────────
// `openPdf` (below) gained an { password } option; `reader.encryption`
// surfaces the Standard Security Handler details. `MergeOptions.encrypt`
// (above) re-encrypts page-tree output with AES-128/256.
export { PdfPasswordError, PdfEncryptionUnsupportedError } from 'pdfnative';
export type { OpenPdfOptions, PdfEncryptionInfo } from 'pdfnative';
// Note: `EncryptionOptions` is already re-exported below in the shared types block.

// ── Text extraction — reading-order Unicode + positioned runs (v1.6.0) ─
export { extractText } from 'pdfnative';
export type { ExtractTextOptions, ExtractedPageText, ExtractedTextRun } from 'pdfnative';

// ── AcroForm fill & flatten of existing PDFs (v1.6.0) ─────────────────
export { readFormFields, fillForm, flattenForm } from 'pdfnative';
export {
    FormFieldNotFoundError,
    FormValueTypeError,
    FormUnsupportedError,
} from 'pdfnative';
export type {
    ParsedFormField,
    ParsedFieldType,
    FormFillValue,
    FillFormOptions,
    FlattenFormOptions,
} from 'pdfnative';

// ── Native vector charts — document `chart` block (v1.6.0) ────────────
export type { ChartBlock, ChartSeries, ChartType } from 'pdfnative';

// ── Incremental modifier + markup annotations (v1.5.0) ───────────────
export { createModifier } from 'pdfnative';
export { buildAnnotation, buildAnnotationBody } from 'pdfnative';
export type { PdfModifier } from 'pdfnative';
export type {
    AnnotationRect,
    AnnotationBase,
    TextAnnotation,
    TextMarkupAnnotation,
    ShapeAnnotation,
    LineAnnotation,
    FreeTextAnnotation,
    MarkupAnnotation,
    ParsedAnnotation,
} from 'pdfnative';

// ── Layout inspection + debug overlay (v1.5.0) ───────────────────────
export { inspectDocumentLayout } from 'pdfnative';
export type {
    LayoutInspection,
    InspectedPage,
    InspectedBlock,
    LayoutDebugOptions,
} from 'pdfnative';

// ── Inspect — PDF/UA structural validator (ISO 14289-1, v1.3.0) ──────
export { validatePdfUA } from 'pdfnative';

// ── Fonts (multi-language --lang flag, v1.1.0 latin/emoji modules) ──
export { registerFont, registerFonts, loadFontData, hasFontLoader } from 'pdfnative';

// ── Types ────────────────────────────────────────────────────────────
export type {
    DocumentParams,
    PdfParams,
    PdfLayoutOptions,
    PdfColor,
    PdfColors,
    PageTemplate,
    WatermarkOptions,
    EncryptionOptions,
    PdfAttachment,
    PdfAttachmentRelationship,
    StreamOptions,
    FontEntry,
    OutlineItem,
    PageLabelRange,
    PageLabelStyle,
} from 'pdfnative';

export type {
    PdfSignOptions,
    SignatureAlgorithm,
    AddSignaturePlaceholderOptions,
    SigDictMetadata,
    PdfAConformanceTarget,
    X509Certificate,
    X509Name,
    RsaPrivateKey,
    EcPrivateKey,
    EcPublicKey,
    Asn1Node,
} from 'pdfnative';

export type { PdfReader, PdfValue, PdfName, PdfRef, PdfStream } from 'pdfnative';
export type { ParsedDict as PdfDict, ParsedArray as PdfArray } from 'pdfnative';
export type { PdfUAValidationResult } from 'pdfnative';
