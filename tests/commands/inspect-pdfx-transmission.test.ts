// inspect --pdfx / --check pdfx: the TRANSMISSION contract for pdfnative's
// validatePdfX() (engine 1.8.0).
//
// The validator's rules are the engine's and are tested there one by one.
// What the CLI owes is fidelity: `inspect --pdfx` reports exactly what the
// validator returned — errors AND warnings — and `--check pdfx` turns
// `valid` into the exit code. These cases drive files `render` cannot
// produce (crafted at test time, never committed) through the command and
// hold the output to the bridge call on the same bytes.

import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { inspect } from '../../src/commands/inspect.js';
import { annotate } from '../../src/commands/annotate.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { validatePdfX } from '../../src/core-bridge/index.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, MINIMAL_DOC, renderTo, captured, expectCliError } from '../helpers/cli-harness.js';
import { buildObjectsPdf, patchBytes } from '../helpers/fuzz.js';

const tmp = new TempFiles();
const PDFX = ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'false', '--creation-date', '2026-01-01T00:00:00Z'];
const PRINT_DOC = { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } };

let pdfx: Buffer = Buffer.alloc(0);
let pdfxPath = '';

beforeAll(async () => {
    const r = await renderTo(tmp, PRINT_DOC, [...PDFX, '--strict'], 'pdfx.pdf');
    pdfx = r.bytes;
    pdfxPath = r.output;
});

afterAll(() => tmp.cleanup());

afterEach(() => {
    vi.restoreAllMocks();
});

interface PdfxReport { valid: boolean; errors: string[]; warnings: string[] }

/** `inspect --pdfx` on these bytes, held to the validator's own answer. */
async function inspectPdfx(bytes: Uint8Array, name: string): Promise<{ path: string; report: PdfxReport }> {
    const path = await tmp.bytes(name, bytes);
    const { stdout } = await captured(() => inspect(parseArgs(['--input', path, '--pdfx', '--format', 'json'])));
    const report = (JSON.parse(stdout) as { pdfx: PdfxReport }).pdfx;
    expect(report).toEqual(validatePdfX(new Uint8Array(bytes)));
    return { path, report };
}

function stream(dict: string, content: string): string {
    return `<< ${dict} /Length ${content.length} >>\nstream\n${content}\nendstream`;
}

describe('inspect --pdfx: transmission of validatePdfX (engine 1.8.0)', () => {
    it('an error: a markup annotation in the print area, and --check pdfx exits 1', async () => {
        const notes = await tmp.json('notes.json', [{ page: 1, type: 'square', rect: [72, 640, 300, 700], color: '#ff0000' }]);
        const annotated = tmp.path('annotated.pdf');
        await captured(() => annotate(parseArgs(['--input', pdfxPath, '--output', annotated, '--annotations', notes])));
        const { path, report } = await inspectPdfx(await fs.readFile(annotated), 'annotated-copy.pdf');
        expect(report.valid).toBe(false);
        expect(report.errors.join('\n')).toMatch(/annotation inside the BleedBox/);
        await expectCliError(() => captured(() => inspect(parseArgs(['--input', path, '--check', 'pdfx']))), 1, ErrorCode.CHECK_FAILED);
    });

    it('a warning alone keeps the file valid: warnings[] is transmitted and --check pdfx still passes', async () => {
        const { path, report } = await inspectPdfx(patchBytes(pdfx, '%PDF-1.6', '%PDF-1.4'), 'header-14.pdf');
        expect(report.errors).toEqual([]);
        expect(report.valid).toBe(true);
        expect(report.warnings.join('\n')).toMatch(/expected to declare PDF 1\.6/);
        await expect(captured(() => inspect(parseArgs(['--input', path, '--check', 'pdfx'])))).resolves.toBeDefined();
        const { stdout } = await captured(() => inspect(parseArgs(['--input', path, '--pdfx', '--format', 'text'])));
        expect(stdout).toMatch(/PDF 1\.6/);
    });

    const page = (extGState: string): string[] => [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /TrimBox [0 0 612 792] /Resources << /ExtGState << /GS0 5 0 R >> >> /Contents 4 0 R >>',
        stream('', '/GS0 gs'),
        extGState,
    ];

    it('the 1.8.0 rule change: any /TR is an error, /TR2 /Default is not', async () => {
        const withTr = await inspectPdfx(buildObjectsPdf(page('<< /Type /ExtGState /TR /Identity >>'), { header: '%PDF-1.6', id: true }), 'tr.pdf');
        expect(withTr.report.errors.join('\n')).toMatch(/transfer function/);
        const withDefault = await inspectPdfx(buildObjectsPdf(page('<< /Type /ExtGState /TR2 /Default >>'), { header: '%PDF-1.6', id: true }), 'tr2-default.pdf');
        expect(withDefault.report.errors.join('\n')).not.toMatch(/transfer function/);
    });

    it('an exemption: a /Link inside the print area is an error until it is Hidden', async () => {
        const doc = { ...PRINT_DOC, blocks: [...MINIMAL_DOC.blocks, { type: 'link', text: 'pdfnative', url: 'https://pdfnative.dev' }] };
        const { bytes } = await renderTo(tmp, doc, PDFX, 'link.pdf');
        const visible = await inspectPdfx(bytes, 'link-visible.pdf');
        expect(visible.report.errors.join('\n')).toMatch(/annotation inside the BleedBox/);
        // /F 4 (Print) -> /F 2 (Hidden): ISO 15930-7 exempts an annotation that never prints.
        const hidden = await inspectPdfx(patchBytes(bytes, '/Border [0 0 0] /F 4 /A', '/Border [0 0 0] /F 2 /A'), 'link-hidden.pdf');
        expect(hidden.report.errors.join('\n')).not.toMatch(/annotation inside the BleedBox/);
    });

    it('actions, JavaScript, unembedded Form XObject fonts are errors; a custom halftone is a warning', async () => {
        const bytes = buildObjectsPdf([
            '<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] /AA << /WC 7 0 R >> /Names << /JavaScript << /Names [(init) 7 0 R] >> >> >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /TrimBox [0 0 612 792] /AA << /O 7 0 R >> '
                + '/Resources << /XObject << /Fx 5 0 R >> /ExtGState << /GS1 8 0 R >> >> /Contents 4 0 R /Annots [9 0 R] >>',
            stream('', '/Fx Do'),
            stream('/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /Font << /Fh 10 0 R >> >>', 'BT /Fh 12 Tf (x) Tj ET'),
            '<< /Type /ExtGState >>',
            '<< /S /JavaScript /JS (app.alert\\(1\\)) >>',
            '<< /Type /ExtGState /HT << /Type /Halftone /HalftoneType 1 /Frequency 60 /Angle 45 /SpotFunction /Round >> >>',
            '<< /Type /Annot /Subtype /Link /Rect [0 0 0 0] /F 2 /A 7 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ], { header: '%PDF-1.6', id: true });
        const { report } = await inspectPdfx(bytes, 'actions.pdf');
        const errors = report.errors.join('\n');
        expect(errors).toMatch(/OpenAction/);
        expect(errors).toMatch(/JavaScript/);
        expect(errors).toMatch(/font \/Fh \(Helvetica\) is not embedded/);
        expect(report.warnings.join('\n')).toMatch(/halftone/);
        expect(report.valid).toBe(false);
    });
});
