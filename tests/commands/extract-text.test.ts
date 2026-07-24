import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { extractTextCmd } from '../../src/commands/extract-text.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `xtext-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

/** Render a 2-page PDF with known text and return its path. */
async function renderSample(): Promise<string> {
    const blocks = [
        { type: 'heading', text: 'Alpha', level: 1 },
        { type: 'paragraph', text: 'first page body' },
        { type: 'pageBreak' },
        { type: 'paragraph', text: 'second page body' },
    ];
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

function capture(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
        calls.push(String(c));
        return true;
    });
    return { calls, restore: () => spy.mockRestore() };
}

describe('extract-text', () => {
    it('emits plain text with a form-feed page delimiter by default', async () => {
        const doc = await renderSample();
        const out = capture();
        await extractTextCmd(parseArgs(['--input', doc]));
        out.restore();
        const text = out.calls.join('');
        expect(text).toContain('Alpha');
        expect(text).toContain('first page body');
        expect(text).toContain('second page body');
        expect(text).toContain('\f'); // page delimiter
    });

    it('emits one JSON object per page in ndjson mode', async () => {
        const doc = await renderSample();
        const out = capture();
        await extractTextCmd(parseArgs(['--input', doc, '--format', 'ndjson']));
        out.restore();
        const lines = out.calls.join('').trim().split('\n');
        expect(lines).toHaveLength(2);
        const first = JSON.parse(lines[0] as string);
        expect(first.pageIndex).toBe(0);
        expect(typeof first.text).toBe('string');
        expect(first.runs).toBeUndefined();
    });

    it('includes positioned runs with --runs in json mode', async () => {
        const doc = await renderSample();
        const out = capture();
        await extractTextCmd(parseArgs(['--input', doc, '--format', 'json', '--runs', '--pretty']));
        out.restore();
        const arr = JSON.parse(out.calls.join(''));
        expect(Array.isArray(arr)).toBe(true);
        expect(Array.isArray(arr[0].runs)).toBe(true);
        expect(typeof arr[0].runs[0].x).toBe('number');
    });

    it('limits to a --pages selection', async () => {
        const doc = await renderSample();
        const out = capture();
        await extractTextCmd(parseArgs(['--input', doc, '--format', 'ndjson', '--pages', '2']));
        out.restore();
        const lines = out.calls.join('').trim().split('\n');
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0] as string).pageIndex).toBe(1);
    });

    it('emits a summary with page and character counts', async () => {
        const doc = await renderSample();
        const out = capture();
        await extractTextCmd(parseArgs(['--input', doc, '--format', 'json', '--summary', '--pretty']));
        out.restore();
        const summary = JSON.parse(out.calls.join(''));
        expect(summary.pages).toBe(2);
        expect(summary.characters).toBeGreaterThan(0);
    });

    it('rejects an invalid --format', async () => {
        const doc = await renderSample();
        await expect(
            extractTextCmd(parseArgs(['--input', doc, '--format', 'xml'])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an invalid --max-length', async () => {
        const doc = await renderSample();
        await expect(
            extractTextCmd(parseArgs(['--input', doc, '--max-length', 'lots'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('surfaces E_PASSWORD when an encrypted PDF is opened without the user password', async () => {
        const doc = await renderSample();
        // Encrypt with a USER password so reading requires it.
        const enc = tmpPath('enc.pdf');
        const { encrypt } = await import('../../src/commands/encrypt.js');
        await encrypt(parseArgs([
            '--input', doc, '--output', enc,
            '--owner-password', 'o', '--user-password', 'u',
        ]));
        await expect(extractTextCmd(parseArgs(['--input', enc]))).rejects.toMatchObject({
            code: ErrorCode.PASSWORD,
        });
        // With the correct password it succeeds.
        const out = capture();
        await extractTextCmd(parseArgs(['--input', enc, '--password', 'u', '--format', 'ndjson']));
        out.restore();
        expect(out.calls.join('')).toContain('first page body');
    });
});
