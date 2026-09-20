// render --dry-run pre-flights the real build in memory (v1.5.0, audit
// finding A-22): every coherence error, strict escalation and diagnostic the
// real render would produce surfaces in the dry run, and nothing is written.

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, MINIMAL_DOC, withJsonEnvelope, captured } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

const FONTS = ['--font', 'latin', '--lang', 'latin'];

async function expectCliError(fn: () => Promise<unknown>, exitCode: number, code: string, contains?: string): Promise<void> {
    try {
        await fn();
        expect.unreachable('expected a CliError');
    } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        const err = e as CliError;
        expect(err.exitCode).toBe(exitCode);
        expect(err.code).toBe(code);
        if (contains !== undefined) expect(err.message).toContain(contains);
    }
}

/** Run a dry run and assert the output path was never created. */
async function dryRun(input: string, argv: readonly string[]): Promise<{ envelope: Record<string, unknown>; output: string }> {
    const output = tmp.path('never.pdf');
    const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, '--dry-run', ...argv])));
    await expect(fs.stat(output)).rejects.toThrow();
    return { envelope, output };
}

describe('render --dry-run pre-flights the engine build', () => {
    it('--pdfx without an output intent fails the dry run with E_INPUT, like the real run', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--pdfx', 'pdfx4', ...FONTS, '--trapped', 'false'])), 1, ErrorCode.INPUT, 'requires layout.outputIntent');
    });

    it('inline layout.pdfx + layout.tagged is the engine coherence error → E_INPUT in a dry run', async () => {
        const input = await tmp.json('in.json', { ...MINIMAL_DOC, layout: { pdfx: 'pdfx4', tagged: 'pdfa2b' } });
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--output-intent-icc', SYNTHETIC_CMYK_ICC, ...FONTS])), 1, ErrorCode.INPUT, 'cannot be combined');
    });

    it('--attachment without --tagged pdfa3b → E_INPUT in a dry run', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const attachment = await tmp.bytes('data.txt', new TextEncoder().encode('payload'));
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--attachment', attachment, '--tagged', 'pdfa2b', ...FONTS])), 1, ErrorCode.INPUT, 'pdfa3b');
    });

    it('a translucent watermark under PDF/A-1b → E_INPUT in a dry run', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--tagged', 'pdfa1b', '--watermark-text', 'DRAFT', '--watermark-opacity', '0.4', ...FONTS])), 1, ErrorCode.INPUT, 'Watermark transparency');
    });

    it('print marks without a TrimBox from a --layout file → E_INPUT in a dry run', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const layout = await tmp.json('layout.json', { print: { marks: { crop: true } } });
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--layout', layout])), 1, ErrorCode.INPUT, 'print.marks');
    });

    it('a non-ICC --output-intent-icc is refused in a dry run (engine acsp check → E_INPUT)', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const bogus = await tmp.bytes('bogus.icc', new Uint8Array(256));
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--pdfx', 'pdfx4', '--output-intent-icc', bogus, ...FONTS, '--trapped', 'false'])), 1, ErrorCode.INPUT, 'ICC');
    });

    it('diagnostics reach the dry-run envelope: --tagged pdfa2b without fonts reports PDFA_NO_FONT_ENTRIES', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const { envelope } = await dryRun(input, ['--tagged', 'pdfa2b']);
        expect(envelope).toMatchObject({ ok: true, command: 'render', dryRun: true });
        const diagnostics = envelope.diagnostics as { code: string; severity: string }[];
        expect(diagnostics.some((d) => d.code === 'PDFA_NO_FONT_ENTRIES')).toBe(true);
    });

    it('--strict --dry-run escalates a diagnostic to E_CHECK_FAILED like a real run', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--tagged', 'pdfa2b', '--strict'])), 1, ErrorCode.CHECK_FAILED);
    });

    it.each([['--stream'], ['--stream-page-by-page'], ['--stream-true']])('%s --dry-run writes nothing and still pre-flights', async (mode) => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const { envelope } = await dryRun(input, [mode]);
        expect(envelope).toMatchObject({ ok: true, dryRun: true });
        expect(envelope).not.toHaveProperty('bytes');
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', mode, '--pdfx', 'pdfx4', ...FONTS, '--trapped', 'false'])), 1, ErrorCode.INPUT, 'requires layout.outputIntent');
    });

    it('--variant table --dry-run pre-flights too', async () => {
        const table = {
            docTitle: 'Table', title: 'Ledger', infoItems: [], balanceText: '', countText: '',
            headers: ['Item', 'Qty'], rows: [{ type: 'data', pointed: false, cells: ['Widget', '2'] }], footerText: 'x',
        };
        const input = await tmp.json('table.json', table);
        const { envelope } = await dryRun(input, ['--variant', 'table']);
        expect(envelope).toMatchObject({ ok: true, variant: 'table', dryRun: true });
        await expectCliError(() => render(parseArgs(['--input', input, '--dry-run', '--variant', 'table', '--pdfx', 'pdfx4', ...FONTS, '--trapped', 'false'])), 1, ErrorCode.INPUT, 'requires layout.outputIntent');
    });

    it('the dry-run envelope is additive: dryRun true, no bytes, pdfx and creationDate when set', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const { envelope, output } = await dryRun(input, ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, ...FONTS, '--trapped', 'false', '--creation-date', '2026-01-01T00:00:00Z']);
        expect(envelope).toEqual({ ok: true, command: 'render', variant: 'document', dryRun: true, output, pdfx: 'pdfx4', creationDate: '2026-01-01T00:00:00.000Z' });
        expect(envelope).not.toHaveProperty('bytes');
    });

    it('a clean dry run prints no warning and no artifact on stdout', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        const { stdout, stderr } = await captured(() => render(parseArgs(['--input', input, '--dry-run'])));
        expect(stdout).toBe('');
        expect(stderr).not.toContain('warning:');
    });
});
