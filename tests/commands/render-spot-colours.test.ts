// render: spot colours (v1.6.0, pdfnative 1.9.0) — `layout.print.spotColours`
// declares the inks, `{ spot, tint? }` paints a /Separation, `{ inks }` a
// /DeviceN mix with a /Colorants attributes dictionary (five-element array),
// and the engine's refusals (an undeclared ink, a mix across alternate
// spaces, a bad declaration) reach the agent as E_INPUT. JSON-only, like every
// other `print.*` option: there is no flag to test, only the transmission.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { validatePdfX } from '../../src/core-bridge/index.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, renderTo, renderJson, diagnosticCodes, latin1, expectCliError, captured } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

const INKS = [
    { name: 'PANTONE 300 C', alternate: [100, 44, 0, 0] },
    { name: 'Spot Varnish', alternate: [0, 0, 0, 8] },
    { name: 'Brand RGB', alternate: [12, 34, 56] },
];
const LATIN = ['--font', 'latin', '--lang', 'latin', '--no-compress', '--creation-date', '2026-01-01T00:00:00Z'];
const PDFX = ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--trapped', 'false'];
const docOf = (blocks: readonly unknown[], spotColours: readonly unknown[] = INKS): unknown => ({
    title: 'Spot colours',
    blocks,
    layout: { print: { bleed: 8.5, spotColours } },
});
const para = (text: string, color: unknown): unknown => ({ type: 'paragraph', text, color });

describe('render: spot colours (pdfnative 1.9.0)', { timeout: 60_000 }, () => {
    it('{ spot } paints through a /Separation colour space named after the ink, at 100 % and at a tint', async () => {
        const { bytes } = await renderTo(tmp, docOf([para('Brand blue.', { spot: 'PANTONE 300 C' }), para('Forty percent.', { spot: 'PANTONE 300 C', tint: 0.4 })]), LATIN);
        const raw = latin1(bytes);
        expect(raw).toContain('/Separation');
        expect(raw).toContain('/PANTONE#20300#20C');
        expect(raw).toMatch(/\b0\.4 scn?\b/);
    });

    it('{ inks } paints through a /DeviceN space whose array carries the /Colorants attributes dictionary', async () => {
        const { bytes } = await renderTo(tmp, docOf([para('Blue over varnish.', { inks: { 'PANTONE 300 C': 1, 'Spot Varnish': 1 } })]), LATIN);
        const raw = latin1(bytes);
        expect(raw).toContain('/DeviceN');
        expect(raw).toContain('/Colorants');
        expect(raw).toContain('/Spot#20Varnish');
    });

    it('an ink no declaration names is E_INPUT, with the remedy in the message', async () => {
        const input = await tmp.json('in.json', docOf([para('Undeclared.', { spot: 'PANTONE 7 C' })]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...LATIN]))), 1, ErrorCode.INPUT, 'is not declared');
    });

    it('a mix across alternate spaces (a CMYK ink with an RGB ink) is E_INPUT', async () => {
        const input = await tmp.json('in.json', docOf([para('Mixed spaces.', { inks: { 'PANTONE 300 C': 1, 'Brand RGB': 0.5 } })]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...LATIN]))), 1, ErrorCode.INPUT, 'Ink mix');
    });

    it('a bad declaration (an ink declared twice) is E_INPUT through the print. prefix', async () => {
        const input = await tmp.json('in.json', docOf([para('Twice.', { spot: 'PANTONE 300 C' })], [INKS[0], INKS[0]]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...LATIN]))), 1, ErrorCode.INPUT, 'declared twice');
    });

    it('--dry-run reports the same refusal before anything is written', async () => {
        const input = await tmp.json('in.json', docOf([para('Undeclared.', { spot: 'PANTONE 7 C' })]));
        const output = tmp.path('never.pdf');
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', output, '--dry-run', ...LATIN]))), 1, ErrorCode.INPUT, 'is not declared');
    });

    it('a chart painting each bar in a spot ink validates under --pdfx pdfx4 --strict (ChartSeries.colors, pdfnative 1.9.0)', async () => {
        const chart = {
            type: 'chart', chartType: 'bar', categories: ['C', 'M', 'Y', 'K', 'Spot'],
            series: [{ label: 'Ink coverage', values: [40, 55, 30, 70, 100], colors: [[100, 0, 0, 0], [0, 100, 0, 0], [0, 0, 100, 0], [0, 0, 0, 100], { spot: 'PANTONE 300 C' }] }],
        };
        const { envelope, bytes } = await renderJson(tmp, docOf([para('Plates.', { spot: 'PANTONE 300 C' }), chart]), [...LATIN, ...PDFX, '--strict']);
        expect(envelope).toMatchObject({ ok: true, pdfx: 'pdfx4' });
        expect(diagnosticCodes(envelope)).toEqual([]);
        expect(latin1(bytes)).toContain('/Separation');
        const result = validatePdfX(new Uint8Array(bytes));
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('a colors array whose length differs from the values is E_INPUT (chart: prefix)', async () => {
        const chart = { type: 'chart', chartType: 'bar', categories: ['A', 'B'], series: [{ label: 'S', values: [1, 2], colors: ['#ff0000'] }] };
        const input = await tmp.json('in.json', docOf([chart]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), ...LATIN]))), 1, ErrorCode.INPUT, 'chart');
    });
});
