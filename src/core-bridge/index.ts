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

// ── PAdES B-T — RFC 3161 timestamped signing (pdfnative 1.7.0) ───────
// The engine never opens a socket: the CLI injects a TimestampProvider
// built on the SSRF-guarded fetch (src/utils/tsa.ts).
export { signPdfBytesWithTimestamp, estimateContentsSize } from 'pdfnative';
export { setTimestampProvider, getTimestampProvider } from 'pdfnative';
export type { PdfSignTimestampOptions, TimestampProvider } from 'pdfnative';

// ── PAdES B-LT — /DSS + /VRI long-term validation (pdfnative 1.7.0) ──
// collectValidationInfo needs a RevocationProvider (network, injected by
// the CLI); embedValidationInfo is synchronous and offline by design.
export { collectValidationInfo, embedValidationInfo, addValidationInfo, vriKeyForContents } from 'pdfnative';
export { setRevocationProvider, getRevocationProvider } from 'pdfnative';
export type { LtvData, CollectLtvOptions, RevocationProvider } from 'pdfnative';

// ── PAdES B-LTA — document timestamps (pdfnative 1.7.0) ──────────────
export { addDocumentTimestamp } from 'pdfnative';
export type { AddDocumentTimestampOptions } from 'pdfnative';

// ── Signature inventory + multi-signature options (pdfnative 1.7.0) ──
export { listSignatures } from 'pdfnative';
export type { PdfSignatureInfo, CmsDigestAlgorithm, CmsProfile, RsaDigest } from 'pdfnative';

// ── RFC 3161 token parsing — /DocTimeStamp validation in verify ──────
export { buildTimestampRequest, parseTimestampResponse, parseTimestampToken, verifyTimestampImprint } from 'pdfnative';
export type { TimestampResponse, TstInfo } from 'pdfnative';

// ── Incremental metadata update (pdfnative 1.7.0) ────────────────────
export type { PdfMetadataUpdate } from 'pdfnative';

// ── Print production + PDF/A diagnostics + viewer prefs (1.7.0) ──────
export type {
    PrintOptions,
    PrinterMarksOptions,
    PageBox,
    CustomOutputIntent,
    ViewerPreferences,
    DocumentMetadata,
    PdfDiagnostic,
    PdfDiagnosticCode,
    PdfDiagnosticHandler,
} from 'pdfnative';

// ── Document image blocks — CLI resolves src / dataBase64 to bytes ───
export type { ImageBlock, DocumentBlock } from 'pdfnative';

// ── PDF/X-4 conformance + structural validator (pdfnative 1.8.0) ─────
// PDF_X_CONFORMANCE_TARGETS feeds `render --pdfx` the way
// PDF_A_CONFORMANCE_TARGETS feeds `--tagged`; validatePdfX mirrors
// validatePdfUA for `inspect --pdfx` / `--check pdfx`. The validator is
// structural (ISO 15930-7 prerequisites) — veraPDF does not cover PDF/X.
export { PDF_X_CONFORMANCE_TARGETS, validatePdfX } from 'pdfnative';
export type { PdfXConformanceTarget, PdfXValidationResult, ColourBarOptions } from 'pdfnative';

// ── Reproducible builds — pinned creation instant (pdfnative 1.8.0) ──
// Set once per process from `--creation-date` / SOURCE_DATE_EPOCH; the
// per-render `layout.creationDate` still wins inside the engine. All
// dates are written in UTC (+00'00') since 1.8.0.
export { setDefaultCreationDate, getDefaultCreationDate } from 'pdfnative';

// ── Typography — layout.typography passthrough + flags (pdfnative 1.8.0)
export type {
    TypographyOptions,
    UnitBindingOptions,
    PunctuationSpacingRule,
    PunctuationSpacingPreset,
    Base14Metrics,
} from 'pdfnative';

// ── CMYK colour inputs (pdfnative 1.8.0) — PdfColor (above) now spans
// RGB and CMYK; the tuple/string aliases type the usage/schema helpers.
export type { PdfCmykTuple, PdfCmykString } from 'pdfnative';

// ── Link annotations on existing PDFs — `annotate` type "link" ──────
// validateURL is the scheme allow-list (http/https/mailto, no control
// characters); the CLI builds the /Link dictionary body itself because
// PdfModifier.addAnnotation() takes a dictionary body, not a full object.
export { validateURL } from 'pdfnative';
export type { LinkAnnotation } from 'pdfnative';

// ── Universal Shaping Engine Unicode version — `doctor` (pdfnative 1.8.0)
export { USE_UNICODE_VERSION } from 'pdfnative';

// ── Custom fonts — `render --font-file` (pdfnative 1.8.0) ─────────────
// validateFontData guards the parsed object; parseFontData lives in the
// `pdfnative/tools` subpath export (same package — still the single
// bridge). tsup keeps `pdfnative` external, so this costs nothing in the
// bundle.
export { validateFontData } from 'pdfnative';
export type { FontValidationResult, FontData } from 'pdfnative';
export { parseFontData } from 'pdfnative/tools';
export type { FontDataObject, ParseFontDataOptions } from 'pdfnative/tools';

// ── Untrusted-input inflate cap (anti zip-bomb, --max-inflate-size) ──
export { setMaxInflateOutputSize, getMaxInflateOutputSize, DEFAULT_MAX_INFLATE_OUTPUT } from 'pdfnative';

// ── DER / hash / RSA primitives — consumed by tests/helpers/mock-pki
// (offline TSA + OCSP/CRL responders) and the LTV plumbing. Kept in the
// bridge so tests never import 'pdfnative' directly.
export { derSequence, derSetOf, derOid, derInteger, derBitString, derOctetString, derGeneralizedTime } from 'pdfnative';
export { sha1, rsaSignHash } from 'pdfnative';
