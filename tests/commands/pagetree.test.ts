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
