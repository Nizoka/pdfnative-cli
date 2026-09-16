// inspect --pdfx / --check pdfx / --iso-dates / pdfxConformance (v1.5.0).

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { inspect } from '../../src/commands/inspect.js';
import { annotate } from '../../src/commands/annotate.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, MINIMAL_DOC, renderTo, captured } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
let pdfxPdf = '';
let plainPdf = '';
let annotatedPdf = '';

beforeAll(async () => {
    const pdfx = await renderTo(tmp, { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } }, ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'false', '--strict', '--creation-date', '2026-01-01T00:00:00Z'], 'pdfx.pdf');
    pdfxPdf = pdfx.output;
    const plain = await renderTo(tmp, MINIMAL_DOC, ['--creation-date', '2026-06-15T12:30:45Z'], 'plain.pdf');
    plainPdf = plain.output;
    // A markup annotation in the print area breaks the PDF/X claim.
    const notes = await tmp.json('notes.json', [{ page: 1, type: 'square', rect: [72, 640, 300, 700], color: '#ff0000' }]);
    annotatedPdf = tmp.path('annotated.pdf');
    await captured(() => annotate(parseArgs(['--input', pdfxPdf, '--output', annotatedPdf, '--annotations', notes])));
});

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['PDFNATIVE_JSON'];
});

async function inspectJson(argv: readonly string[]): Promise<Record<string, unknown>> {
    const { stdout } = await captured(() => inspect(parseArgs([...argv, '--format', 'json'])));
    return JSON.parse(stdout) as Record<string, unknown>;
}

describe('inspect: PDF/X (v1.5.0)', () => {
    it('always reports pdfxConformance: the XMP claim or null', async () => {
        expect((await inspectJson(['--input', pdfxPdf])).pdfxConformance).toBe('PDF/X-4');
        expect((await inspectJson(['--input', plainPdf])).pdfxConformance).toBeNull();
    });

    it('--pdfx adds a { valid, errors, warnings } block (valid on the PDF/X-4 render)', async () => {
        const doc = await inspectJson(['--input', pdfxPdf, '--pdfx']);
        expect(doc.pdfx).toMatchObject({ valid: true, errors: [] });
    });

    it('--pdfx on a plain PDF reports valid: false with an identification error', async () => {
        const doc = await inspectJson(['--input', plainPdf, '--pdfx']);
        const pdfx = doc.pdfx as { valid: boolean; errors: string[] };
        expect(pdfx.valid).toBe(false);
        expect(pdfx.errors.some((e) => /GTS_PDFXVersion|PDF\/X/.test(e))).toBe(true);
    });

    it('--check pdfx passes on the PDF/X-4 render and fails with E_CHECK_FAILED on the annotated one', async () => {
        await expect(captured(() => inspect(parseArgs(['--input', pdfxPdf, '--check', 'pdfx'])))).resolves.toBeDefined();
        try {
            await captured(() => inspect(parseArgs(['--input', annotatedPdf, '--check', 'pdfx'])));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.CHECK_FAILED);
        }
    });

    it('--check pdfa --check pdfx on one file: one claim per file, so pdfa fails and pdfx passes', async () => {
        process.env['PDFNATIVE_JSON'] = '1';
        try {
            await captured(() => inspect(parseArgs(['--input', pdfxPdf, '--check', 'pdfa', '--check', 'pdfx'])));
            expect.unreachable();
        } catch (e) {
            expect((e as CliError).message).toContain('pdfa=fail');
            expect((e as CliError).message).toContain('pdfx=pass');
        }
    });

    it('the --check error message lists pdfx among the valid values', async () => {
        try {
            await captured(() => inspect(parseArgs(['--input', plainPdf, '--check', 'bogus'])));
            expect.unreachable();
        } catch (e) {
            expect((e as CliError).exitCode).toBe(2);
            expect((e as CliError).message).toContain('pdfx');
        }
    });

    it('--summary includes the pdfx claim', async () => {
        const doc = await inspectJson(['--input', pdfxPdf, '--summary']);
        expect(doc).toMatchObject({ pdfa: null, pdfx: 'PDF/X-4' });
    });

    it('--format text prints the PDF/X line and the check block', async () => {
        const { stdout } = await captured(() => inspect(parseArgs(['--input', annotatedPdf, '--format', 'text', '--pdfx'])));
        expect(stdout).toContain('PDF/X:          PDF/X-4');
        expect(stdout).toContain('PDF/X check:    invalid');
        expect(stdout).toContain('  error:');
    });
});

describe('inspect --iso-dates (v1.5.0)', () => {
    it('normalises the raw PDF date to ISO 8601; the raw form stays the default', async () => {
        const raw = await inspectJson(['--input', plainPdf]);
        expect((raw.metadata as { creationDate: string }).creationDate).toBe("D:20260615123045+00'00'");
        const iso = await inspectJson(['--input', plainPdf, '--iso-dates']);
        expect((iso.metadata as { creationDate: string }).creationDate).toBe('2026-06-15T12:30:45Z');
    });
});
