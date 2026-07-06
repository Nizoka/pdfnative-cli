import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `render12-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function writeDoc(blocks: unknown): Promise<string> {
    const p = tmpPath('in.json');
    await fs.writeFile(p, JSON.stringify({ blocks }), 'utf8');
    return p;
}

function captureStdout(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((...args: unknown[]) => {
        const chunk = args[0];
        calls.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
        // writeOutput() to stdout uses the callback form and awaits it — invoke
        // any trailing callback so the write promise resolves.
        const cb = args.find((a) => typeof a === 'function');
        if (cb !== undefined) (cb as (e?: Error) => void)();
        return true;
    }) as never);
    return { calls, restore: () => spy.mockRestore() };
}

describe('render --outline', () => {
    it('renders bookmarks from auto', async () => {
        const input = await writeDoc([
            { type: 'heading', text: 'Chapter 1', level: 1 },
            { type: 'paragraph', text: 'x' },
            { type: 'heading', text: 'Chapter 2', level: 1 },
        ]);
        const out = tmpPath('out.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--outline', 'auto']));
        const bytes = await fs.readFile(out);
        expect(bytes.toString('latin1')).toContain('/Outlines');
    });

    it('renders bookmarks from a JSON outline file', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const outline = tmpPath('outline.json');
        await fs.writeFile(outline, JSON.stringify([{ title: 'Top', pageIndex: 0 }]), 'utf8');
        const out = tmpPath('out2.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--outline', outline]));
        expect((await fs.readFile(out)).toString('latin1')).toContain('/Outlines');
    });

    it('rejects a non-array outline file', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const outline = tmpPath('bad.json');
        await fs.writeFile(outline, JSON.stringify({ nope: true }), 'utf8');
        await expect(
            render(parseArgs(['--input', input, '--output', tmpPath('x.pdf'), '--outline', outline])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --inspect-layout', () => {
    it('emits a LayoutInspection JSON report instead of a PDF', async () => {
        const input = await writeDoc([
            { type: 'heading', text: 'H', level: 1 },
            { type: 'paragraph', text: 'body' },
        ]);
        const out = captureStdout();
        await render(parseArgs(['--input', input, '--inspect-layout']));
        out.restore();
        const report = JSON.parse(out.calls.join(''));
        expect(report.totalPages).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(report.pages)).toBe(true);
        expect(report.pages[0].blocks[0]).toHaveProperty('type');
    });

    it('is rejected for the table variant', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        await expect(
            render(parseArgs(['--input', input, '--inspect-layout', '--variant', 'table'])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --debug-layout', () => {
    it('renders with a debug overlay (bare flag)', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const out = tmpPath('dbg.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--debug-layout']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('accepts a box selector list', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const out = tmpPath('dbg2.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--debug-layout', 'margins,cells']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects an unknown debug box token', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        await expect(
            render(parseArgs(['--input', input, '--output', tmpPath('x.pdf'), '--debug-layout', 'bogus'])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --font math', () => {
    it('registers the math font and renders math symbols', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'Sum: ∑ ∀ ∈ ℝ ⇒ ∫' }]);
        const out = tmpPath('math.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--font', 'math']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
});
