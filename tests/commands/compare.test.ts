import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { metadata } from '../../src/commands/metadata.js';
import { compare } from '../../src/commands/compare.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `cmp-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function renderDoc(blocks: readonly unknown[], extraArgs: readonly string[] = []): Promise<string> {
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath, ...extraArgs]));
    return outPath;
}

const TWO_PAGES_A = [
    { type: 'heading', text: 'Report', level: 1 },
    { type: 'paragraph', text: 'first page body' },
    { type: 'pageBreak' },
    { type: 'paragraph', text: 'second page body' },
];

const TWO_PAGES_B = [
    { type: 'heading', text: 'Report', level: 1 },
    { type: 'paragraph', text: 'first page body' },
    { type: 'pageBreak' },
    { type: 'paragraph', text: 'second page CHANGED' },
];

async function captureStdout(fn: () => Promise<void>): Promise<{ stdout: string; err: unknown }> {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
        chunks.push(String(c));
        return true;
    });
    let err: unknown = undefined;
    try {
        await fn();
    } catch (e) {
        err = e;
    } finally {
        spy.mockRestore();
    }
    return { stdout: chunks.join(''), err };
}

interface CompareReport {
    readonly equal: boolean;
    readonly modes: readonly string[];
    readonly differences: readonly {
        readonly kind: string;
        readonly page?: number;
        readonly path?: string;
        readonly a?: unknown;
        readonly b?: unknown;
        readonly detail?: string;
    }[];
}

async function compareJson(argv: readonly string[]): Promise<{ report: CompareReport; err: unknown }> {
    const { stdout, err } = await captureStdout(() => compare(parseArgs([...argv, '--format', 'json'])));
    return { report: JSON.parse(stdout) as CompareReport, err };
}

describe('compare', () => {
    it('reports two identical renders as equal (exit 0)', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const b = await renderDoc(TWO_PAGES_A);
        const { report, err } = await compareJson([a, b]);
        expect(err).toBeUndefined();
        expect(report.equal).toBe(true);
        expect(report.differences).toHaveLength(0);
        expect(report.modes).toEqual(['structure', 'text']);
    });

    it('detects a text difference on the right page (E_CHECK_FAILED)', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const b = await renderDoc(TWO_PAGES_B);
        const { report, err } = await compareJson([a, b]);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe('E_CHECK_FAILED');
        expect((err as CliError).exitCode).toBe(1);
        expect(report.equal).toBe(false);
        const textDiff = report.differences.find((d) => d.kind === 'text');
        expect(textDiff).toBeDefined();
        expect(textDiff?.page).toBe(2);
    });

    it('detects a metadata difference', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const base = await renderDoc(TWO_PAGES_A);
        const b = tmpPath('retitled.pdf');
        await metadata(parseArgs([
            '--input', base, '--output', b,
            '--title', 'Divergent', '--mod-date', '2026-01-15T00:00:00Z',
        ]));
        const { report, err } = await compareJson([a, b]);
        expect(err).toBeInstanceOf(CliError);
        expect(report.differences.some((d) => d.kind === 'metadata' && d.path === 'Title')).toBe(true);
    });

    it('detects a page-count difference', async () => {
        const a = await renderDoc([{ type: 'paragraph', text: 'only page' }]);
        const b = await renderDoc([
            { type: 'paragraph', text: 'only page' },
            { type: 'pageBreak' },
            { type: 'paragraph', text: 'extra page' },
        ]);
        const { report, err } = await compareJson([a, b]);
        expect(err).toBeInstanceOf(CliError);
        const diff = report.differences.find((d) => d.kind === 'pageCount');
        expect(diff).toBeDefined();
        expect(diff?.a).toBe(1);
        expect(diff?.b).toBe(2);
    });

    it('--mode text ignores metadata differences', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const base = await renderDoc(TWO_PAGES_A);
        const b = tmpPath('retitled.pdf');
        await metadata(parseArgs([
            '--input', base, '--output', b,
            '--title', 'Divergent', '--mod-date', '2026-01-15T00:00:00Z',
        ]));
        const { report, err } = await compareJson([a, b, '--mode', 'text']);
        expect(err).toBeUndefined();
        expect(report.equal).toBe(true);
        expect(report.modes).toEqual(['text']);
    });

    it('--tolerance absorbs a sub-threshold page-size delta', async () => {
        const a = await renderDoc([{ type: 'paragraph', text: 'sized' }], ['--page-size', '600x800']);
        const b = await renderDoc([{ type: 'paragraph', text: 'sized' }], ['--page-size', '600.3x800']);

        const strict = await compareJson([a, b, '--mode', 'structure']);
        expect(strict.err).toBeInstanceOf(CliError);
        expect(strict.report.differences.some((d) => d.kind === 'pageSize')).toBe(true);

        const tolerant = await compareJson([a, b, '--mode', 'structure', '--tolerance', '0.5']);
        expect(tolerant.err).toBeUndefined();
        expect(tolerant.report.equal).toBe(true);
    });

    it('--ignore-whitespace normalizes layout-only differences', async () => {
        const a = await renderDoc([{ type: 'paragraph', text: 'alpha beta' }]);
        const b = await renderDoc([
            { type: 'paragraph', text: 'alpha' },
            { type: 'paragraph', text: 'beta' },
        ]);

        const strict = await compareJson([a, b, '--mode', 'text']);
        expect(strict.err).toBeInstanceOf(CliError);

        const relaxed = await compareJson([a, b, '--mode', 'text', '--ignore-whitespace']);
        expect(relaxed.err).toBeUndefined();
        expect(relaxed.report.equal).toBe(true);
    });

    it('honours --pages for the text diff', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const b = await renderDoc(TWO_PAGES_B); // only page 2 differs
        const { report, err } = await compareJson([a, b, '--mode', 'text', '--pages', '1']);
        expect(err).toBeUndefined();
        expect(report.equal).toBe(true);
    });

    it('reports a missing file as E_IO', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const err = await compare(parseArgs([a, tmpPath('does-not-exist.pdf')])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe('E_IO');
        expect((err as CliError).exitCode).toBe(1);
    });

    it('requires exactly two positionals (exit 2)', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const err = await compare(parseArgs([a])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('emits a human-readable text report', async () => {
        const a = await renderDoc(TWO_PAGES_A);
        const b = await renderDoc(TWO_PAGES_B);
        const { stdout, err } = await captureStdout(() => compare(parseArgs([a, b])));
        expect(err).toBeInstanceOf(CliError);
        expect(stdout).toContain('differences (');
        expect(stdout).toContain('[text] page 2');
    });
});
