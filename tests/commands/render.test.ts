import { describe, it, expect, afterEach, vi } from 'vitest';
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

    // ──────────────────────────────────────────────────────────────────
    // v0.2.0 — new flag coverage
    // ──────────────────────────────────────────────────────────────────

    it('accepts --tagged pdfa3b (replacement for --conformance)', async () => {
        const outPath = path.join(os.tmpdir(), `render-tagged-${Date.now()}.pdf`);
        tmpFiles.push(outPath);
        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--tagged', 'pdfa3b']));
        });
        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('accepts --page-size and --margin', async () => {
        const outPath = path.join(os.tmpdir(), `render-pagesize-${Date.now()}.pdf`);
        tmpFiles.push(outPath);
        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--output', outPath,
                '--page-size', 'a4',
                '--margin', '40,40,60,40',
            ]));
        });
        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects --variant invalid', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs(['--input', inputPath, '--variant', 'foo']))
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('rejects table variant when JSON is DocumentParams shape', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs(['--input', inputPath, '--variant', 'table']))
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
        });
    });

    it('renders with --variant table for PdfParams JSON', async () => {
        const tableParams = JSON.stringify({
            title: 'Table',
            infoItems: [],
            balanceText: '',
            countText: '',
            headers: ['A', 'B'],
            rows: [
                { cells: ['1', '2'], type: 'normal', pointed: false },
                { cells: ['3', '4'], type: 'normal', pointed: false },
            ],
            footerText: 'footer',
        });
        const outPath = path.join(os.tmpdir(), `render-table-${Date.now()}.pdf`);
        tmpFiles.push(outPath);
        await withTempFile('.json', tableParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--variant', 'table']));
        });
        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('--stream rejects {pages} placeholder in footer', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs([
                '--input', inputPath,
                '--stream',
                '--footer-center', '{page} / {pages}',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('--stream rejects TOC blocks', async () => {
        const tocParams = JSON.stringify({
            title: 'TOC',
            blocks: [{ type: 'toc' }, { type: 'paragraph', text: 'After TOC' }],
        });
        await withTempFile('.json', tocParams, async (inputPath) => {
            const err = await render(parseArgs(['--input', inputPath, '--stream']))
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('renders with header/footer templates', async () => {
        const outPath = path.join(os.tmpdir(), `render-hf-${Date.now()}.pdf`);
        tmpFiles.push(outPath);
        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--output', outPath,
                '--header-center', 'Title',
                '--footer-right', 'Page {page}',
            ]));
        });
        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('renders with --watermark-text', async () => {
        const outPath = path.join(os.tmpdir(), `render-wm-${Date.now()}.pdf`);
        tmpFiles.push(outPath);
        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--output', outPath,
                '--watermark-text', 'DRAFT',
                '--watermark-opacity', '0.2',
            ]));
        });
        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects encryption + tagged combined', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs([
                '--input', inputPath,
                '--encrypt-owner-pass', 'x',
                '--tagged', 'pdfa2b',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('--lang errors clearly when language pack is unknown', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs([
                '--input', inputPath,
                '--lang', 'xxx-not-a-lang',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // Regression tests for bugs fixed in v0.2.0 patch
    // ──────────────────────────────────────────────────────────────────

    it('renders watermark defined inside params.layout (regression: layout was silently dropped)', async () => {
        // Before the fix, buildDocumentPDFBytes was called with an empty `{}` layout
        // from the CLI side.  Because pdfnative uses `layoutOptions ?? params.layout`
        // an empty object is not nullish, so `params.layout` (from the JSON) was never
        // consulted and the watermark was absent from the output.
        const withWatermark = JSON.stringify({
            title: 'Watermark Regression',
            blocks: [{ type: 'paragraph', text: 'Body text.' }],
            layout: {
                watermark: {
                    text: { text: 'REGRESSION_MARKER', opacity: 0.15, angle: -45 },
                    position: 'background',
                },
            },
        });
        const outPath = path.join(os.tmpdir(), `render-wm-regression-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', withWatermark, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath]));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
        // The watermark text is embedded verbatim as a PDF string operator.
        expect(bytes.toString('latin1')).toContain('REGRESSION_MARKER');
    });

    it('CLI --watermark-text overrides params.layout.watermark (precedence)', async () => {
        // CLI flags must have higher priority than the JSON-embedded layout.
        const withJsonWatermark = JSON.stringify({
            title: 'Precedence Test',
            blocks: [{ type: 'paragraph', text: 'Body.' }],
            layout: {
                watermark: { text: { text: 'JSON_MARK', opacity: 0.1 } },
            },
        });
        const outPath = path.join(os.tmpdir(), `render-wm-precedence-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', withJsonWatermark, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--output', outPath,
                '--watermark-text', 'CLI_MARK',
            ]));
        });

        const raw = (await fs.readFile(outPath)).toString('latin1');
        expect(raw).toContain('CLI_MARK');
        // JSON watermark should be superseded by the CLI override.
        expect(raw).not.toContain('JSON_MARK');
    });

    it('--template deep-merges base JSON under input (input wins)', async () => {
        const template = JSON.stringify({
            title: 'Template Title',
            metadata: { author: 'tmpl-author', subject: 'tmpl-subject' },
            blocks: [{ type: 'paragraph', text: 'should be overridden' }],
        });
        const input = JSON.stringify({
            metadata: { author: 'input-author' }, // overrides only author
            blocks: [{ type: 'paragraph', text: 'INPUT_BODY' }], // arrays replace
        });
        const outPath = path.join(os.tmpdir(), `render-template-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', template, async (tplPath) => {
            await withTempFile('.json', input, async (inputPath) => {
                await render(parseArgs([
                    '--input', inputPath,
                    '--template', tplPath,
                    '--output', outPath,
                ]));
            });
        });

        const raw = (await fs.readFile(outPath)).toString('latin1');
        // Title comes from template (input did not provide one)
        expect(raw).toContain('Template Title');
        // Author overridden by input
        expect(raw).toContain('input-author');
        expect(raw).not.toContain('tmpl-author');
        // Subject preserved from template (input did not override)
        expect(raw).toContain('tmpl-subject');
        // Blocks replaced (arrays don't merge)
        expect(raw).toContain('INPUT_BODY');
        expect(raw).not.toContain('should be overridden');
    });

    it('--font registers a bundled shortcut usable by --lang', async () => {
        const params = JSON.stringify({
            blocks: [{ type: 'paragraph', text: 'Hello world' }],
        });
        const outPath = path.join(os.tmpdir(), `render-font-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', params, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--font', 'latin',
                '--lang', 'latin',
                '--output', outPath,
            ]));
        });

        const stat = await fs.stat(outPath);
        expect(stat.size).toBeGreaterThan(1000);
    });

    it('--font rejects unknown bundled names', async () => {
        const outPath = path.join(os.tmpdir(), `render-font-bad-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await expect(
                render(parseArgs(['--input', inputPath, '--font', 'klingon', '--output', outPath])),
            ).rejects.toBeInstanceOf(CliError);
        });
    });

    it('--watch requires --input', async () => {
        await expect(
            render(parseArgs(['--watch', '--output', '/tmp/out.pdf'])),
        ).rejects.toThrowError(/--input/);
    });

    it('--watch rejects stdout output', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            await expect(
                render(parseArgs(['--watch', '--input', inputPath])),
            ).rejects.toThrowError(/--output/);
            await expect(
                render(parseArgs(['--watch', '--input', inputPath, '--output', '-'])),
            ).rejects.toThrowError(/--output/);
        });
    });

    it('produces valid PDF with --stream-true (document variant)', async () => {
        const outPath = path.join(os.tmpdir(), `render-streamtrue-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--stream-true']));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
        expect(bytes.toString('ascii').includes('%%EOF')).toBe(true);
    });

    it('--stream-true is byte-identical to non-streaming output', async () => {
        const bufferedPath = path.join(os.tmpdir(), `render-buf-${Date.now()}.pdf`);
        const truePath = path.join(os.tmpdir(), `render-true-${Date.now()}.pdf`);
        tmpFiles.push(bufferedPath, truePath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', bufferedPath]));
            await render(parseArgs(['--input', inputPath, '--output', truePath, '--stream-true']));
        });

        const a = await fs.readFile(bufferedPath);
        const b = await fs.readFile(truePath);
        expect(b.equals(a)).toBe(true);
    });

    it('--stream-true produces valid PDF for --variant table', async () => {
        const tableParams = JSON.stringify({
            title: 'Table',
            infoItems: [],
            balanceText: '',
            countText: '',
            headers: ['A', 'B'],
            rows: [
                { cells: ['1', '2'], type: 'normal', pointed: false },
                { cells: ['3', '4'], type: 'normal', pointed: false },
            ],
            footerText: 'footer',
        });
        const outPath = path.join(os.tmpdir(), `render-streamtrue-table-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', tableParams, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath, '--output', outPath,
                '--variant', 'table', '--stream-true',
            ]));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('--stream-true rejects TOC blocks', async () => {
        const tocParams = JSON.stringify({
            blocks: [
                { type: 'toc' },
                { type: 'heading', level: 1, text: 'Section' },
            ],
        });
        await withTempFile('.json', tocParams, async (inputPath) => {
            const err = await render(parseArgs([
                '--input', inputPath, '--output', '-', '--stream-true',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('rejects combining multiple --stream* flags', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            const err = await render(parseArgs([
                '--input', inputPath, '--output', '-',
                '--stream', '--stream-true',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        });
    });

    it('--max-blocks accepts a positive integer', async () => {
        const outPath = path.join(os.tmpdir(), `render-maxblocks-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', minimalParams, async (inputPath) => {
            await render(parseArgs(['--input', inputPath, '--output', outPath, '--max-blocks', '500']));
        });

        const bytes = await fs.readFile(outPath);
        expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('--max-blocks rejects non-positive / non-integer values', async () => {
        await withTempFile('.json', minimalParams, async (inputPath) => {
            for (const bad of ['0', '-3', 'abc', '1.5']) {
                const err = await render(parseArgs([
                    '--input', inputPath, '--output', '-', '--max-blocks', bad,
                ])).catch((e: unknown) => e);
                expect(err).toBeInstanceOf(CliError);
                expect((err as CliError).exitCode).toBe(2);
            }
        });
    });

    it('--font registers a new pdfnative 1.3.0 script (te) usable by --lang', async () => {
        const params = JSON.stringify({
            blocks: [{ type: 'paragraph', text: 'తెలుగు' }],
        });
        const outPath = path.join(os.tmpdir(), `render-font-te-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', params, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--font', 'te',
                '--lang', 'te',
                '--output', outPath,
            ]));
        });

        const stat = await fs.stat(outPath);
        expect(stat.size).toBeGreaterThan(1000);
    });

    it('--font accepts the COLRv1 color-emoji shortcut', async () => {
        const params = JSON.stringify({
            blocks: [{ type: 'paragraph', text: 'Hi 🎉' }],
        });
        const outPath = path.join(os.tmpdir(), `render-font-coloremoji-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        await withTempFile('.json', params, async (inputPath) => {
            await render(parseArgs([
                '--input', inputPath,
                '--font', 'color-emoji',
                '--lang', 'color-emoji',
                '--output', outPath,
            ]));
        });

        const stat = await fs.stat(outPath);
        expect(stat.size).toBeGreaterThan(1000);
    });

    describe('agent mode', () => {
        const origJson = process.env['PDFNATIVE_JSON'];
        const origDry = process.env['PDFNATIVE_DRY_RUN'];

        afterEach(() => {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
            if (origDry === undefined) delete process.env['PDFNATIVE_DRY_RUN'];
            else process.env['PDFNATIVE_DRY_RUN'] = origDry;
        });

        it('--dry-run validates without writing the output file', async () => {
            const outPath = path.join(os.tmpdir(), `render-dryrun-${Date.now()}.pdf`);
            await withTempFile('.json', minimalParams, async (inputPath) => {
                await render(parseArgs(['--input', inputPath, '--output', outPath, '--dry-run']));
            });
            await expect(fs.stat(outPath)).rejects.toThrow();
        });

        it('--json --dry-run emits an ok:true dryRun envelope on stderr', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const outPath = path.join(os.tmpdir(), `render-dryrun-json-${Date.now()}.pdf`);
            const lines: string[] = [];
            const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
                lines.push(String(c));
                return true;
            });
            try {
                await withTempFile('.json', minimalParams, async (inputPath) => {
                    await render(parseArgs(['--input', inputPath, '--output', outPath, '--dry-run']));
                });
            } finally {
                spy.mockRestore();
            }
            await expect(fs.stat(outPath)).rejects.toThrow();
            const envelope = lines.map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)).at(-1);
            expect(envelope).toMatchObject({
                ok: true,
                command: 'render',
                variant: 'document',
                dryRun: true,
            });
        });

        it('--json emits an ok:true status envelope with byte count on success', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const outPath = path.join(os.tmpdir(), `render-json-${Date.now()}.pdf`);
            tmpFiles.push(outPath);
            const lines: string[] = [];
            const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
                lines.push(String(c));
                return true;
            });
            try {
                await withTempFile('.json', minimalParams, async (inputPath) => {
                    await render(parseArgs(['--input', inputPath, '--output', outPath]));
                });
            } finally {
                spy.mockRestore();
            }
            const envelope = lines.map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)).at(-1);
            expect(envelope).toMatchObject({ ok: true, command: 'render', dryRun: false });
            expect(typeof envelope.bytes).toBe('number');
            expect(envelope.bytes).toBeGreaterThan(0);
        });
    });
});
