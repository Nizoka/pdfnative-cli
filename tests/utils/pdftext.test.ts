// utils/pdftext.ts + its two consumers: /Info text strings outside Latin-1 are
// written as UTF-16BE by pdfnative, and `inspect` / `compare` must report the
// text — before v1.5.0 `inspect` answered `title: null` for any title holding
// as little as an em dash.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { decodePdfTextString } from '../../src/utils/pdftext.js';
import { inspect } from '../../src/commands/inspect.js';
import { compare } from '../../src/commands/compare.js';
import { parseArgs } from '../../src/utils/args.js';
import { TempFiles, renderTo, captured, captureStdout } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

const byteString = (bytes: readonly number[]): string => String.fromCharCode(...bytes);
const utf16be = (text: string): string => byteString([0xFE, 0xFF, ...[...text].flatMap((ch) => {
    const units: number[] = [];
    for (let i = 0; i < ch.length; i++) units.push(ch.charCodeAt(i) >> 8, ch.charCodeAt(i) & 0xFF);
    return units;
})]);

describe('decodePdfTextString', () => {
    it('returns a string without a byte-order mark unchanged', () => {
        expect(decodePdfTextString('Quarterly report')).toBe('Quarterly report');
        expect(decodePdfTextString('')).toBe('');
    });

    it('decodes UTF-16BE, surrogate pairs included', () => {
        const text = `Report ${String.fromCodePoint(0x2014)} ${String.fromCodePoint(0x65E5, 0x672C)} ${String.fromCodePoint(0x1F4C4)}`;
        expect(decodePdfTextString(utf16be(text))).toBe(text);
    });

    it('decodes a UTF-8 string with its byte-order mark (PDF 2.0)', () => {
        const text = `Caf${String.fromCodePoint(0xE9)} ${String.fromCodePoint(0x2014)} menu`;
        expect(decodePdfTextString(byteString([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(text)]))).toBe(text);
    });

    it('never throws on a truncated UTF-16 value', () => {
        expect(() => decodePdfTextString(byteString([0xFE, 0xFF, 0x00]))).not.toThrow();
    });
});

describe('inspect / compare: /Info values outside Latin-1', () => {
    const TITLE = `Annual Report ${String.fromCodePoint(0x2014)} ${String.fromCodePoint(0x65E5, 0x672C, 0x8A9E)}`;
    const AUTHOR = `Zo${String.fromCodePoint(0xEB)} ${String.fromCodePoint(0x0141)}ukasz`;
    const doc = (title: string): unknown => ({ title, metadata: { author: AUTHOR, subject: `Subject ${String.fromCodePoint(0x2013)} dashes` }, blocks: [{ type: 'paragraph', text: 'Body.' }] });

    it('inspect reports the decoded title, author and subject, in JSON and in text', async () => {
        const { output } = await renderTo(tmp, doc(TITLE), ['--creation-date', '2026-01-01T00:00:00Z']);
        const json = await captured(() => inspect(parseArgs(['--input', output, '--format', 'json'])));
        const metadata = (JSON.parse(json.stdout) as { metadata: { title: string; author: string; subject: string } }).metadata;
        expect(metadata.title).toBe(TITLE);
        expect(metadata.author).toBe(AUTHOR);
        expect(metadata.subject).toContain(String.fromCodePoint(0x2013));
        const text = await captured(() => inspect(parseArgs(['--input', output, '--format', 'text'])));
        expect(text.stdout).toContain(TITLE);
    });

    it('compare shows readable titles in a metadata difference', async () => {
        const a = await renderTo(tmp, doc(TITLE), ['--creation-date', '2026-01-01T00:00:00Z'], 'a.pdf');
        const b = await renderTo(tmp, doc(`${TITLE} (v2)`), ['--creation-date', '2026-01-01T00:00:00Z'], 'b.pdf');
        // compare prints its report, then rejects (exit 1) because the files differ: keep the stdout.
        const out = captureStdout();
        await compare(parseArgs([a.output, b.output, '--format', 'json'])).catch(() => undefined);
        out.restore();
        const diffs = (JSON.parse(out.text()) as { differences: { kind: string; path?: string; a?: string; b?: string }[] }).differences;
        const title = diffs.find((d) => d.kind === 'metadata' && d.path === 'Title');
        expect(title?.a).toBe(TITLE);
        expect(title?.b).toBe(`${TITLE} (v2)`);
    });
});
