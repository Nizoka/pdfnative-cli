// Selective re-exports from pdfnative — keeps the CLI surface minimal.
// All PDF logic lives in pdfnative; this module is the only import point.

// ── Render ───────────────────────────────────────────────────────────
export { buildDocumentPDFBytes } from 'pdfnative';
export { buildDocumentPDFStream } from 'pdfnative';

// ── Sign ─────────────────────────────────────────────────────────────
export { signPdfBytes } from 'pdfnative';
export { parseCertificate } from 'pdfnative';
export { parseRsaPrivateKey } from 'pdfnative';

// ── Inspect ──────────────────────────────────────────────────────────
export { openPdf } from 'pdfnative';

// ── Types ────────────────────────────────────────────────────────────
export type { DocumentParams } from 'pdfnative';
export type { PdfSignOptions, SignatureAlgorithm } from 'pdfnative';
export type { X509Certificate, X509Name } from 'pdfnative';
export type { RsaPrivateKey } from 'pdfnative';
export type { EcPrivateKey } from 'pdfnative';
export type { PdfReader } from 'pdfnative';
export type { StreamOptions } from 'pdfnative';
