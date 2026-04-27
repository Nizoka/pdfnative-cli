import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { inspect } from '../../src/commands/inspect.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const minimalParams = JSON.stringify({
    title: 'Inspect Test',
    blocks: [{ type: 'paragraph', text: 'Hello world' }],
});

interface InspectResult {
    version: string;
    pageCount: number;
    encrypted: boolean;
    pdfaConformance: string | null;
    signatures: number;
    metadata: Record<string, string | null>;
}

const tmpFiles: string[] = [];

afterEach(async () => {
    for (const f of tmpFiles.splice(0)) {
        await fs.unlink(f).catch(() => undefined);
    }
});

async function generateTestPdf(): Promise<string> {
    const inputPath = path.join(os.tmpdir(), `inspect-in-${Date.now()}.json`);
    const outputPath = path.join(os.tmpdir(), `inspect-out-${Date.now()}.pdf`);
    tmpFiles.push(inputPath, outputPath);
    await fs.writeFile(inputPath, minimalParams, 'utf8');
    await render(parseArgs(['--input', inputPath, '--output', outputPath]));
    return outputPath;
}

describe('inspect', () => {
    it('outputs valid JSON for a generated PDF', async () => {
        const pdfPath = await generateTestPdf();
        const outPath = path.join(os.tmpdir(), `inspect-result-${Date.now()}.json`);
        tmpFiles.push(outPath);

        // Capture stdout
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(String(chunk));
            return true;
        };

        try {
            await inspect(parseArgs(['--input', pdfPath, '--format', 'json']));
        } finally {
            process.stdout.write = original;
        }

        const output = chunks.join('');
        const result = JSON.parse(output) as InspectResult;
        expect(typeof result.version).toBe('string');
        expect(result.pageCount).toBeGreaterThanOrEqual(1);
        expect(typeof result.encrypted).toBe('boolean');
        expect(result.signatures).toBeGreaterThanOrEqual(0);
        expect(result.metadata).toBeDefined();
    });

    it('outputs text format when --format text is given', async () => {
        const pdfPath = await generateTestPdf();

        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(String(chunk));
            return true;
        };

        try {
            await inspect(parseArgs(['--input', pdfPath, '--format', 'text']));
        } finally {
            process.stdout.write = original;
        }

        const output = chunks.join('');
        expect(output).toContain('Version:');
        expect(output).toContain('Pages:');
        expect(output).toContain('Encrypted:');
    });

    it('throws CliError(2) for invalid --format value', async () => {
        const pdfPath = await generateTestPdf();
        const err = await inspect(parseArgs(['--input', pdfPath, '--format', 'xml'])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('throws CliError(1) for non-PDF input', async () => {
        const badPath = path.join(os.tmpdir(), `bad-${Date.now()}.pdf`);
        tmpFiles.push(badPath);
        await fs.writeFile(badPath, 'not a pdf', 'utf8');
        const err = await inspect(parseArgs(['--input', badPath])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });
});
