import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { batch } from '../../src/commands/batch.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

function capture(fn: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
            chunks.push(String(c));
            return true;
        });
        fn().then(
            () => {
                spy.mockRestore();
                resolve(chunks.join(''));
            },
            (e: unknown) => {
                spy.mockRestore();
                reject(e as Error);
            },
        );
    });
}

const DOC = JSON.stringify({ blocks: [{ type: 'paragraph', text: 'hi' }] });

describe('batch', () => {
    const dirs: string[] = [];

    afterEach(async () => {
        for (const d of dirs.splice(0)) {
            await fs.rm(d, { recursive: true, force: true }).catch(() => undefined);
        }
        delete process.env['PDFNATIVE_QUIET'];
    });

    async function makeInputDir(files: Record<string, string>): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-'));
        dirs.push(dir);
        for (const [name, content] of Object.entries(files)) {
            await fs.writeFile(path.join(dir, name), content);
        }
        return dir;
    }

    it('renders every JSON file and reports a JSON summary', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const inDir = await makeInputDir({ 'a.json': DOC, 'b.json': DOC, 'note.txt': 'ignored' });
        const outDir = path.join(inDir, 'out');
        const out = await capture(() =>
            batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir, '--format', 'json'])),
        );
        const summary = JSON.parse(out) as { total: number; succeeded: number; failed: number };
        expect(summary.total).toBe(2);
        expect(summary.succeeded).toBe(2);
        expect(summary.failed).toBe(0);
        const a = await fs.readFile(path.join(outDir, 'a.pdf'));
        expect(a.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('reports a text summary by default', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const inDir = await makeInputDir({ 'a.json': DOC });
        const outDir = path.join(inDir, 'out');
        const out = await capture(() =>
            batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir])),
        );
        expect(out).toContain('Rendered 1/1');
    });

    it('exits 1 and records the failure when a file is malformed', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const inDir = await makeInputDir({ 'good.json': DOC, 'bad.json': '{not json' });
        const outDir = path.join(inDir, 'out');
        await expect(
            capture(() => batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir]))),
        ).rejects.toMatchObject({ exitCode: 1 });
    });

    it('throws CliError(2) when --input-dir is missing', async () => {
        await expect(batch(parseArgs(['--output-dir', 'x']))).rejects.toMatchObject({ exitCode: 2 });
    });

    it('throws CliError(2) when --output-dir is missing', async () => {
        await expect(batch(parseArgs(['--input-dir', 'x']))).rejects.toMatchObject({ exitCode: 2 });
    });

    it('throws CliError(2) for a non-positive --concurrency', async () => {
        const inDir = await makeInputDir({ 'a.json': DOC });
        await expect(
            batch(parseArgs(['--input-dir', inDir, '--output-dir', path.join(inDir, 'o'), '--concurrency', '0'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('throws CliError(2) for an invalid --format', async () => {
        const inDir = await makeInputDir({ 'a.json': DOC });
        await expect(
            batch(parseArgs(['--input-dir', inDir, '--output-dir', path.join(inDir, 'o'), '--format', 'xml'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('throws CliError(1) when the directory has no JSON files', async () => {
        const inDir = await makeInputDir({ 'note.txt': 'x' });
        await expect(
            batch(parseArgs(['--input-dir', inDir, '--output-dir', path.join(inDir, 'o')])),
        ).rejects.toBeInstanceOf(CliError);
    });
});
