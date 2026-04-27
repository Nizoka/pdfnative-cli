import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const minimalParams = JSON.stringify({
    title: 'Test Document',
    blocks: [{ type: 'paragraph', text: 'Hello world' }],
});

async function withTempFile(ext: string, content: string, fn: (p: string) => Promise<void>): Promise<void> {
    const p = path.join(os.tmpdir(), `pdfcli-test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    await fs.writeFile(p, content, 'utf8');
    try {
        await fn(p);
    } finally {
        await fs.unlink(p).catch(() => undefined);
    }
}

describe('render', () => {
    const tmpFiles: string[] = [];

    afterEach(async () => {
        for (const f of tmpFiles.splice(0)) {
            await fs.unlink(f).catch(() => undefined);
        }
    });

    it('produces a valid PDF for minimal DocumentParams', async () => {
        const outPath = path.join(os.tmpdir(), `render-out-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath]));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
        expect(bytes.toString('ascii').includes('%%EOF')).toBe(true);
    });

    it('produces valid PDF with --stream flag', async () => {
        const outPath = path.join(os.tmpdir(), `render-stream-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--stream']));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('throws CliError(1) for invalid JSON', async () => {
        await withTempFile('.json', '{bad json}', async (inputPath) => {
            const err = await render(parseArgs(['--input', inputPath])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
        });
    });

    it('throws CliError(2) for invalid --conformance value', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs(['--input', inputPath, '--conformance', 'invalid'])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('accepts valid --conformance values', async () => {
        const outPath = path.join(os.tmpdir(), `render-conf-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            // Should not throw for valid conformance values
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--conformance', '2b']));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });
});
