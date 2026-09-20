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
const fontArgs = (code: string): string[] => ['--font', code, '--lang', code, ...PINNED];
const docOf = (text: string): unknown => ({ title: 'Script', blocks: [{ type: 'paragraph', text }] });
const textOf = (bytes: Uint8Array): string => extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');
/** Extraction returns NFC or the source order; compare without whitespace and normalisation differences. */
const squash = (s: string): string => s.normalize('NFC').replace(/\s+/gu, '');

describe('render: the 27 script codes (engine 1.8.0)', { timeout: 60_000 }, () => {
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

describe('render: shaping fixes of engine 1.8.0, observed through the CLI', { timeout: 60_000 }, () => {
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

    // KNOWN UPSTREAM LIMIT (pdfnative 1.8.0, ROADMAP.md): untagged output maps some stacked
    // Khmer / Myanmar glyphs to U+FFFD. `it.fails` turns red the day the engine fixes it —
    // then delete the marker and fold these inputs into the case above.
    it.fails.each([
        ['kmCoeng', ...SHAPING_PROBES.kmCoeng],
        ['myKinzi', ...SHAPING_PROBES.myKinzi],
    ] as const)('%s: UNTAGGED extraction returns the source letters (upstream limit today)', async (_name, code, text) => {
        expect(letters((await untagged(code, text, 'stacks-untagged.pdf')).text)).toBe(letters(text));
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

    // KNOWN UPSTREAM LIMIT (pdfnative 1.8.0, ROADMAP.md): an ideograph that shares its glyph with a
    // Kangxi radical extracts as the radical from untagged output (U+2F49 for U+6708).
    it.fails('zh: UNTAGGED extraction returns the ideographs themselves, not Kangxi radicals (upstream limit today)', async () => {
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
