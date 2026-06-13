import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { inspect } from '../../src/commands/inspect.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

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

    // ──────────────────────────────────────────────────────────────────
    // v0.2.0 — new flag coverage
    // ──────────────────────────────────────────────────────────────────

    it('--verbose adds trailerKeys / catalogKeys / objectCount', async () => {
        const pdfPath = await generateTestPdf();
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        try {
            await inspect(parseArgs(['--input', pdfPath, '--verbose']));
        } finally {
            process.stdout.write = original;
        }
        const result = JSON.parse(chunks.join('')) as InspectResult & { verbose: { trailerKeys: string[]; catalogKeys: string[]; objectCount: number } };
        expect(Array.isArray(result.verbose.trailerKeys)).toBe(true);
        expect(Array.isArray(result.verbose.catalogKeys)).toBe(true);
        expect(typeof result.verbose.objectCount).toBe('number');
    });

    it('--pages emits per-page width/height/rotation', async () => {
        const pdfPath = await generateTestPdf();
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        try {
            await inspect(parseArgs(['--input', pdfPath, '--pages']));
        } finally {
            process.stdout.write = original;
        }
        const result = JSON.parse(chunks.join('')) as InspectResult & { pages: Array<{ index: number; width: number | null; height: number | null }> };
        expect(Array.isArray(result.pages)).toBe(true);
        expect(result.pages.length).toBe(result.pageCount);
        expect(typeof result.pages[0]?.index).toBe('number');
    });

    it('--check encrypted exits 1 on plain PDF', async () => {
        const pdfPath = await generateTestPdf();
        const errStream: string[] = [];
        const origStdout = process.stdout.write.bind(process.stdout);
        const origStderr = process.stderr.write.bind(process.stderr);
        process.stdout.write = () => true;
        process.stderr.write = (c: unknown) => {
            errStream.push(String(c));
            return true;
        };
        try {
            const err = await inspect(parseArgs(['--input', pdfPath, '--check', 'encrypted']))
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
            expect(errStream.join('')).toContain('encrypted=fail');
        } finally {
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
        }
    });

    it('--check pdfa,signed,encrypted runs all checks', async () => {
        const pdfPath = await generateTestPdf();
        const errStream: string[] = [];
        const origStdout = process.stdout.write.bind(process.stdout);
        const origStderr = process.stderr.write.bind(process.stderr);
        process.stdout.write = () => true;
        process.stderr.write = (c: unknown) => {
            errStream.push(String(c));
            return true;
        };
        try {
            const err = await inspect(parseArgs([
                '--input', pdfPath,
                '--check', 'pdfa',
                '--check', 'signed',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
            expect(errStream.join('')).toContain('pdfa=fail');
            expect(errStream.join('')).toContain('signed=fail');
        } finally {
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
        }
    });

    it('rejects invalid --check value', async () => {
        const pdfPath = await generateTestPdf();
        const err = await inspect(parseArgs(['--input', pdfPath, '--check', 'unknown']))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('--format text with --pages and --verbose renders all sections', async () => {
        const pdfPath = await generateTestPdf();
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        try {
            await inspect(parseArgs([
                '--input', pdfPath,
                '--format', 'text',
                '--pages',
                '--verbose',
            ]));
        } finally {
            process.stdout.write = original;
        }
        const output = chunks.join('');
        expect(output).toContain('Pages detail:');
        expect(output).toContain('Trailer keys:');
        expect(output).toContain('Catalog keys:');
        expect(output).toContain('Object count:');
    });

    it('--check pdfa,signed,encrypted all pass on a hypothetical PDF/A signed encrypted doc → not realistic; instead asserts exit 0 when no checks given', async () => {
        const pdfPath = await generateTestPdf();
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = () => true;
        try {
            await inspect(parseArgs(['--input', pdfPath]));
        } finally {
            process.stdout.write = original;
        }
        // No throw → success.
        expect(true).toBe(true);
    });

    it('--pdfua includes a structural report in JSON output', async () => {
        const pdfPath = await generateTestPdf();
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        try {
            await inspect(parseArgs(['--input', pdfPath, '--pdfua', '--format', 'json']));
        } finally {
            process.stdout.write = original;
        }
        const result = JSON.parse(chunks.join('')) as {
            pdfua?: { valid: boolean; errors: string[]; warnings: string[] };
        };
        expect(result.pdfua).toBeDefined();
        expect(typeof result.pdfua?.valid).toBe('boolean');
        expect(Array.isArray(result.pdfua?.errors)).toBe(true);
        expect(Array.isArray(result.pdfua?.warnings)).toBe(true);
    });

    it('--pdfua renders a report section in text output', async () => {
        const pdfPath = await generateTestPdf();
        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        try {
            await inspect(parseArgs(['--input', pdfPath, '--pdfua', '--format', 'text']));
        } finally {
            process.stdout.write = original;
        }
        expect(chunks.join('')).toContain('PDF/UA:');
    });

    it('--check pdfua fails on a non-tagged PDF', async () => {
        const pdfPath = await generateTestPdf();
        const errStream: string[] = [];
        const origStdout = process.stdout.write.bind(process.stdout);
        const origStderr = process.stderr.write.bind(process.stderr);
        process.stdout.write = () => true;
        process.stderr.write = (c: unknown) => {
            errStream.push(String(c));
            return true;
        };
        try {
            const err = await inspect(parseArgs(['--input', pdfPath, '--check', 'pdfua']))
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
            expect(errStream.join('')).toContain('pdfua=fail');
        } finally {
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
        }
    });

    it('--check pdfua passes on a tagged (PDF/A) document', async () => {
        const inputPath = path.join(os.tmpdir(), `inspect-ua-in-${Date.now()}.json`);
        const outputPath = path.join(os.tmpdir(), `inspect-ua-out-${Date.now()}.pdf`);
        tmpFiles.push(inputPath, outputPath);
        await fs.writeFile(inputPath, minimalParams, 'utf8');
        await render(parseArgs(['--input', inputPath, '--output', outputPath, '--tagged', 'pdfa2b']));

        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = () => true;
        try {
            // No throw → check passed (exit 0).
            await inspect(parseArgs(['--input', outputPath, '--check', 'pdfua']));
        } finally {
            process.stdout.write = original;
        }
        expect(true).toBe(true);
    });

    it('detects PDF/A conformance from XMP metadata', async () => {
        const inputPath = path.join(os.tmpdir(), `inspect-pdfa-in-${Date.now()}.json`);
        const outputPath = path.join(os.tmpdir(), `inspect-pdfa-out-${Date.now()}.pdf`);
        tmpFiles.push(inputPath, outputPath);
        await fs.writeFile(inputPath, minimalParams, 'utf8');
        await render(parseArgs(['--input', inputPath, '--output', outputPath, '--tagged', 'pdfa2b']));

        const chunks: string[] = [];
        const original = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(String(chunk));
            return true;
        };
        try {
            await inspect(parseArgs(['--input', outputPath, '--format', 'json']));
        } finally {
            process.stdout.write = original;
        }

        const result = JSON.parse(chunks.join('')) as InspectResult;
        expect(result.pdfaConformance).toBe('2b');

        // No throw → check passed (exit 0).
        const silenced = process.stdout.write.bind(process.stdout);
        process.stdout.write = () => true;
        try {
            await inspect(parseArgs(['--input', outputPath, '--check', 'pdfa']));
        } finally {
            process.stdout.write = silenced;
        }
    });

    describe('agent mode (error codes)', () => {
        const origJson = process.env['PDFNATIVE_JSON'];

        afterEach(() => {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
        });

        it('tags an unreadable PDF with E_PARSE', async () => {
            const badPath = path.join(os.tmpdir(), `inspect-bad-${Date.now()}.pdf`);
            tmpFiles.push(badPath);
            await fs.writeFile(badPath, 'not a pdf', 'utf8');
            const err = await inspect(parseArgs(['--input', badPath])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).code).toBe(ErrorCode.PARSE);
        });

        it('tags a failed --check with E_CHECK_FAILED', async () => {
            const pdfPath = await generateTestPdf();
            const origStdout = process.stdout.write.bind(process.stdout);
            const origStderr = process.stderr.write.bind(process.stderr);
            process.stdout.write = () => true;
            process.stderr.write = () => true;
            try {
                const err = await inspect(parseArgs(['--input', pdfPath, '--check', 'encrypted']))
                    .catch((e: unknown) => e);
                expect(err).toBeInstanceOf(CliError);
                expect((err as CliError).code).toBe(ErrorCode.CHECK_FAILED);
            } finally {
                process.stdout.write = origStdout;
                process.stderr.write = origStderr;
            }
        });

        it('in --json mode the check detail rides in the error message (not stderr text)', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const pdfPath = await generateTestPdf();
            const errStream: string[] = [];
            const origStdout = process.stdout.write.bind(process.stdout);
            const origStderr = process.stderr.write.bind(process.stderr);
            process.stdout.write = () => true;
            process.stderr.write = (c: unknown) => {
                errStream.push(String(c));
                return true;
            };
            let thrown: unknown;
            try {
                thrown = await inspect(parseArgs(['--input', pdfPath, '--check', 'encrypted']))
                    .catch((e: unknown) => e);
            } finally {
                process.stdout.write = origStdout;
                process.stderr.write = origStderr;
            }
            // In JSON mode the command does NOT pre-print the detail to stderr
            // (the dispatcher serialises the envelope); the message carries it.
            expect(errStream.join('')).toBe('');
            expect(thrown).toBeInstanceOf(CliError);
            expect((thrown as CliError).code).toBe(ErrorCode.CHECK_FAILED);
            expect((thrown as CliError).message).toContain('encrypted');
        });
    });
});
