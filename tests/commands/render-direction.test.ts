// render --direction / --actual-text (v1.6.0, pdfnative 1.9.0 full UAX #9):
// the base direction of a paragraph decides its alignment, the untagged
// right-to-left runs carry their logical text (/ActualText, C27) so
// extract-text returns the line as typed, and the opt-out restores the bare
// 1.8.0 runs. Observables: run positions through extractText({ includeRuns }),
// the extracted text, the envelope.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractText, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { TempFiles, renderTo, renderJson, latin1, expectCliError, captured } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

// demo-language: ar, he (right-to-left shaping probes)
const AR = 'السلام عليكم ورحمة الله وبركاته';
const HE = 'שלום עולם, ברוכים הבאים';
const LATIN = 'A Latin paragraph set left to right.';
const FONTS = ['--font', 'ar', '--font', 'he', '--font', 'latin', '--lang', 'ar,he,latin', '--creation-date', '2026-01-01T00:00:00Z'];
const docOf = (blocks: readonly unknown[]): unknown => ({ title: 'Direction', blocks });
const para = (text: string, extra: Record<string, unknown> = {}): unknown => ({ type: 'paragraph', text, ...extra });

interface Run { readonly text: string; readonly x: number; readonly y: number }
const runsOf = (bytes: Uint8Array): readonly Run[] => (extractText(new Uint8Array(bytes), { includeRuns: true })[0]?.runs ?? []) as readonly Run[];
const RTL = /[֐-ۿ]/u;
/** The leftmost x of the runs whose text matches `which`. */
const leftEdge = (bytes: Uint8Array, which: RegExp): number => Math.min(...runsOf(bytes).filter((r) => which.test(r.text)).map((r) => r.x));
const squash = (s: string): string => s.normalize('NFC').replace(/[\s‏‎]+/gu, '');
const pageText = (bytes: Uint8Array): string => extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');

describe('render --direction (pdfnative 1.9.0, full UAX #9)', { timeout: 60_000 }, () => {
    it('rtl right-aligns an Arabic paragraph: its runs start far from the left margin, ltr keeps them at the margin', async () => {
        const rtl = await renderTo(tmp, docOf([para(AR)]), [...FONTS, '--direction', 'rtl'], 'rtl.pdf');
        const ltr = await renderTo(tmp, docOf([para(AR)]), [...FONTS, '--direction', 'ltr'], 'ltr.pdf');
        expect(leftEdge(ltr.bytes, RTL)).toBeLessThan(100);
        expect(leftEdge(rtl.bytes, RTL)).toBeGreaterThan(leftEdge(ltr.bytes, RTL) + 50);
    });

    it('auto resolves per paragraph: the Hebrew paragraph is right-aligned, the Latin one is not', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(LATIN), para(HE)]), [...FONTS, '--direction', 'auto'], 'auto.pdf');
        expect(leftEdge(bytes, /Latin paragraph/)).toBeLessThan(100);
        expect(leftEdge(bytes, RTL)).toBeGreaterThan(leftEdge(bytes, /Latin paragraph/) + 50);
    });

    it('a paragraph block\'s own direction wins over the flag', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(AR, { direction: 'ltr' })]), [...FONTS, '--direction', 'rtl'], 'override.pdf');
        expect(leftEdge(bytes, RTL)).toBeLessThan(100);
    });

    it('an invalid --direction is a usage error', async () => {
        const input = await tmp.json('in.json', docOf([para(LATIN)]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--direction', 'down']))), 2, ErrorCode.USAGE, '--direction');
    });

    it('the --json envelope carries direction when set, and leaves it out otherwise', async () => {
        const set = await renderJson(tmp, docOf([para(LATIN)]), [...FONTS, '--direction', 'auto']);
        expect(set.envelope).toMatchObject({ ok: true, direction: 'auto' });
        const unset = await renderJson(tmp, docOf([para(LATIN)]), FONTS);
        expect(unset.envelope).not.toHaveProperty('direction');
        expect(unset.envelope).not.toHaveProperty('actualText');
    });
});

describe('render: untagged right-to-left runs carry their logical text (pdfnative 1.9.0, C27)', { timeout: 60_000 }, () => {
    it('an untagged Arabic line extracts as typed — /ActualText in the bytes, the source string from extract-text', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(AR)]), [...FONTS, '--no-compress', '--direction', 'rtl'], 'c27.pdf');
        expect(latin1(bytes)).toContain('/ActualText');
        expect(squash(pageText(bytes))).toContain(squash(AR));
    });

    it('--actual-text false restores the bare 1.8.0 runs: no /ActualText, the same letters, and the envelope says so', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(AR)]), [...FONTS, '--no-compress', '--direction', 'rtl', '--actual-text', 'false'], 'bare.pdf');
        expect(latin1(bytes)).not.toContain('/ActualText');
        const letters = (s: string): string => [...squash(s)].filter((ch) => RTL.test(ch)).sort().join('');
        expect(letters(pageText(bytes))).toBe(letters(AR));
        const { envelope } = await renderJson(tmp, docOf([para(AR)]), [...FONTS, '--actual-text', 'false']);
        expect(envelope).toMatchObject({ ok: true, actualText: false });
    });

    it('--actual-text accepts true/false forms and refuses anything else', async () => {
        const { envelope } = await renderJson(tmp, docOf([para(LATIN)]), [...FONTS, '--actual-text', 'true']);
        expect(envelope).not.toHaveProperty('actualText');
        const input = await tmp.json('in.json', docOf([para(LATIN)]));
        await expectCliError(() => captured(() => render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--actual-text', 'maybe']))), 2, ErrorCode.USAGE);
    });
});
