// One minimal trigger per diagnostic code pdfnative 1.8.0 can emit through
// `render`. tests/commands/render-diagnostics.test.ts executes every entry
// (warning in the --json envelope, E_CHECK_FAILED under --strict) and
// tests/regression/engine-surface.test.ts holds the key set to the codes
// `schema status` lists — a code the docs name is a code a test TRIGGERS.

import { SYNTHETIC_CMYK_ICC, SYNTHETIC_GRAY_ICC } from './cli-harness.js';

export interface DiagnosticTrigger {
    /** The document to render. */
    readonly doc: unknown;
    /** Extra argv. `v4Icc` is a copy of the CMYK fixture with its ICC major version set to 4. */
    readonly argv: (fixtures: { readonly v4Icc: string }) => readonly string[];
    /** A fragment of the diagnostic message. */
    readonly message: RegExp;
    /** Other codes the same minimal input legitimately raises. */
    readonly alongside?: readonly string[];
}

const LATIN = ['--font', 'latin', '--lang', 'latin'] as const;
const PDFX_CMYK = ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--trapped', 'false'] as const;
const PRINT = { print: { bleed: 8.5 } };
const para = (text: string, extra: Record<string, unknown> = {}): unknown => ({ type: 'paragraph', text, ...extra });
const doc = (blocks: readonly unknown[], layout?: unknown): unknown => ({ title: 'Diagnostic', blocks, ...(layout !== undefined ? { layout } : {}) });

/** Minimal 4-component (CMYK) baseline JPEG: SOF0 declares 4 components (the engine suite uses the same bytes). */
export const CMYK_JPEG_BASE64 = Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xC0, 0x00, 0x14, 0x08, 0x00, 0x02, 0x00, 0x02, 0x04,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0x04, 0x11, 0x00,
    0xFF, 0xD9,
]).toString('base64');

export const DIAGNOSTIC_TRIGGERS: Readonly<Record<string, DiagnosticTrigger>> = {
    PDFA_NO_FONT_ENTRIES: {
        doc: doc([para('A PDF/A claim with no embedded font.')]),
        argv: () => ['--tagged', 'pdfa2b'],
        message: /font/i,
    },
    PDFA_UNEMBEDDED_FORM_FONT: {
        doc: doc([para('A form under a PDF/A claim.'), { type: 'formField', fieldType: 'text', name: 'name', label: 'Name' }]),
        argv: () => ['--tagged', 'pdfa2b'],
        message: /form/i,
        alongside: ['PDFA_NO_FONT_ENTRIES'],
    },
    PDFA_DEVICE_CMYK_IMAGE: {
        doc: doc([para('A CMYK JPEG under an sRGB intent.'), { type: 'image', dataBase64: CMYK_JPEG_BASE64, width: 40, height: 40 }]),
        argv: () => ['--tagged', 'pdfa2b', ...LATIN],
        message: /CMYK/,
    },
    PDFA_DEVICE_CMYK_CONTENT: {
        doc: doc([para('Rich black in CMYK under an sRGB intent.', { color: [0, 0, 0, 100] })]),
        argv: () => ['--tagged', 'pdfa2b', ...LATIN],
        message: /CMYK/,
    },
    PDFA_ICC_PROFILE_VERSION: {
        doc: doc([para('PDF/A-1 requires an ICC v2 profile.')]),
        argv: ({ v4Icc }) => ['--tagged', 'pdfa1b', ...LATIN, '--output-intent-icc', v4Icc],
        message: /version 4/,
    },
    PDFX_NO_FONT_ENTRIES: {
        doc: doc([para('PDF/X-4 with a base-14 font.')], PRINT),
        argv: () => [...PDFX_CMYK],
        message: /font/i,
    },
    PDFX_DEVICE_CMYK: {
        doc: doc([para('CMYK ink under a Gray intent.', { color: [0, 0, 0, 100] })], PRINT),
        argv: () => ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_GRAY_ICC, '--trapped', 'false', ...LATIN],
        message: /OutputIntent is not CMYK/,
    },
    PDFX_ANNOTATIONS: {
        doc: doc([para('A link under a PDF/X-4 claim.'), { type: 'link', text: 'pdfnative', url: 'https://pdfnative.dev' }], PRINT),
        argv: () => [...PDFX_CMYK, ...LATIN],
        message: /annotations/,
    },
    TYPOGRAPHY_FEATURE_INEFFECTIVE: {
        doc: doc([para('Tabular figures 0123456789 that Noto Sans does not carry.')]),
        argv: () => [...LATIN, '--font-features', 'tnum'],
        message: /tnum/,
    },
};
