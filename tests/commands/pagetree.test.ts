import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { merge } from '../../src/commands/merge.js';
import { split } from '../../src/commands/split.js';
import { extract } from '../../src/commands/extract.js';
import { inspect } from '../../src/commands/inspect.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `pgtree-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

/** Render a PDF with an exact number of pages (pages-1 page breaks). */
async function renderPages(pages: number): Promise<string> {
    const blocks: unknown[] = [{ type: 'heading', text: 'T', level: 1 }];
    for (let i = 0; i < pages; i++) {
        if (i > 0) blocks.push({ type: 'pageBreak' });
        blocks.push({ type: 'paragraph', text: `page ${i + 1}` });
    }
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

async function pageCount(pdfPath: string): Promise<number> {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { chunks.push(String(c)); return true; });
    await inspect(parseArgs(['--input', pdfPath, '--format', 'json', '--summary']));
    return JSON.parse(chunks.join('')).pages as number;
}

describe('merge', () => {
    it('concatenates page counts of all sources', async () => {
        const a = await renderPages(1);
        const b = await renderPages(2);
        const out = tmpPath('merged.pdf');
        await merge(parseArgs([a, b, '--output', out]));
        const bytes = await fs.readFile(out);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(await pageCount(out)).toBe(3);
    });

    it('accepts sources via repeated --input', async () => {
        const a = await renderPages(1);
        const b = await renderPages(1);
        const out = tmpPath('merged2.pdf');
        await merge(parseArgs(['--input', a, '--input', b, '--output', out]));
        expect(await pageCount(out)).toBe(2);
    });

    it('requires at least two sources', async () => {
        const a = await renderPages(1);
        await expect(merge(parseArgs([a, '--output', tmpPath('x.pdf')]))).rejects.toBeInstanceOf(CliError);
    });

    it('dry-run validates without writing', async () => {
        const a = await renderPages(1);
        const b = await renderPages(1);
        const out = tmpPath('nope.pdf');
        await merge(parseArgs([a, b, '--output', out, '--dry-run']));
        await expect(fs.access(out)).rejects.toThrow();
    });
});

describe('split', () => {
    it('splits into one PDF per page by default', async () => {
        const doc = await renderPages(3);
        const outDir = tmpPath('splitdir');
        await split(parseArgs(['--input', doc, '--output-dir', outDir]));
        const files = (await fs.readdir(outDir)).filter((f) => f.endsWith('.pdf'));
        expect(files).toHaveLength(3);
    });

    it('splits by --pages ranges', async () => {
        const doc = await renderPages(3);
        const outDir = tmpPath('splitdir2');
        await split(parseArgs(['--input', doc, '--output-dir', outDir, '--pages', '1-2,3']));
        const files = (await fs.readdir(outDir)).filter((f) => f.endsWith('.pdf'));
        expect(files).toHaveLength(2);
    });

    it('requires --output-dir', async () => {
        const doc = await renderPages(1);
        await expect(split(parseArgs(['--input', doc]))).rejects.toBeInstanceOf(CliError);
    });
});

describe('extract', () => {
    it('extracts the selected pages in order', async () => {
        const doc = await renderPages(4);
        const out = tmpPath('extracted.pdf');
        await extract(parseArgs(['--input', doc, '--pages', '1,3', '--output', out]));
        expect(await pageCount(out)).toBe(2);
    });

    it('requires --pages', async () => {
        const doc = await renderPages(1);
        await expect(extract(parseArgs(['--input', doc]))).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an out-of-range page', async () => {
        const doc = await renderPages(1);
        await expect(
            extract(parseArgs(['--input', doc, '--pages', '9', '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects a non-PDF input', async () => {
        const junk = tmpPath('junk.pdf');
        await fs.writeFile(junk, 'not a pdf', 'utf8');
        await expect(
            extract(parseArgs(['--input', junk, '--pages', '1', '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

// ──────────────────────────────────────────────────────────────────
// v1.4.0 — print-production boxes survive page-tree rebuilds
// (pdfnative 1.7.0 copies /TrimBox /BleedBox /ArtBox /UserUnit — this
// is the non-regression suite for the dependency bump).
// ──────────────────────────────────────────────────────────────────

/** Render a PDF whose pages carry print-production geometry (`layout.print`). */
async function renderPrintPages(pages: number, print: Record<string, unknown>): Promise<string> {
    const blocks: unknown[] = [{ type: 'heading', text: 'T', level: 1 }];
    for (let i = 0; i < pages; i++) {
        if (i > 0) blocks.push({ type: 'pageBreak' });
        blocks.push({ type: 'paragraph', text: `page ${i + 1}` });
    }
    const inPath = tmpPath('print-in.json');
    const layoutPath = tmpPath('print-layout.json');
    const outPath = tmpPath('print-doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await fs.writeFile(layoutPath, JSON.stringify({ print }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath, '--layout', layoutPath]));
    return outPath;
}

/** `inspect --pages` page entries (boxes + userUnit) for a PDF. */
async function inspectPages(pdfPath: string): Promise<Array<Record<string, unknown>>> {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { chunks.push(String(c)); return true; });
    await inspect(parseArgs(['--input', pdfPath, '--format', 'json', '--pages']));
    return JSON.parse(chunks.join('')).pages as Array<Record<string, unknown>>;
}

/** Assert a page entry carries a TrimBox = MediaBox inset by `bleed` on every side. */
function expectTrimFromBleed(p: Record<string, unknown>, bleed: number): void {
    const w = p['width'] as number;
    const h = p['height'] as number;
    const trim = p['trimBox'] as number[];
    expect(Array.isArray(trim)).toBe(true);
    expect(trim).toHaveLength(4);
    expect(trim[0]).toBeCloseTo(bleed, 2);
    expect(trim[1]).toBeCloseTo(bleed, 2);
    expect(trim[2]).toBeCloseTo(w - bleed, 2);
    expect(trim[3]).toBeCloseTo(h - bleed, 2);
}

describe('page-tree print-box preservation (pdfnative 1.7.0)', () => {
    it('merge preserves /TrimBox and /BleedBox on every page (bytes + parsed)', async () => {
        const a = await renderPrintPages(1, { bleed: 8.5 });
        const b = await renderPrintPages(1, { bleed: 8.5 });
        const out = tmpPath('merged-print.pdf');
        await merge(parseArgs([a, b, '--output', out]));
        const bytes = await fs.readFile(out);
        expect(bytes.includes(Buffer.from('/TrimBox'))).toBe(true);
        const pages = inspectPagesResult(await inspectPages(out), 2);
        for (const p of pages) {
            expectTrimFromBleed(p, 8.5);
            expect(p['bleedBox']).toEqual([0, 0, p['width'], p['height']]);
        }
    });

    it('split preserves /TrimBox in each output file', async () => {
        const doc = await renderPrintPages(2, { bleed: 8.5 });
        const outDir = tmpPath('splitdir-print');
        await split(parseArgs(['--input', doc, '--output-dir', outDir]));
        const files = (await fs.readdir(outDir)).filter((f) => f.endsWith('.pdf'));
        expect(files).toHaveLength(2);
        for (const f of files) {
            const pages = inspectPagesResult(await inspectPages(path.join(outDir, f)), 1);
            expectTrimFromBleed(pages[0] as Record<string, unknown>, 8.5);
        }
    });

    it('extract preserves /TrimBox on the extracted page', async () => {
        const doc = await renderPrintPages(3, { bleed: 8.5 });
        const out = tmpPath('extracted-print.pdf');
        await extract(parseArgs(['--input', doc, '--pages', '2', '--output', out]));
        expect((await fs.readFile(out)).includes(Buffer.from('/TrimBox'))).toBe(true);
        const pages = inspectPagesResult(await inspectPages(out), 1);
        expectTrimFromBleed(pages[0] as Record<string, unknown>, 8.5);
    });

    it('extract preserves /UserUnit', async () => {
        const doc = await renderPrintPages(2, { userUnit: 2 });
        const out = tmpPath('extracted-uu.pdf');
        await extract(parseArgs(['--input', doc, '--pages', '1', '--output', out]));
        const pages = inspectPagesResult(await inspectPages(out), 1);
        expect(pages[0]?.['userUnit']).toBe(2);
    });

    it('merge preserves /UserUnit on every page', async () => {
        const a = await renderPrintPages(1, { userUnit: 3 });
        const b = await renderPrintPages(1, { userUnit: 3 });
        const out = tmpPath('merged-uu.pdf');
        await merge(parseArgs([a, b, '--output', out]));
        const pages = inspectPagesResult(await inspectPages(out), 2);
        for (const p of pages) expect(p['userUnit']).toBe(3);
    });
});

/** Assert the inspect --pages payload has the expected page count, then return it. */
function inspectPagesResult(pages: Array<Record<string, unknown>>, expected: number): Array<Record<string, unknown>> {
    expect(Array.isArray(pages)).toBe(true);
    expect(pages).toHaveLength(expected);
    return pages;
}

describe('page-tree drop-annotations', () => {
    it('merge --drop-annotations still produces a valid PDF', async () => {
        const a = await renderPages(1);
        const b = await renderPages(1);
        const out = tmpPath('merged-drop.pdf');
        await merge(parseArgs([a, b, '--output', out, '--drop-annotations']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('merge rejects a non-PDF source', async () => {
        const a = await renderPages(1);
        const junk = tmpPath('junk.pdf');
        await fs.writeFile(junk, 'nope', 'utf8');
        await expect(merge(parseArgs([a, junk, '--output', tmpPath('x.pdf')]))).rejects.toBeInstanceOf(CliError);
    });
});
