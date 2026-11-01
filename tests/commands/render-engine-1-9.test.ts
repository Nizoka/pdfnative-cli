// render: the layout and font behaviour pdfnative 1.9.0 changed, each with one
// observable of its own through the CLI (the compatibility ledger of the
// engine's release note): the six-letter subset tag (C21), lean and compact
// subsets (C6, C28) and the .notdef stub of an unused font (C18), one text
// object per line (C25), the page transparency group (C11), tagged-table
// semantics (C12), the paginated table of contents
// (#83), U+202F on the base-14 path (C10), the amount column kind, a chart
// series without a label (#82).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setDefaultCreationDate, extractText } from '../../src/core-bridge/index.js';
import { TempFiles, MINIMAL_DOC, renderTo, renderJson, inspectLayoutTo, diagnosticCodes, latin1, expectCliError, captured } from '../helpers/cli-harness.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const PINNED = ['--creation-date', '2026-01-01T00:00:00Z', '--no-compress'] as const;
const LATIN = ['--font', 'latin', '--lang', 'latin', ...PINNED];
const docOf = (blocks: readonly unknown[], layout?: unknown): unknown => ({ title: 'Engine 1.9.0', blocks, ...(layout !== undefined ? { layout } : {}) });
const para = (text: string, extra: Record<string, unknown> = {}): unknown => ({ type: 'paragraph', text, ...extra });
const count = (raw: string, re: RegExp): number => (raw.match(re) ?? []).length;

describe('render: embedded subsets (pdfnative 1.9.0 — C6, C18, C21, C28)', { timeout: 60_000 }, () => {
    it('a subset font name carries the six-letter tag outside PDF/A-1, and stays bare under pdfa1b', async () => {
        const tagged = await renderTo(tmp, docOf([para('One paragraph of Latin text.')]), LATIN, 'tag.pdf');
        expect(latin1(tagged.bytes)).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans/);
        const pdfa1 = await renderTo(tmp, docOf([para('One paragraph of Latin text.')]), [...LATIN, '--tagged', 'pdfa1b'], 'pdfa1.pdf');
        expect(latin1(pdfa1.bytes)).toMatch(/\/BaseFont \/NotoSans/);
        expect(latin1(pdfa1.bytes)).not.toMatch(/\/BaseFont \/[A-Z]{6}\+/);
    });

    it('a one-paragraph Noto Sans subset is compact: CIDs from 1 in one /W group, and the whole file stays small', async () => {
        const { bytes } = await renderTo(tmp, docOf([para('The quick brown fox jumps over the lazy dog.')]), LATIN, 'compact.pdf');
        const raw = latin1(bytes);
        expect(raw).toMatch(/\/W \[1 \[/);
        // Noto Sans is a 100+ KB face; a lean, compact subset of one sentence is a few KB.
        expect(bytes.length).toBeLessThan(60_000);
    });

    it('a registered font no character reaches is a .notdef-only stub with /W [] — its objects stay, its program does not', async () => {
        const { bytes } = await renderTo(tmp, docOf([para('Latin only, though Hebrew is registered.')]), ['--font', 'he', '--font', 'latin', '--lang', 'he,latin', ...PINNED], 'stub.pdf');
        const raw = latin1(bytes);
        expect(raw).toContain('/W []');
        expect(raw).toContain('NotoSansHebrew');
        expect(bytes.length).toBeLessThan(80_000);
    });

    it('a shaped line is one text object: a Thai paragraph is one BT … ET holding a TJ array (C25)', async () => {
        // demo-language: th (a one-line shaped paragraph whose tone marks carry GPOS offsets)
        const { bytes } = await renderTo(tmp, docOf([para('ตั้ง สิ่ง ที่ นี่ ปั้น')]), ['--font', 'th', '--font', 'latin', '--lang', 'th,latin', ...PINNED], 'thai.pdf');
        const raw = latin1(bytes);
        // Title, the paragraph and the page footer: three lines, three text objects — the
        // shaped glyphs are placed by TJ arrays inside the paragraph's object, not one BT each.
        expect(count(raw, /\bBT\b/g)).toBe(3);
        expect(count(raw, /\] TJ/g)).toBeGreaterThan(0);
    });
});

describe('render: page and structure semantics (pdfnative 1.9.0 — C10, C11, C12)', { timeout: 60_000 }, () => {
    it('a page painting with constant alpha carries a transparency group; a page without one does not (C11)', async () => {
        const plain = await renderTo(tmp, docOf([para('Opaque.')]), LATIN, 'plain.pdf');
        expect(latin1(plain.bytes)).not.toContain('/S /Transparency');
        const alpha = await renderTo(tmp, docOf([para('Watermarked.')]), [...LATIN, '--watermark-text', 'DRAFT', '--watermark-opacity', '0.4'], 'alpha.pdf');
        expect(latin1(alpha.bytes)).toMatch(/\/Group\s*<<[^>]*\/S \/Transparency/);
    });

    it('a tagged table writes /Scope on its headers, /Headers on its cells and an /IDTree (C12)', async () => {
        const table = { type: 'table', headers: ['Item', 'Qty'], rows: [{ cells: ['Widget', '2'], type: 'normal', pointed: false }] };
        const { envelope, bytes } = await renderJson(tmp, docOf([para('A tagged table.'), table]), [...LATIN, '--tagged', 'pdfa2b', '--strict']);
        expect(diagnosticCodes(envelope)).toEqual([]);
        const raw = latin1(bytes);
        expect(raw).toContain('/Scope /Column');
        expect(raw).toContain('/Headers');
        expect(raw).toContain('/IDTree');
    });

    it('U+202F before a French exclamation mark on the base-14 path is a TJ adjustment, not a space (C10)', async () => {
        // demo-language: fr (French punctuation spacing)
        const { bytes } = await renderTo(tmp, docOf([para('Bonjour !')], { typography: { punctuationSpacing: 'fr' } }), [...PINNED], 'fr.pdf');
        const raw = latin1(bytes);
        // The space glyph (278/1000) pulled back by 111 leaves the 167/1000 em of U+202F.
        expect(raw).toMatch(/\[\(Bonjour \) 111 \(!\)\] TJ/);
        expect(raw).not.toContain('(Bonjour !)');
    });
});

describe('render: layout fixes observed through --inspect-layout (pdfnative 1.9.0 — #83)', { timeout: 60_000 }, () => {

    // #80 (deep-descender rows) is not observable through the CLI: a document
    // table row is 15.45 pt here and its bottom space already clears the Myanmar
    // descender at 7.5 pt, so the plan reserves nothing (the engine's own test
    // drives planTable at the 12 pt row where the reservation shows) —
    // tests/regression/engine-surface.json carries the tested-upstream waiver.

    it('a table of contents longer than its page continues on the next pages (#83)', async () => {
        const blocks: unknown[] = [{ type: 'toc', title: 'Contents' }];
        for (let i = 0; i < 160; i++) blocks.push({ type: 'heading', text: `Section ${i + 1}`, level: 1 }, para('Body.'));
        const report = await inspectLayoutTo(tmp, docOf(blocks), LATIN);
        const pagesWithToc = report.pages.filter((p) => p.blocks.some((b) => b.type === 'toc')).length;
        expect(pagesWithToc).toBeGreaterThan(1);
        const firstHeadingPage = report.pages.findIndex((p) => p.blocks.some((b) => b.type === 'heading'));
        expect(firstHeadingPage).toBeGreaterThanOrEqual(1);
        expect(report.totalPages).toBeGreaterThan(pagesWithToc);
    });
});

describe('render: the table variant and chart series (pdfnative 1.9.0)', { timeout: 60_000 }, () => {
    // infoItems is { label, value }[] by type; 1.8.0 rendered a bare string as
    // "undefined", 1.9.0's base-14 emitter throws a TypeError on it (the
    // v1.5.0 table-variant sample carried strings). The CLI refuses the shape
    // first, with E_INPUT and the remedy — the engine never sees it.
    it('--variant table: an infoItems entry that is not { label, value } is E_INPUT before the engine, and so is a malformed row', async () => {
        const base = { docTitle: 'Shape', title: 'Ledger', balanceText: '', countText: '', footerText: '', headers: ['A'], rows: [{ type: 'data', pointed: false, cells: ['x'] }] };
        const strings = await tmp.json('strings.json', { ...base, infoItems: ['Period: Q1 2026'] });
        await expectCliError(() => captured(() => render(parseArgs(['--input', strings, '--output', tmp.path('x.pdf'), '--variant', 'table']))), 1, ErrorCode.INPUT, 'infoItems[0]');
        const rows = await tmp.json('rows.json', { ...base, infoItems: [], rows: [['x']] });
        await expectCliError(() => captured(() => render(parseArgs(['--input', rows, '--output', tmp.path('x.pdf'), '--variant', 'table']))), 1, ErrorCode.INPUT, 'rows[0]');
        const good = await renderTo(tmp, { ...base, infoItems: [{ label: 'Period', value: 'Q1 2026' }] }, ['--variant', 'table', ...PINNED], 'good.pdf');
        expect(latin1(good.bytes)).toContain('(Period :) Tj');
    });

    it('--variant table: a column of kind "amount" right-aligns its figures (ColumnDef.kind)', async () => {
        const table = {
            docTitle: 'Amounts', title: 'Ledger', infoItems: [], balanceText: '', countText: '', footerText: '',
            headers: ['Item', 'Amount'], rows: [{ type: 'data', pointed: false, cells: ['Widget', '1,234.50'] }, { type: 'data', pointed: false, cells: ['Gadget', '7.25'] }],
        };
        const columns = [{ f: 0.5, a: 'l', mx: 20, mxH: 20 }, { f: 0.5, a: 'l', mx: 20, mxH: 20, kind: 'amount' }];
        const plain = await renderTo(tmp, table, ['--variant', 'table', ...PINNED, '--layout', await tmp.json('plain.json', { columns: [columns[0], { ...columns[1], kind: undefined }] })], 'plain.pdf');
        const amount = await renderTo(tmp, table, ['--variant', 'table', ...PINNED, '--layout', await tmp.json('amount.json', { columns })], 'amount.pdf');
        // The amount column is set in the figures face (/F2), the others in the text face (/F1) — the engine's own observable.
        expect(latin1(amount.bytes)).toMatch(/\/F2 [\d.]+ Tf [\d.]+ [\d.]+ Td \(7\.25\) Tj/);
        expect(latin1(amount.bytes)).toMatch(/\/F1 [\d.]+ Tf [\d.]+ [\d.]+ Td \(Gadget\) Tj/);
        expect(latin1(plain.bytes)).toMatch(/\/F1 [\d.]+ Tf [\d.]+ [\d.]+ Td \(7\.25\) Tj/);
    });

    it('a chart series without a label renders (no TypeError, #82) and the legend still lists the labelled one', async () => {
        const chart = { type: 'chart', chartType: 'bar', categories: ['A', 'B'], series: [{ values: [1, 2] }, { label: 'Named', values: [2, 1] }] };
        const { envelope, bytes } = await renderJson(tmp, docOf([chart]), LATIN);
        expect(envelope).toMatchObject({ ok: true });
        const legend = extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');
        expect(legend).toContain('Series 1');
        expect(legend).toContain('Named');
    });

    it('the shipped minimal document is byte-identical with and without the four 1.9.0 options at their defaults', async () => {
        const a = await renderTo(tmp, MINIMAL_DOC, LATIN, 'a.pdf');
        const b = await renderTo(tmp, MINIMAL_DOC, [...LATIN, '--actual-text', 'true'], 'b.pdf');
        expect(Buffer.compare(a.bytes, b.bytes)).toBe(0);
    });

    it('a --layout "tagged": true (the engine\'s structure tree without a claim) never reaches the envelope, whose tagged is a PDF/A level', async () => {
        const layout = await tmp.json('tagged-true.json', { tagged: true });
        const { envelope } = await renderJson(tmp, docOf([para('Structure, no claim.')]), [...LATIN, '--layout', layout]);
        expect(envelope).toMatchObject({ ok: true });
        expect(envelope).not.toHaveProperty('tagged');
        const claimed = await renderJson(tmp, docOf([para('A claim.')]), [...LATIN, '--tagged', 'pdfa2b']);
        expect(claimed.envelope).toMatchObject({ tagged: 'pdfa2b' });
    });
});
