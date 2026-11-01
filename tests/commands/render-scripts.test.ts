// render --font / --lang: every one of the 27 bundled script codes is rendered
// with its own font THROUGH the CLI (engine 1.8.0), plus the shaping fixes of
// that release that a reader of the PDF can observe.
//
// Text comes from tests/helpers/script-text.ts (the engine's vetted language
// documents). The extraction round-trip runs on tagged output, where
// pdfnative writes /ActualText with the source string.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractText, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { SCRIPT_CODES } from '../../src/utils/fonts.js';
import { TempFiles, renderTo, renderJson, diagnosticCodes, latin1 } from '../helpers/cli-harness.js';
import { SCRIPT_TEXT, SHAPING_PROBES } from '../helpers/script-text.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const PINNED = ['--creation-date', '2026-01-01T00:00:00Z'] as const;
// Latin is registered next to the script font: the title line and the page
// footer are Latin, and since pdfnative 1.9.0 a character the routed font
// does not cover is TEXT_GLYPH_NOT_COVERED (an error under --strict).
const fontArgs = (code: string): string[] => ['--font', code, '--font', 'latin', '--lang', `${code},latin`, ...PINNED];
const docOf = (text: string): unknown => ({ title: 'Script', blocks: [{ type: 'paragraph', text }] });
const textOf = (bytes: Uint8Array): string => extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');
/** Extraction returns NFC or the source order; compare without whitespace and normalisation differences. */
const squash = (s: string): string => s.normalize('NFC').replace(/\s+/gu, '');

describe('render: the 32 script codes (engine 1.9.0)', { timeout: 60_000 }, () => {
    it('the text table covers exactly the script codes of the allow-list', () => {
        expect(Object.keys(SCRIPT_TEXT).sort()).toEqual([...SCRIPT_CODES].sort());
    });

    it.each(SCRIPT_CODES.map((code) => [code, SCRIPT_TEXT[code]!] as const))('%s: its font is embedded, a PDF/A-2b --strict render raises nothing, and the text comes back', async (code, text) => {
        const { envelope, bytes } = await renderJson(tmp, docOf(text), [...fontArgs(code), '--tagged', 'pdfa2b', '--strict']);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(diagnosticCodes(envelope)).toEqual([]);
        expect(latin1(bytes)).toContain('/FontFile2');
        expect(squash(textOf(bytes))).toContain(squash(text));
    });
});

describe('render: shaping fixes of engine 1.8.0 and 1.9.0, observed through the CLI', { timeout: 60_000 }, () => {
    /** The paragraph alone: the title line and the page-number footer are dropped. */
    const body = (bytes: Uint8Array): string =>
        textOf(bytes).split('\n').filter((l) => l.trim() !== 'Script' && !/^[0-9]+\/[0-9]+$/.test(l.trim())).join('\n');
    const untagged = async (code: string, text: string, name: string): Promise<{ bytes: Buffer; text: string }> => {
        const { bytes } = await renderTo(tmp, docOf(text), [...fontArgs(code), '--no-compress'], name);
        return { bytes, text: body(bytes) };
    };
    const tagged = async (code: string, text: string): Promise<string> =>
        body((await renderTo(tmp, docOf(text), [...fontArgs(code), '--tagged', 'pdfa2b'], 'tagged.pdf')).bytes);
    /** Glyph id 0 (.notdef) in a shown string, on a 4-hex-digit boundary. */
    const showsNotdef = (bytes: Uint8Array): boolean =>
        [...latin1(bytes).matchAll(/<([0-9A-Fa-f]+)> *(?=Tj|[-0-9.]+ *<|\] *TJ)/g)].some((m) => { const glyphs: string[] = m[1]!.match(/.{4}/g) ?? []; return glyphs.includes('0000'); });
    /** Compatibility-equal: Thai / Lao sara am extracts decomposed, which NFKD folds. */
    const folded = (s: string): string => squash(s).normalize('NFKD');
    const letters = (s: string): string => [...folded(s)].sort().join('');

    it.each([
        ['hiConjuncts', ...SHAPING_PROBES.hiConjuncts],
        ['loSaraAm', ...SHAPING_PROBES.loSaraAm],
    ] as const)('%s: a shaped cluster extracts as its source letters from UNTAGGED output (ShapedGlyph.cps → ToUnicode)', async (_name, code, text) => {
        const out = await untagged(code, text, 'shaped.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(folded(out.text)).toBe(folded(text));
    });

    it.each([
        ['hiReph', ...SHAPING_PROBES.hiReph],
        ['bnReph', ...SHAPING_PROBES.bnReph],
        ['taPreBase', ...SHAPING_PROBES.taPreBase],
        ['thSaraAm', ...SHAPING_PROBES.thSaraAm],
    ] as const)('%s: reordered glyphs keep every source letter untagged (visual order), and the logical order once tagged', async (_name, code, text) => {
        const out = await untagged(code, text, 'reordered.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(letters(out.text)).toBe(letters(text));
        expect(folded(await tagged(code, text))).toBe(folded(text));
    });

    it.each([
        ['kmCoeng', ...SHAPING_PROBES.kmCoeng],
        ['myKinzi', ...SHAPING_PROBES.myKinzi],
    ] as const)('%s: stacked clusters draw without .notdef and extract exactly once tagged', async (_name, code, text) => {
        const out = await untagged(code, text, 'stacks.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(folded(await tagged(code, text))).toBe(folded(text));
    });

    // pdfnative 1.9.0 (C20): an untagged run whose glyphs are not in the order of
    // its text carries the text as /Span /ActualText, so stacked Khmer and Myanmar
    // clusters extract as their source letters without --tagged (a 1.8.0 limit).
    it.each([
        ['kmCoeng', ...SHAPING_PROBES.kmCoeng],
        ['myKinzi', ...SHAPING_PROBES.myKinzi],
        ['kmTwoPart', ...SHAPING_PROBES.kmTwoPart],
        ['myEVowel', ...SHAPING_PROBES.myEVowel],
    ] as const)('%s: UNTAGGED extraction returns the source letters (pdfnative 1.9.0 /ActualText)', async (_name, code, text) => {
        const out = await untagged(code, text, 'stacks-untagged.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(latin1(out.bytes)).toContain('/ActualText');
        expect(letters(out.text)).toBe(letters(text));
    });

    it('--actual-text false restores the bare 1.8.0 runs: no /ActualText, same letters in visual order', async () => {
        const [code, text] = SHAPING_PROBES.kmCoeng;
        const { bytes } = await renderTo(tmp, docOf(text), [...fontArgs(code), '--no-compress', '--actual-text', 'false'], 'bare.pdf');
        expect(latin1(bytes)).not.toContain('/ActualText');
        expect(showsNotdef(bytes)).toBe(false);
    });

    // pdfnative 1.9.0 — the five Indic scripts and the shaping fixes of the release,
    // each with one observable of its own.
    it.each([
        ['knBeforeSub', ...SHAPING_PROBES.knBeforeSub],
        ['mlSplitVowel', ...SHAPING_PROBES.mlSplitVowel],
        ['orDanda', ...SHAPING_PROBES.orDanda],
        ['hiMultiple', ...SHAPING_PROBES.hiMultiple],
    ] as const)('%s: draws no .notdef and extracts as typed, tagged or not (pdfnative 1.9.0)', async (_name, code, text) => {
        const out = await untagged(code, text, 'indic-1.9.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(squash(out.text)).toBe(squash(text));
        expect(squash(await tagged(code, text))).toBe(squash(text));
    });

    it('mlLegacyChillu: consonant + virama + ZWJ draws the chillu and extracts as its three code points (C19)', async () => {
        const [code, text] = SHAPING_PROBES.mlLegacyChillu;
        const out = await untagged(code, text, 'chillu.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        // The legacy spelling names its three code points; NFC keeps them — compare letter sets without the joiner.
        const bare = (s: string): string => letters(s.replace(/\u200D/gu, ''));
        expect(bare(out.text)).toBe(bare(text));
    });

    it('mlWideWord: a wide Malayalam glyph in its own text object is not spaced out (pdfnative 1.9.0 word gaps)', async () => {
        const [code, text] = SHAPING_PROBES.mlWideWord;
        const out = await untagged(code, text, 'wide.pdf');
        expect(out.text.trim()).toBe(text);
    });

    // KNOWN UPSTREAM LIMIT (pdfnative 1.9.0, ROADMAP.md): a Thai above vowel + tone mark
    // pair may extract in geometric order from untagged output (ตั้ง → ตัง้); the
    // ToUnicode is right and the tagged output exact. `it.fails` turns red when fixed.
    it.fails('thToneBelow: UNTAGGED extraction keeps the logical order of an above vowel + tone mark (upstream limit today)', async () => {
        const [code, text] = SHAPING_PROBES.thToneBelow;
        expect(squash((await untagged(code, text, 'th-tone.pdf')).text)).toBe(squash(text));
    });

    it.each([
        ['plOgonek', ...SHAPING_PROBES.plOgonek],
        ['trDotless', ...SHAPING_PROBES.trDotless],
        ['viStacked', ...SHAPING_PROBES.viStacked],
    ] as const)('%s: the subsetted Latin modules draw every letter they advertise (no .notdef)', async (_name, code, text) => {
        const out = await untagged(code, text, 'latin-ext.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect(squash(out.text)).toBe(squash(text));
    });

    const CJK = [
        ['ko', SHAPING_PROBES.koFinals[1]],
        ['zh', SCRIPT_TEXT['zh']!],
        ['ja', SCRIPT_TEXT['ja']!],
    ] as const;

    it.each(CJK)('%s: CJK modules (GSUB extension lookups) render one character per source character, exact once tagged', async (code, text) => {
        const out = await untagged(code, text, 'cjk.pdf');
        expect(showsNotdef(out.bytes)).toBe(false);
        expect([...squash(out.text)]).toHaveLength([...squash(text)].length);
        expect(squash(await tagged(code, text))).toBe(squash(text));
    });

    // pdfnative 1.9.0 (C4): the code point actually encoded wins over the inverted cmap,
    // so an ideograph that shares its glyph with a Kangxi radical extracts as itself
    // from untagged output (U+6708, not U+2F49 — a 1.8.0 limit).
    it('zh: UNTAGGED extraction returns the ideographs themselves, not Kangxi radicals (pdfnative 1.9.0)', async () => {
        const text = SCRIPT_TEXT['zh']!;
        expect(squash((await untagged('zh', text, 'zh-exact.pdf')).text)).toBe(squash(text));
    });

    it('U+061C ARABIC LETTER MARK is stripped before measuring: the same glyphs are shown with and without it', async () => {
        const [code, text] = SHAPING_PROBES.arContextual;
        const alm = String.fromCodePoint(0x061C);
        const plain = await untagged(code, text, 'ar.pdf');
        const marked = await untagged(code, `${alm}${text}${alm}`, 'ar-alm.pdf');
        expect(showsNotdef(marked.bytes)).toBe(false);
        const shown = (b: Uint8Array): string => [...latin1(b).matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => m[1]).join(' ');
        expect(shown(marked.bytes)).toBe(shown(plain.bytes));
    });
});
