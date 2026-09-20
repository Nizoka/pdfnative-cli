// render on the base-14 path (no --font): `layout.typography.metrics: "exact"`
// measures Helvetica with the Adobe Core 14 widths instead of the approximate
// table. It only acts where no registered font measures the text — which is
// why every typography sample rendered with `--font latin` leaves it inert.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractText, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { TempFiles, renderTo, sha256 } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const PINNED = ['--creation-date', '2026-01-01T00:00:00Z'] as const;
const TEXT = 'Wide and narrow glyphs — "quoted", ‘single’, an ellipsis… and WWWW iiii MMMM llll, measured line after line. '.repeat(14);
const doc = (metrics?: string): unknown => ({
    title: 'Base-14 metrics',
    blocks: [{ type: 'paragraph', text: TEXT, align: 'justify' }],
    ...(metrics !== undefined ? { layout: { typography: { metrics } } } : {}),
});

describe('render: layout.typography.metrics on the base-14 path (engine 1.8.0)', () => {
    it('"exact" changes the line breaks of a Helvetica paragraph; "approximate" is the default', async () => {
        const base = await renderTo(tmp, doc(), PINNED, 'base.pdf');
        const approximate = await renderTo(tmp, doc('approximate'), PINNED, 'approximate.pdf');
        const exact = await renderTo(tmp, doc('exact'), PINNED, 'exact.pdf');
        expect(sha256(approximate.bytes)).toBe(sha256(base.bytes));
        expect(sha256(exact.bytes)).not.toBe(sha256(base.bytes));
        expect(extractText(new Uint8Array(exact.bytes))[0]?.text).toContain('measured line after line');
    });

    it('"exact" moves the line breaks a reader sees in the extracted text', async () => {
        const lines = async (metrics?: string): Promise<string> =>
            extractText(new Uint8Array((await renderTo(tmp, doc(metrics), PINNED, `lines-${metrics ?? 'default'}.pdf`)).bytes))[0]!.text;
        const exact = await lines('exact');
        const base = await lines();
        expect(exact).not.toBe(base);
        // Same words, different line breaks.
        const words = (text: string): string => text.split(/[ \n]+/).join(' ');
        expect(words(exact)).toBe(words(base));
    });

    it('is inert once a registered font measures the text', async () => {
        const font = ['--font', 'latin', '--lang', 'latin', ...PINNED];
        const base = await renderTo(tmp, doc(), font, 'font-base.pdf');
        const exact = await renderTo(tmp, doc('exact'), font, 'font-exact.pdf');
        expect(sha256(exact.bytes)).toBe(sha256(base.bytes));
    });
});
