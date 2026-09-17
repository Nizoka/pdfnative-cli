// render --pdfx pdfx4 / --output-intent-icc / --output-intent-id / --trapped
// (v1.5.0, pdfnative 1.8.0 PDF/X-4).

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { validatePdfX } from '../../src/core-bridge/index.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, MINIMAL_DOC, renderTo, captured, withJsonEnvelope } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

/** Every positive PDF/X-4 render: fonts embedded, prtr CMYK profile, trapping state known. */
const PDFX_FLAGS = ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'false'];

const PRINT_DOC = {
    ...MINIMAL_DOC,
    blocks: [
        ...MINIMAL_DOC.blocks,
        { type: 'paragraph', text: 'Rich black in CMYK.', color: [0, 0, 0, 100] },
    ],
    layout: { print: { bleed: 8.5 } },
};

async function expectCliError(fn: () => Promise<unknown>, exitCode: number, code?: string, contains?: string): Promise<void> {
    try {
        await fn();
        expect.unreachable('expected a CliError');
    } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        const err = e as CliError;
        expect(err.exitCode).toBe(exitCode);
        if (code !== undefined) expect(err.code).toBe(code);
        if (contains !== undefined) expect(err.message).toContain(contains);
    }
}

describe('render --pdfx pdfx4', () => {
    it('renders a file validatePdfX() accepts, with the claim in XMP and /Trapped /False', async () => {
        const { bytes } = await renderTo(tmp, PRINT_DOC, [...PDFX_FLAGS, '--strict']);
        const raw = bytes.toString('latin1');
        expect(raw.startsWith('%PDF-1.6')).toBe(true);
        expect(raw).toContain('/GTS_PDFX');
        expect(raw).toContain('pdfxid:GTS_PDFXVersion');
        expect(raw).toContain('/Trapped /False');
        const result = validatePdfX(new Uint8Array(bytes));
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('a bare --pdfx selects pdfx4; --trapped true writes /Trapped /True', async () => {
        const { bytes } = await renderTo(tmp, PRINT_DOC, ['--pdfx', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'true']);
        expect(bytes.toString('latin1')).toContain('/Trapped /True');
    });

    it('--output-intent-id overrides the identifier; the basename is the default', async () => {
        const a = await renderTo(tmp, PRINT_DOC, [...PDFX_FLAGS, '--output-intent-id', 'ISO Coated v2 ECI'], 'a.pdf');
        expect(a.bytes.toString('latin1')).toContain('ISO Coated v2 ECI');
        const b = await renderTo(tmp, PRINT_DOC, PDFX_FLAGS, 'b.pdf');
        expect(b.bytes.toString('latin1')).toContain('synthetic-cmyk');
    });

    it('--json envelope carries pdfx (and creationDate when pinned)', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        const output = tmp.path('out.pdf');
        const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, ...PDFX_FLAGS, '--creation-date', '2026-01-01T00:00:00Z'])));
        expect(envelope).toMatchObject({ ok: true, command: 'render', pdfx: 'pdfx4', creationDate: '2026-01-01T00:00:00.000Z' });
    });

    it('--dry-run validates the request (profile read) and writes nothing', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        const output = tmp.path('out.pdf');
        const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, ...PDFX_FLAGS, '--dry-run'])));
        expect(envelope).toMatchObject({ ok: true, dryRun: true, pdfx: 'pdfx4' });
        await expect(fs.stat(output)).rejects.toThrow();
    });

    it('--dry-run pre-flights the engine: an unknown trapping state under --pdfx is E_INPUT before anything is written', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        const output = tmp.path('out.pdf');
        await expectCliError(() => render(parseArgs(['--input', input, '--output', output, '--dry-run', '--pdfx', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'unknown'])), 1, ErrorCode.INPUT, 'trapping');
        await expect(fs.stat(output)).rejects.toThrow();
    });

    it('--pdfx with --tagged is a usage error (one conformance claim per file)', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...PDFX_FLAGS, '--tagged', 'pdfa2b'])), 2, ErrorCode.USAGE, 'mutually exclusive');
    });

    it('--pdfx with encryption is a usage error', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...PDFX_FLAGS, '--encrypt', '--owner-password', 'x'])), 2, ErrorCode.USAGE, 'encryption');
    });

    it('layout.pdfx + layout.tagged from the document JSON is the engine\'s coherence error → E_INPUT', async () => {
        const doc = { ...PRINT_DOC, layout: { ...PRINT_DOC.layout, pdfx: 'pdfx4', tagged: 'pdfa2b' } };
        const input = await tmp.json('in.json', doc);
        await expectCliError(
            () => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin'])),
            1, ErrorCode.INPUT, 'cannot be combined',
        );
    });

    it('--pdfx without an output intent → E_INPUT ("requires layout.outputIntent")', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--pdfx', '--font', 'latin', '--lang', 'latin', '--trapped', 'false'])), 1, ErrorCode.INPUT, 'requires layout.outputIntent');
    });

    it('a monitor (mntr) profile is refused — PDF/X-4 needs an output (prtr) profile', async () => {
        const icc = Buffer.from(await fs.readFile(SYNTHETIC_CMYK_ICC));
        icc.write('mntr', 12, 'ascii');
        const mntr = await tmp.bytes('mntr.icc', icc);
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--pdfx', '--output-intent-icc', mntr, '--font', 'latin', '--lang', 'latin', '--trapped', 'false'])), 1, ErrorCode.INPUT, 'printer');
    });

    it('--trapped unknown under --pdfx → E_INPUT (trapping state must be known); bogus → exit 2', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--pdfx', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'unknown'])), 1, ErrorCode.INPUT, 'trapping');
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--trapped', 'maybe'])), 2, ErrorCode.USAGE, '--trapped');
    });

    it('without fonts: PDFX_NO_FONT_ENTRIES is a warning, and E_CHECK_FAILED under --strict', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        const output = tmp.path('warn.pdf');
        const { stderr } = await captured(() => render(parseArgs(['--input', input, '--output', output, '--pdfx', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--trapped', 'false'])));
        expect(stderr).toContain('[PDFX_NO_FONT_ENTRIES]');
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('strict.pdf'), '--pdfx', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--trapped', 'false', '--strict'])), 1, ErrorCode.CHECK_FAILED, 'pdfx');
    });

    it('--output-intent-icc refuses a non-ICC file (engine header check → E_INPUT) and path traversal', async () => {
        const notIcc = await tmp.bytes('not.icc', new TextEncoder().encode('%PDF-1.7 definitely not a profile'));
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--output-intent-icc', notIcc, '--tagged', 'pdfa2b'])), 1, ErrorCode.INPUT, 'ICC');
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--output-intent-icc', '../evil.icc'])), 1, undefined, 'traversal');
    });

    it('--output-intent-id alone (no profile anywhere) is a usage error', async () => {
        const input = await tmp.json('in.json', PRINT_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--output-intent-id', 'X'])), 2, ErrorCode.USAGE, '--output-intent-icc');
    });

    it('print.marks.colourBars (object form) renders under a CMYK intent', async () => {
        const doc = { ...PRINT_DOC, layout: { print: { bleed: 14.17, marks: { colourBars: { tints: false, size: 10 } } } } };
        const { bytes } = await renderTo(tmp, doc, [...PDFX_FLAGS, '--strict']);
        expect(validatePdfX(new Uint8Array(bytes)).valid).toBe(true);
        // Registration colour for the marks under a CMYK output intent.
        expect(bytes.toString('latin1')).toContain('/Separation');
    });

    it('the table variant embeds fonts too and can claim PDF/X-4 (v1.5.0)', async () => {
        const table = {
            docTitle: 'Table PDF/X', title: 'Ledger', infoItems: [], balanceText: '', countText: '',
            headers: ['Item', 'Qty'], rows: [{ type: 'data', pointed: false, cells: ['Widget', '2'] }], footerText: 'x',
        };
        const { bytes } = await renderTo(tmp, table, ['--variant', 'table', ...PDFX_FLAGS, '--strict']);
        const result = validatePdfX(new Uint8Array(bytes));
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});
