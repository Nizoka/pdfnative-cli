// render: the pdfnative 1.8.0 typography surface, ONE observable assertion per
// option (tests/commands/render-typography.test.ts covers the flags and the
// merge rules). Every option is driven through `layout.typography` exactly as
// a user document carries it, and proved by what a reader of the PDF can see:
// extracted text, the page map of --inspect-layout, or operator positions.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractText, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { TempFiles, renderTo, renderJson, inspectLayoutTo, diagnosticCodes, sha256, latin1, pageCount } from '../helpers/cli-harness.js';
import type { LaidOutBlock, LayoutReport } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const LATIN = ['--font', 'latin', '--lang', 'latin', '--creation-date', '2026-01-01T00:00:00Z'] as const;
const NBSP = '\u00A0';
const NNBSP = '\u202F';
const SHY = '\u00AD';
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

type Typography = Record<string, unknown>;
const para = (text: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: 'paragraph', text, ...extra });
const docOf = (blocks: readonly unknown[], typography?: Typography): unknown =>
    ({ title: 'Typography surface', blocks, ...(typography !== undefined ? { layout: { typography } } : {}) });
const textOf = (bytes: Uint8Array): string => extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');

const blocksOf = (report: LayoutReport): LaidOutBlock[] => report.pages.flatMap((p) => [...p.blocks]);

/** A page of filler, then a paragraph long enough to straddle the page break. */
const straddling = (typography: Typography): unknown => docOf([
    ...Array.from({ length: 13 }, () => para(LOREM.repeat(2))),
    para(LOREM.repeat(8)),
], typography);

describe('punctuationSpacing (engine 1.8.0: the font’s own no-break spaces)', () => {
    // demo-language: fr (French and Canadian-French spacing conventions are the subject under test)
    const FRENCH = 'Vraiment ? Oui ! Ainsi ; Total : 42. Et une « citation » pour finir.';

    it('"fr" and "fr-CA" are different conventions: different bytes, different extracted spaces', async () => {
        const plain = await renderTo(tmp, docOf([para(FRENCH)]), LATIN, 'plain.pdf');
        const fr = await renderTo(tmp, docOf([para(FRENCH)], { punctuationSpacing: 'fr' }), LATIN, 'fr.pdf');
        const frCa = await renderTo(tmp, docOf([para(FRENCH)], { punctuationSpacing: 'fr-CA' }), LATIN, 'fr-ca.pdf');
        expect(new Set([sha256(plain.bytes), sha256(fr.bytes), sha256(frCa.bytes)]).size).toBe(3);

        const frText = textOf(fr.bytes);
        expect(frText).toContain(`Vraiment${NNBSP}?`);
        expect(frText).toContain(`Total${NBSP}:`);
        expect(frText).toContain(`«${NBSP}citation${NBSP}»`);

        const caText = textOf(frCa.bytes);
        expect(caText).toContain(`Total${NBSP}:`);
        expect(caText).not.toContain(`Vraiment${NNBSP}?`);
        expect(textOf(plain.bytes)).toContain('Vraiment ?');
    });

    it('explicit PunctuationSpacingRule[] applies exactly the rules given', async () => {
        const rules = [{ char: '%', side: 'before', space: 'narrow' }];
        const { bytes } = await renderTo(tmp, docOf([para('A margin of 42 % on 150 units ?')], { punctuationSpacing: rules }), LATIN);
        const text = textOf(bytes);
        expect(text).toContain(`42${NNBSP}%`);
        expect(text).toContain('units ?');
    });

    it('degrades to plain spaces on the base-14 path (no font carries U+202F there)', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(FRENCH)], { punctuationSpacing: 'fr' }));
        expect(textOf(bytes)).toContain('Vraiment ?');
    });
});

describe('paragraph breaking: splitParagraphs, orphans, widows, keep rules', () => {
    it('orphans / widows move the break: a stricter pair gives a different page map', async () => {
        const loose = await inspectLayoutTo(tmp, straddling({ splitParagraphs: true, orphans: 1, widows: 1 }));
        const strict = await inspectLayoutTo(tmp, straddling({ splitParagraphs: true, orphans: 6, widows: 6 }));
        expect(loose.totalPages).toBeGreaterThan(1);
        expect(JSON.stringify(strict.pages)).not.toBe(JSON.stringify(loose.pages));
    });

    it('splittable: false keeps one paragraph whole while its neighbours split', async () => {
        const blocks = (splittable: boolean): unknown[] => [
            ...Array.from({ length: 13 }, () => para(LOREM.repeat(2))),
            para(LOREM.repeat(8), splittable ? {} : { splittable: false }),
        ];
        const split = blocksOf(await inspectLayoutTo(tmp, docOf(blocks(true), { splitParagraphs: true })));
        const whole = blocksOf(await inspectLayoutTo(tmp, docOf(blocks(false), { splitParagraphs: true })));
        // Split: the last paragraph is laid out as slices on two pages; whole: as one block.
        expect(split.length).toBeGreaterThan(whole.length);
        expect(new Set(whole.slice(13).map((b) => b.page)).size).toBe(1);
    });

    it('keepWithNext on a block carries it to the page of the block that follows', async () => {
        const blocks = (keep: boolean): unknown[] => [
            ...Array.from({ length: 14 }, () => para(LOREM.repeat(2))),
            para('A lead-in sentence that introduces what follows.', keep ? { keepWithNext: true } : {}),
            para(LOREM.repeat(6)),
        ];
        const base = blocksOf(await inspectLayoutTo(tmp, docOf(blocks(false))));
        const kept = blocksOf(await inspectLayoutTo(tmp, docOf(blocks(true))));
        const leadIn = (list: LaidOutBlock[]): LaidOutBlock => list[14]!;
        const next = (list: LaidOutBlock[]): LaidOutBlock => list[15]!;
        expect(leadIn(kept).page).toBe(next(kept).page);
        expect(JSON.stringify(kept)).not.toBe(JSON.stringify(base));
    });

    it('keepHeadingsWithNext with splitParagraphs: no heading is stranded at the foot of a page', async () => {
        const blocks: unknown[] = [];
        for (let i = 0; i < 10; i++) {
            blocks.push({ type: 'heading', text: `Section ${i + 1}`, level: 2 });
            blocks.push(para(LOREM.repeat(5), { align: 'justify' }));
        }
        const report = await inspectLayoutTo(tmp, docOf(blocks, { splitParagraphs: true, keepHeadingsWithNext: true }));
        expect(report.totalPages).toBeGreaterThan(1);
        for (const page of report.pages) {
            expect(page.blocks.at(-1)?.type, 'last block of a page').not.toBe('heading');
        }
    });
});

describe('text-level options, each one observable on its own', () => {
    it('a soft hyphen (U+00AD) is a break opportunity, never a character of the text', async () => {
        const word = `anti${SHY}constitution${SHY}nellement`;
        const { bytes } = await renderTo(tmp, docOf([para(`${word} `.repeat(30))]), LATIN);
        const text = textOf(bytes);
        expect(text).not.toContain(SHY);
        expect(text.replace(/-\s*\n?/g, '')).toContain('anticonstitutionnellement');
    });

    it('align: "justify" keeps the inter-word spaces in the extracted text', async () => {
        const { bytes } = await renderTo(tmp, docOf([para(LOREM.repeat(4), { align: 'justify' })]), LATIN);
        expect(textOf(bytes)).toMatch(/Lorem ipsum dolor sit amet/);
    });

    it('unitBinding ties a number to its unit with a no-break space', async () => {
        const doc = (on: boolean): unknown => docOf([para('The parcel weighs 10 kg and travels 250 km.')], on ? { unitBinding: true } : undefined);
        expect(textOf((await renderTo(tmp, doc(true), LATIN, 'on.pdf')).bytes)).toContain(`10${NBSP}kg`);
        expect(textOf((await renderTo(tmp, doc(false), LATIN, 'off.pdf')).bytes)).toContain('10 kg');
    });

    it('bindShortWords ties a one-letter word to the word that follows', async () => {
        const doc = (on: boolean): unknown => docOf([para('A paragraph that ends on a short word')], on ? { bindShortWords: true } : undefined);
        const on = textOf((await renderTo(tmp, doc(true), LATIN, 'on.pdf')).bytes);
        expect(on).toContain(`A${NBSP}paragraph`);
        expect(on).toContain(`a${NBSP}short`);
        expect(textOf((await renderTo(tmp, doc(false), LATIN, 'off.pdf')).bytes)).toContain('A paragraph');
    });

    it('opticalMargins hangs an opening quote into the left margin', async () => {
        const quoted = '"Opening quotes are the classic case," said the typographer. '.repeat(6);
        const firstX = (bytes: Uint8Array): number =>
            Math.min(...[...latin1(bytes).matchAll(/([\d.]+) [\d.]+ Td/g)].map((m) => Number(m[1])));
        const off = await renderTo(tmp, docOf([para(quoted)]), [...LATIN, '--no-compress'], 'off.pdf');
        const on = await renderTo(tmp, docOf([para(quoted)], { opticalMargins: true }), [...LATIN, '--no-compress'], 'on.pdf');
        expect(firstX(off.bytes)).toBeCloseTo(36, 1);
        expect(firstX(on.bytes)).toBeLessThan(36);
    });

    it('hyphenationLanguage is accepted and inert: the CLI ships no hyphenation provider', async () => {
        const base = await renderTo(tmp, docOf([para(LOREM.repeat(3))]), LATIN, 'base.pdf');
        const de = await renderTo(tmp, docOf([para(LOREM.repeat(3))], { hyphenationLanguage: 'de' }), LATIN, 'de.pdf');
        expect(sha256(de.bytes)).toBe(sha256(base.bytes));
    });
});

describe('fontFeatures', () => {
    it('glyphs substituted by a feature still extract as their source characters (onum)', async () => {
        const { envelope, bytes } = await renderJson(tmp, docOf([para('Figures 0123456789 in old style.')], { fontFeatures: ['onum'] }), LATIN);
        expect(diagnosticCodes(envelope)).toEqual([]);
        expect(textOf(bytes)).toContain('0123456789');
        const plain = await renderTo(tmp, docOf([para('Figures 0123456789 in old style.')]), LATIN, 'plain.pdf');
        expect(sha256(bytes)).not.toBe(sha256(plain.bytes));
    });

    it.each(['smcp', 'c2sc', 'pnum', 'lnum', 'tnum', 'zero', 'ordn', 'sups', 'subs', 'case'])('%s renders, and the only diagnostic it may raise is TYPOGRAPHY_FEATURE_INEFFECTIVE', async (tag) => {
        const { envelope, bytes } = await renderJson(tmp, docOf([para('Small Caps, 1st 2nd, H2O, x2, 0 (zero) and [CASE].')], { fontFeatures: [tag] }), LATIN);
        expect(pageCount(bytes)).toBe(1);
        expect(diagnosticCodes(envelope).filter((c) => c !== 'TYPOGRAPHY_FEATURE_INEFFECTIVE')).toEqual([]);
        // `subs` / `sups` draw glyphs that have code points of their own, so untagged extraction may return those.
        expect(textOf(bytes)).toContain('zero');
    });

    it('a feature whose glyphs carry their own code points (subs) extracts the source text once the output is tagged', async () => {
        const doc = docOf([para('Water is H2O.')], { fontFeatures: ['subs'] });
        const untagged = textOf((await renderTo(tmp, doc, LATIN, 'untagged.pdf')).bytes);
        expect(untagged).toContain('₂');
        const tagged = textOf((await renderTo(tmp, doc, [...LATIN, '--tagged', 'pdfa2b'], 'tagged.pdf')).bytes);
        expect(tagged).toContain('H2O');
    });
});
