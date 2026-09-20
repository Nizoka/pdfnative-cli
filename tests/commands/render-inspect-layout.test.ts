// render --inspect-layout: the report and the real render share ONE pagination
// planner (engine 1.8.0), so `totalPages` is the page count of the PDF — with
// a table of contents too, which 1.7.0 counted wrong (#75).

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { TempFiles, renderTo, inspectLayoutTo, pageCount } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
const sections = (count: number, repeat: number, toc: boolean): unknown => {
    const blocks: unknown[] = toc ? [{ type: 'toc', title: 'Contents' }] : [];
    for (let i = 0; i < count; i++) {
        blocks.push({ type: 'heading', text: `Section ${i + 1}`, level: i % 3 === 0 ? 1 : 2 });
        blocks.push({ type: 'paragraph', text: LOREM.repeat(repeat), align: 'justify' });
    }
    return { title: 'Layout report', blocks };
};

async function tocSample(): Promise<unknown> {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'samples', 'render', 'toc', '01-document-with-toc.json'), 'utf8')) as unknown;
}

describe('render --inspect-layout: totalPages is the page count of the render (engine 1.8.0)', () => {
    it.each([
        ['the shipped TOC sample', tocSample, [] as string[]],
        ['a long document with a table of contents', () => Promise.resolve(sections(14, 6, true)), [] as string[]],
        ['the same document with --split-paragraphs', () => Promise.resolve(sections(14, 6, true)), ['--split-paragraphs']],
        ['a long document without a table of contents', () => Promise.resolve(sections(14, 6, false)), [] as string[]],
        ['with --keep-headings-with-next and an embedded font', () => Promise.resolve(sections(10, 9, true)), ['--keep-headings-with-next', '--font', 'latin', '--lang', 'latin']],
    ])('%s', async (_label, load, argv) => {
        const doc = await load();
        const report = await inspectLayoutTo(tmp, doc, argv);
        const { bytes } = await renderTo(tmp, doc, argv);
        expect(report.totalPages).toBe(pageCount(bytes));
        expect(report.pages).toHaveLength(report.totalPages);
    });

    it('the table of contents is a laid-out block of the report: it takes height, and pushes the first heading down', async () => {
        const first = (report: { pages: readonly { blocks: readonly { type: string; top: number; height: number }[] }[] }, type: string): { top: number; height: number } =>
            report.pages.flatMap((p) => [...p.blocks]).find((b) => b.type === type)!;
        const without = await inspectLayoutTo(tmp, sections(6, 2, false));
        const withToc = await inspectLayoutTo(tmp, sections(6, 2, true));
        expect(first(withToc, 'toc').height).toBeGreaterThan(0);
        expect(first(withToc, 'heading').top).toBeLessThan(first(without, 'heading').top);
    });
});
