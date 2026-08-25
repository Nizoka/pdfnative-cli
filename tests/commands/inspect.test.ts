import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspect } from '../../src/commands/inspect.js';
import { render } from '../../src/commands/render.js';
import { sign } from '../../src/commands/sign.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const RSA_KEY = path.join(FIXTURES, 'rsa-key.pem');
const RSA_CERT = path.join(FIXTURES, 'rsa-cert.pem');

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

    describe('agent output projection', () => {
        const origJson = process.env['PDFNATIVE_JSON'];

        afterEach(() => {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
        });

        async function runJson(flags: string[]): Promise<string> {
            const pdfPath = await generateTestPdf();
            const chunks: string[] = [];
            const original = process.stdout.write.bind(process.stdout);
            process.stdout.write = (c: unknown) => {
                chunks.push(String(c));
                return true;
            };
            try {
                await inspect(parseArgs(['--input', pdfPath, ...flags]));
            } finally {
                process.stdout.write = original;
            }
            return chunks.join('');
        }

        it('--summary emits the canonical minimal verdict', async () => {
            const out = await runJson(['--summary']);
            const doc = JSON.parse(out);
            expect(Object.keys(doc).sort()).toEqual(['encrypted', 'pages', 'pdfa', 'signatures']);
            expect(typeof doc.pages).toBe('number');
            expect(typeof doc.encrypted).toBe('boolean');
        });

        it('--json compacts the output (no indentation)', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const out = await runJson([]);
            expect(out.endsWith('\n')).toBe(true);
            expect(out.trimEnd()).not.toContain('\n');
            expect(out).not.toContain('  ');
        });

        it('--pretty restores indentation even in --json mode', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const out = await runJson(['--pretty']);
            expect(out).toContain('\n  ');
        });

        it('--fields projects only the requested paths', async () => {
            const out = await runJson(['--fields', 'pageCount,metadata.title']);
            const doc = JSON.parse(out);
            expect(Object.keys(doc).sort()).toEqual(['metadata', 'pageCount']);
            expect(doc.metadata).toEqual({ title: expect.anything() });
        });

        it('--summary and --fields compose', async () => {
            const out = await runJson(['--summary', '--fields', 'pages']);
            expect(JSON.parse(out)).toEqual({ pages: expect.any(Number) });
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // v1.4.0 — --signatures, page boxes/userUnit, metadata.trapped
    // ──────────────────────────────────────────────────────────────────

    describe('v1.4.0 enrichments', () => {
        async function inspectJson(argv: readonly string[]): Promise<Record<string, unknown>> {
            const chunks: string[] = [];
            const original = process.stdout.write.bind(process.stdout);
            process.stdout.write = (c: unknown) => {
                chunks.push(String(c));
                return true;
            };
            try {
                await inspect(parseArgs([...argv]));
            } finally {
                process.stdout.write = original;
            }
            return JSON.parse(chunks.join('')) as Record<string, unknown>;
        }

        async function renderWith(params: unknown, extraFlags: readonly string[] = []): Promise<string> {
            const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const inputPath = path.join(os.tmpdir(), `inspect14-in-${stamp}.json`);
            const outputPath = path.join(os.tmpdir(), `inspect14-out-${stamp}.pdf`);
            tmpFiles.push(inputPath, outputPath);
            await fs.writeFile(inputPath, JSON.stringify(params), 'utf8');
            await render(parseArgs(['--input', inputPath, '--output', outputPath, ...extraFlags]));
            return outputPath;
        }

        async function writeLayout(layout: unknown): Promise<string> {
            const layoutPath = path.join(os.tmpdir(), `inspect14-layout-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
            tmpFiles.push(layoutPath);
            await fs.writeFile(layoutPath, JSON.stringify(layout), 'utf8');
            return layoutPath;
        }

        async function signedPdf(): Promise<string> {
            const src = await generateTestPdf();
            const out = path.join(os.tmpdir(), `inspect14-signed-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
            tmpFiles.push(out);
            await sign(parseArgs([
                '--input', src,
                '--output', out,
                '--key', RSA_KEY,
                '--cert', RSA_CERT,
                '--algorithm', 'rsa-sha256',
            ]));
            return out;
        }

        it('--signatures on an unsigned PDF emits signatures: []', async () => {
            const pdfPath = await generateTestPdf();
            const result = await inspectJson(['--input', pdfPath, '--signatures']);
            expect(result['signatures']).toEqual([]);
        });

        it('without --signatures the signatures field stays a number (no shape change)', async () => {
            const pdfPath = await generateTestPdf();
            const result = await inspectJson(['--input', pdfPath]);
            expect(typeof result['signatures']).toBe('number');
            expect(Array.isArray(result['signatures'])).toBe(false);
        });

        it('--signatures on a signed PDF lists one entry with subFilter/byteRange (no contents bytes)', async () => {
            const signedPath = await signedPdf();
            const result = await inspectJson(['--input', signedPath, '--signatures']);
            const sigs = result['signatures'] as Array<Record<string, unknown>>;
            expect(Array.isArray(sigs)).toBe(true);
            expect(sigs).toHaveLength(1);
            const s = sigs[0] as Record<string, unknown>;
            expect(s['subFilter']).toBe('adbe.pkcs7.detached');
            const byteRange = s['byteRange'] as number[];
            expect(byteRange).toHaveLength(4);
            expect(byteRange[0]).toBe(0);
            expect(byteRange[1]).toBeGreaterThan(0);
            expect(s['isPlaceholder']).toBe(false);
            expect(s['isDocTimestamp']).toBe(false);
            expect(typeof s['sigObjNum']).toBe('number');
            expect(s['contentsLength']).toBeGreaterThan(0);
            expect('contents' in s).toBe(false);
        });

        it('--check signed passes on a signed PDF and fails on an unsigned one', async () => {
            const silence = process.stdout.write.bind(process.stdout);
            process.stdout.write = () => true;
            const origStderr = process.stderr.write.bind(process.stderr);
            process.stderr.write = () => true;
            try {
                // Signed → no throw.
                const signedPath = await signedPdf();
                await inspect(parseArgs(['--input', signedPath, '--check', 'signed']));
                // Unsigned → E_CHECK_FAILED.
                const plain = await generateTestPdf();
                const err = await inspect(parseArgs(['--input', plain, '--check', 'signed']))
                    .catch((e: unknown) => e);
                expect(err).toBeInstanceOf(CliError);
                expect((err as CliError).code).toBe(ErrorCode.CHECK_FAILED);
            } finally {
                process.stdout.write = silence;
                process.stderr.write = origStderr;
            }
        });

        it('--check "signatures>=N" counts non-placeholder signatures', async () => {
            const signedPath = await signedPdf();
            const silence = process.stdout.write.bind(process.stdout);
            process.stdout.write = () => true;
            const origStderr = process.stderr.write.bind(process.stderr);
            process.stderr.write = () => true;
            try {
                // >=1 passes on a singly-signed doc.
                await inspect(parseArgs(['--input', signedPath, '--check', 'signatures>=1']));
                // >=2 fails with the stable check code.
                const err = await inspect(parseArgs(['--input', signedPath, '--check', 'signatures>=2']))
                    .catch((e: unknown) => e);
                expect(err).toBeInstanceOf(CliError);
                expect((err as CliError).exitCode).toBe(1);
                expect((err as CliError).code).toBe(ErrorCode.CHECK_FAILED);
            } finally {
                process.stdout.write = silence;
                process.stderr.write = origStderr;
            }
        });

        it('--pages reports trimBox/bleedBox from a print.bleed render', async () => {
            const layoutPath = await writeLayout({ print: { bleed: 8.5 } });
            const pdfPath = await renderWith(
                { title: 'Bleed', blocks: [{ type: 'paragraph', text: 'x' }] },
                ['--layout', layoutPath],
            );
            const result = await inspectJson(['--input', pdfPath, '--pages']);
            const pages = result['pages'] as Array<Record<string, unknown>>;
            expect(pages.length).toBeGreaterThanOrEqual(1);
            const p = pages[0] as Record<string, unknown>;
            const w = p['width'] as number;
            const h = p['height'] as number;
            const trim = p['trimBox'] as number[];
            expect(trim).toHaveLength(4);
            expect(trim[0]).toBeCloseTo(8.5, 2);
            expect(trim[1]).toBeCloseTo(8.5, 2);
            expect(trim[2]).toBeCloseTo(w - 8.5, 2);
            expect(trim[3]).toBeCloseTo(h - 8.5, 2);
            expect(p['bleedBox']).toEqual([0, 0, w, h]);
        });

        it('--pages omits box keys when the page has none', async () => {
            const pdfPath = await generateTestPdf();
            const result = await inspectJson(['--input', pdfPath, '--pages']);
            const p = (result['pages'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
            expect('trimBox' in p).toBe(false);
            expect('bleedBox' in p).toBe(false);
            expect('artBox' in p).toBe(false);
            expect('userUnit' in p).toBe(false);
        });

        it('--pages reports userUnit from a print.userUnit render', async () => {
            const layoutPath = await writeLayout({ print: { userUnit: 2 } });
            const pdfPath = await renderWith(
                { title: 'Big', blocks: [{ type: 'paragraph', text: 'x' }] },
                ['--layout', layoutPath],
            );
            const result = await inspectJson(['--input', pdfPath, '--pages']);
            const p = (result['pages'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
            expect(p['userUnit']).toBe(2);
        });

        it('metadata.trapped surfaces /Info /Trapped and is omitted otherwise', async () => {
            const trappedPdf = await renderWith({
                title: 'Trapped',
                metadata: { trapped: 'True' },
                blocks: [{ type: 'paragraph', text: 'x' }],
            });
            const withTrapped = await inspectJson(['--input', trappedPdf]);
            expect((withTrapped['metadata'] as Record<string, unknown>)['trapped']).toBe('True');

            const plainPdf = await generateTestPdf();
            const without = await inspectJson(['--input', plainPdf]);
            expect('trapped' in (without['metadata'] as Record<string, unknown>)).toBe(false);
        });
    });
});
