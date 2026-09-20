// render: the conformance and print-production corners of pdfnative 1.8.0 that
// no other suite drives through the CLI — AcroForm fonts under a PDF/A claim
// (#74), the Gray output intent and the /DefaultRGB remap, printer's marks
// clearance in a 3 mm bleed, the TrimBox synthesised from a bleedBox, marks as
// page artifacts in tagged output, and CMYK in table / chart colours.

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { readFormFields, validatePdfX, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import {
    TempFiles, MINIMAL_DOC, SYNTHETIC_CMYK_ICC, SYNTHETIC_GRAY_ICC,
    renderTo, renderJson, diagnosticCodes, latin1, captured,
} from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const LATIN = ['--font', 'latin', '--lang', 'latin'] as const;
const PINNED = ['--creation-date', '2026-01-01T00:00:00Z'] as const;
const pdfx = (icc: string): string[] => ['--pdfx', 'pdfx4', '--output-intent-icc', icc, '--trapped', 'false', ...LATIN, ...PINNED];

const FORM_DOC = {
    title: 'Registration',
    blocks: [
        { type: 'heading', text: 'Registration', level: 1 },
        { type: 'formField', fieldType: 'text', name: 'fullName', label: 'Full name' },
        { type: 'formField', fieldType: 'multilineText', name: 'notes', label: 'Notes' },
        { type: 'formField', fieldType: 'checkbox', name: 'consent', label: 'I agree' },
        { type: 'formField', fieldType: 'dropdown', name: 'plan', label: 'Plan', options: ['Free', 'Team'] },
    ],
};

describe('render: AcroForm under a PDF/A claim (engine 1.8.0, #74)', () => {
    it('with a Latin font the form passes --strict: no diagnostic, an embedded font, no base-14 fallback in the file', async () => {
        const { envelope, bytes } = await renderJson(tmp, FORM_DOC, ['--tagged', 'pdfa2b', ...LATIN, '--strict', '--no-compress']);
        expect(diagnosticCodes(envelope)).toEqual([]);
        const raw = latin1(bytes);
        expect(raw).toContain('/AcroForm');
        expect(raw).toContain('/DR');
        expect(raw).toContain('/FontFile2');
        expect(raw).not.toMatch(/\/BaseFont \/(Helvetica|Times|Courier)/);
        expect(readFormFields(new Uint8Array(bytes)).map((f) => f.name)).toEqual(['fullName', 'notes', 'consent', 'plan']);
    });

    it('without one the fields fall back to a base-14 font, which the diagnostic reports', async () => {
        const { envelope, bytes } = await renderJson(tmp, FORM_DOC, ['--tagged', 'pdfa2b', '--no-compress']);
        expect(diagnosticCodes(envelope)).toContain('PDFA_UNEMBEDDED_FORM_FONT');
        expect(latin1(bytes)).toMatch(/\/BaseFont \/Helvetica/);
    });
});

describe('render: Gray output intent and the RGB remap (engine 1.8.0)', () => {
    it('a Gray prtr profile is a valid PDF/X-4 intent: /N 1, RGB remapped through /DefaultRGB', async () => {
        const { envelope, bytes } = await renderJson(tmp, { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } }, [...pdfx(SYNTHETIC_GRAY_ICC), '--strict', '--no-compress']);
        expect(diagnosticCodes(envelope)).toEqual([]);
        const raw = latin1(bytes);
        expect(raw).toMatch(/\/N 1\b/);
        expect(raw).toContain('/DefaultRGB');
        expect(validatePdfX(new Uint8Array(bytes))).toMatchObject({ valid: true, errors: [] });
    });

    it('a CMYK intent remaps RGB the same way and declares four components', async () => {
        const { bytes } = await renderTo(tmp, { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } }, [...pdfx(SYNTHETIC_CMYK_ICC), '--no-compress']);
        const raw = latin1(bytes);
        expect(raw).toMatch(/\/N 4\b/);
        expect(raw).toContain('/DefaultRGB');
    });

    it('a Gray intent under PDF/A-2b is accepted without a diagnostic', async () => {
        const { envelope, bytes } = await renderJson(tmp, MINIMAL_DOC, ['--tagged', 'pdfa2b', ...LATIN, '--output-intent-icc', SYNTHETIC_GRAY_ICC, '--strict', '--no-compress']);
        expect(diagnosticCodes(envelope)).toEqual([]);
        expect(latin1(bytes)).toMatch(/\/N 1\b/);
    });
});

describe('render: printer’s marks and page boxes (engine 1.8.0)', () => {
    const marksDoc = (print: Record<string, unknown>): unknown => ({ title: 'Marks', blocks: [{ type: 'paragraph', text: 'Marks' }], layout: { print } });
    /** The marks block: the last q … Q group of the page content. */
    const marksOps = (bytes: Uint8Array): string => {
        const raw = latin1(bytes);
        const from = raw.lastIndexOf('\nq\n0 0 0 RG');
        expect(from, 'a marks block').toBeGreaterThan(0);
        return raw.slice(from, raw.indexOf('\nQ', from));
    };
    const curves = (ops: string): number => (ops.match(/ c(?= |$)/gm) ?? []).length;
    const lines = (ops: string): number => (ops.match(/ l S$/gm) ?? []).length;

    it('in a 3 mm bleed (8.5 pt) every mark is drawn and stays inside the MediaBox', async () => {
        const ops = marksOps((await renderTo(tmp, marksDoc({ bleed: 8.5, marks: true }), ['--no-compress'])).bytes);
        expect(curves(ops)).toBe(16); // four registration targets, four Bézier arcs each
        expect(lines(ops)).toBe(16); // eight crop marks + eight target cross-hairs
        for (const [, x, y] of ops.matchAll(/^([0-9.]+) ([0-9.]+) [ml]\b/gm)) {
            expect(Number(x)).toBeGreaterThanOrEqual(0);
            expect(Number(x)).toBeLessThanOrEqual(595.28);
            expect(Number(y)).toBeGreaterThanOrEqual(0);
            expect(Number(y)).toBeLessThanOrEqual(841.89);
        }
    });

    it('below the 6.6 pt strip the registration targets are dropped and the crop marks kept', async () => {
        const ops = marksOps((await renderTo(tmp, marksDoc({ bleed: 6, marks: true }), ['--no-compress'])).bytes);
        expect(curves(ops)).toBe(0);
        expect(lines(ops)).toBe(8);
    });

    it('a bleedBox with no trimBox gets its TrimBox synthesised under --pdfx, and the file validates', async () => {
        const { bytes } = await renderTo(tmp, marksDoc({ bleedBox: [10, 10, 585.28, 831.89] }), [...pdfx(SYNTHETIC_CMYK_ICC), '--strict', '--no-compress']);
        expect(latin1(bytes)).toMatch(/\/TrimBox \[10(\.00)? 10(\.00)? 585\.28 831\.89\]/);
        expect(validatePdfX(new Uint8Array(bytes)).valid).toBe(true);
    });

    it('in tagged output the marks and colour bars are a page artifact, outside the structure tree', async () => {
        const { bytes } = await renderTo(tmp, marksDoc({ bleed: 14.17, marks: { crop: true, registration: true, colourBars: true } }), ['--tagged', 'pdfa2b', ...LATIN, '--no-compress']);
        expect(latin1(bytes)).toMatch(/\/Artifact << \/Type \/Page >> BDC/);
    });
});

describe('render: CMYK in table, zebra and chart colours (engine 1.8.0)', () => {
    it('every CMYK colour option reaches the content stream as a four-operand k / K operator', async () => {
        const doc = {
            title: 'CMYK everywhere',
            blocks: [
                { type: 'paragraph', text: 'Rich black body text.', color: [60, 40, 40, 100] },
                {
                    type: 'table',
                    headers: ['Ink', 'Coverage'],
                    rows: [
                        { cells: ['Cyan', '100 %'], type: 'normal', pointed: false },
                        { cells: ['Black', '60 %'], type: 'normal', pointed: false },
                        { cells: ['Yellow', '20 %'], type: 'normal', pointed: false },
                    ],
                    zebra: '0 0 0 0.06',
                },
                {
                    type: 'chart',
                    chartType: 'bar',
                    title: 'Ink coverage',
                    categories: ['C', 'K'],
                    series: [{ label: 'Tuple', values: [38, 62], color: [100, 0, 0, 0] }, { label: 'String', values: [41, 27], color: '0 0 0 1' }],
                },
            ],
        };
        const input = await tmp.json('cmyk.json', doc);
        const output = tmp.path('cmyk.pdf');
        await captured(() => render(parseArgs(['--input', input, '--output', output, '--no-compress'])));
        const raw = latin1(await fs.readFile(output));
        expect(raw).toMatch(/^0\.6 0\.4 0\.4 1 k$/m); // paragraph colour, percent tuple
        expect(raw).toMatch(/^0 0 0 0\.06 k$/m); // zebra, 0–1 operand string
        expect(raw).toMatch(/^1 0 0 0 k$/m); // chart series, percent tuple
        expect(raw).toMatch(/^0 0 0 1 k$/m); // chart series, operand string
    });
});
