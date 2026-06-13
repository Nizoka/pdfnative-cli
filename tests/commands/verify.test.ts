import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { verify } from '../../src/commands/verify.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const minimalParams = JSON.stringify({
    title: 'Verify Test',
    blocks: [{ type: 'paragraph', text: 'unsigned' }],
});

interface VerifyOutput {
    signatures: unknown[];
    allValid: boolean;
}

const tmpFiles: string[] = [];

afterEach(async () => {
    for (const f of tmpFiles.splice(0)) await fs.unlink(f).catch(() => undefined);
});

async function makeUnsignedPdf(): Promise<string> {
    const inPath = path.join(os.tmpdir(), `verify-in-${Date.now()}.json`);
    const pdfPath = path.join(os.tmpdir(), `verify-src-${Date.now()}.pdf`);
    tmpFiles.push(inPath, pdfPath);
    await fs.writeFile(inPath, minimalParams, 'utf8');
    await render(parseArgs(['--input', inPath, '--output', pdfPath]));
    return pdfPath;
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        const orig = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        fn().then(
            () => {
                process.stdout.write = orig;
                resolve(chunks.join(''));
            },
            (e: unknown) => {
                process.stdout.write = orig;
                reject(e as Error);
            },
        );
    });
}

describe('verify', () => {
    it('reports zero signatures for an unsigned PDF', async () => {
        const pdf = await makeUnsignedPdf();
        const out = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--format', 'json'])),
        );
        const result = JSON.parse(out) as VerifyOutput;
        expect(result.signatures).toEqual([]);
        expect(result.allValid).toBe(false); // empty list ≠ valid
    });

    it('produces text format output', async () => {
        const pdf = await makeUnsignedPdf();
        const out = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--format', 'text'])),
        );
        expect(out).toContain('Signatures: 0');
        expect(out).toContain('Result:');
    });

    it('throws CliError(2) for invalid --format', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await verify(parseArgs(['--input', pdf, '--format', 'xml']))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('throws CliError(1) for non-PDF input', async () => {
        const bad = path.join(os.tmpdir(), `verify-bad-${Date.now()}.pdf`);
        tmpFiles.push(bad);
        await fs.writeFile(bad, 'not a pdf', 'utf8');
        const err = await verify(parseArgs(['--input', bad])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });

    it('--strict on unsigned PDF exits 1', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--strict'])),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });

    it('tags an unreadable PDF with E_PARSE', async () => {
        const bad = path.join(os.tmpdir(), `verify-badcode-${Date.now()}.pdf`);
        tmpFiles.push(bad);
        await fs.writeFile(bad, 'not a pdf', 'utf8');
        const err = await verify(parseArgs(['--input', bad])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(ErrorCode.PARSE);
    });

    it('tags a --strict failure with E_VERIFY_FAILED', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--strict'])),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(ErrorCode.VERIFY_FAILED);
    });
});
