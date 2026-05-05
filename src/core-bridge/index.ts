// Selective re-exports from pdfnative — keeps the CLI surface minimal.
// All PDF logic lives in pdfnative; this module is the only import point.

// ── Render (free-form documents) ─────────────────────────────────────
export { buildDocumentPDFBytes, buildDocumentPDFStream } from 'pdfnative';

// ── Render (table-centric, --variant table) ──────────────────────────
export { buildPDFBytes, buildPDFStream } from 'pdfnative';

// ── Compression bootstrap (Node Flate) ───────────────────────────────
export { initNodeCompression } from 'pdfnative';

// ── Sign ─────────────────────────────────────────────────────────────
export { signPdfBytes, buildSigDict } from 'pdfnative';
export { parseRsaPrivateKey, parseCertificate } from 'pdfnative';

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
export { openPdf, isRef, isName, isDict, isArray, nameValue } from 'pdfnative';

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
} from 'pdfnative';

export type {
    PdfSignOptions,
    SignatureAlgorithm,
    X509Certificate,
    X509Name,
    RsaPrivateKey,
    EcPrivateKey,
    EcPublicKey,
    Asn1Node,
} from 'pdfnative';

export type { PdfReader, PdfValue, PdfName, PdfRef, PdfStream } from 'pdfnative';
export type { ParsedDict as PdfDict, ParsedArray as PdfArray } from 'pdfnative';
