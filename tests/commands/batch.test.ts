import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { batch } from '../../src/commands/batch.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const RSA_KEY = path.join(FIXTURES, 'rsa-key.pem');
const RSA_CERT = path.join(FIXTURES, 'rsa-cert.pem');

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

    it('tags an empty directory failure with E_INPUT', async () => {
        const inDir = await makeInputDir({ 'note.txt': 'x' });
        const err = await batch(parseArgs(['--input-dir', inDir, '--output-dir', path.join(inDir, 'o')]))
            .catch((e: unknown) => e);
        expect((err as CliError).code).toBe(ErrorCode.INPUT);
    });

    it('--dry-run validates inputs without creating the output directory', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const inDir = await makeInputDir({ 'a.json': DOC, 'b.json': DOC });
        const outDir = path.join(inDir, 'out');
        await capture(() =>
            batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir, '--dry-run'])),
        );
        await expect(fs.stat(outDir)).rejects.toThrow();
    });

    it('agent json mode forces a machine-readable summary on stdout', async () => {
        const origJson = process.env['PDFNATIVE_JSON'];
        process.env['PDFNATIVE_JSON'] = '1';
        process.env['PDFNATIVE_QUIET'] = '1';
        try {
            const inDir = await makeInputDir({ 'a.json': DOC });
            const outDir = path.join(inDir, 'out');
            const out = await capture(() =>
                batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir])),
            );
            const summary = JSON.parse(out) as { total: number; succeeded: number; failed: number };
            expect(summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
        } finally {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
        }
    });

    describe('agent output projection', () => {
        const origJson = process.env['PDFNATIVE_JSON'];

        afterEach(() => {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
        });

        it('--summary drops the per-file results array', async () => {
            process.env['PDFNATIVE_QUIET'] = '1';
            const inDir = await makeInputDir({ 'a.json': DOC, 'b.json': DOC });
            const outDir = path.join(inDir, 'out');
            const out = await capture(() =>
                batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir, '--format', 'json', '--summary'])),
            );
            const doc = JSON.parse(out) as Record<string, unknown>;
            expect(doc).toEqual({ total: 2, succeeded: 2, failed: 0 });
            expect(doc).not.toHaveProperty('results');
        });

        it('--json compacts the summary output (no indentation)', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            process.env['PDFNATIVE_QUIET'] = '1';
            const inDir = await makeInputDir({ 'a.json': DOC });
            const outDir = path.join(inDir, 'out');
            const out = await capture(() =>
                batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir])),
            );
            expect(out.trimEnd()).not.toContain('\n');
            expect(out).not.toContain('  ');
        });

        it('--fields projects only the requested paths', async () => {
            process.env['PDFNATIVE_QUIET'] = '1';
            const inDir = await makeInputDir({ 'a.json': DOC });
            const outDir = path.join(inDir, 'out');
            const out = await capture(() =>
                batch(parseArgs(['--input-dir', inDir, '--output-dir', outDir, '--format', 'json', '--fields', 'total,failed'])),
            );
            expect(JSON.parse(out)).toEqual({ total: 1, failed: 0 });
        });
    });
});

interface TaskEntry {
    id: string;
    command: string;
    ok: boolean;
    output?: string;
    error?: { code: string; message: string };
    skipped?: true;
}

interface ManifestEnvelope {
    ok: boolean;
    command: string;
    mode: string;
    dryRun?: boolean;
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    tasks: TaskEntry[];
}

describe('batch --manifest', () => {
    const dirs: string[] = [];

    afterEach(async () => {
        for (const d of dirs.splice(0)) {
            await fs.rm(d, { recursive: true, force: true }).catch(() => undefined);
        }
        delete process.env['PDFNATIVE_QUIET'];
    });

    const DOC_JSON = JSON.stringify({ blocks: [{ type: 'paragraph', text: 'pipeline' }] });

    /** Write a manifest (and optional side files) into a fresh temp dir. */
    async function makeManifest(
        manifest: unknown,
        files: Record<string, string> = {},
    ): Promise<{ dir: string; manifestPath: string }> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-manifest-'));
        dirs.push(dir);
        const manifestPath = path.join(dir, 'tasks.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest));
        for (const [name, content] of Object.entries(files)) {
            await fs.writeFile(path.join(dir, name), content);
        }
        return { dir, manifestPath };
    }

    /** Run batch capturing stdout; resolves with output and the thrown error, if any. */
    async function runBatch(argv: string[]): Promise<{ out: string; error: unknown }> {
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
            chunks.push(String(c));
            return true;
        });
        let error: unknown;
        try {
            await batch(parseArgs(argv));
        } catch (e) {
            error = e;
        } finally {
            spy.mockRestore();
        }
        return { out: chunks.join(''), error };
    }

    it('runs a render → sign → encrypt pipeline via @refs and reports the envelope', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const { dir, manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'doc', command: 'render', flags: { input: 'doc.json', output: 'out/doc.pdf' } },
                {
                    id: 'signed',
                    command: 'sign',
                    flags: { input: '@doc', output: 'out/doc-signed.pdf', key: RSA_KEY, cert: RSA_CERT },
                },
                {
                    id: 'secured',
                    command: 'encrypt',
                    flags: { input: '@signed', output: 'out/doc-secured.pdf', 'owner-password': 'o-pass' },
                },
            ],
        }, { 'doc.json': DOC_JSON });

        const { out, error } = await runBatch(['--manifest', manifestPath, '--format', 'json']);
        expect(error).toBeUndefined();

        const envelope = JSON.parse(out) as ManifestEnvelope;
        expect(envelope).toMatchObject({
            ok: true, command: 'batch', mode: 'manifest',
            total: 3, succeeded: 3, failed: 0, skipped: 0,
        });
        expect(envelope.tasks.map((t) => t.id)).toEqual(['doc', 'signed', 'secured']);
        expect(envelope.tasks.every((t) => t.ok)).toBe(true);

        const secured = await fs.readFile(path.join(dir, 'out', 'doc-secured.pdf'));
        expect(secured.subarray(0, 4).toString()).toBe('%PDF');
        expect(secured.toString('latin1')).toContain('/Encrypt');
        // The intermediate signed PDF was produced from the rendered @doc ref.
        const signed = await fs.readFile(path.join(dir, 'out', 'doc-signed.pdf'));
        expect(signed.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('rejects an unsupported manifest version with exit 2', async () => {
        const { manifestPath } = await makeManifest({
            version: 2,
            tasks: [{ id: 'a', command: 'render', flags: {} }],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toBeInstanceOf(CliError);
        expect(error).toMatchObject({ exitCode: 2 });
    });

    it('rejects duplicate task ids with E_INPUT (exit 1)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'a', command: 'render', flags: { input: 'x.json', output: 'a.pdf' } },
                { id: 'a', command: 'render', flags: { input: 'x.json', output: 'b.pdf' } },
            ],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('rejects a command outside the whitelist with E_INPUT (exit 1)', async () => {
        // ltv/compare are real commands but require positional arguments, which
        // manifest tasks cannot carry yet — they are excluded from the whitelist.
        for (const command of ['doctor', 'govern', 'not-a-command', 'ltv', 'compare']) {
            const { manifestPath } = await makeManifest({
                version: 1,
                tasks: [{ id: 'a', command, flags: {} }],
            });
            const { error } = await runBatch(['--manifest', manifestPath]);
            expect(error, `command=${command}`).toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
        }
    });

    it('rejects a forward @reference with E_INPUT (exit 1)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'first', command: 'sign', flags: { input: '@later', output: 'a.pdf', key: RSA_KEY, cert: RSA_CERT } },
                { id: 'later', command: 'render', flags: { input: 'x.json', output: 'b.pdf' } },
            ],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('rejects an unknown @reference with E_INPUT (exit 1)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [{ id: 'a', command: 'render', flags: { input: '@ghost', output: 'a.pdf' } }],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('rejects an @reference to a task without an output with E_INPUT (exit 1)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'check', command: 'inspect', flags: { input: 'x.pdf' } },
                { id: 'b', command: 'render', flags: { input: '@check', output: 'b.pdf' } },
            ],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('rejects a relative path traversal in a manifest value (parity with direct flags)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [{ id: 'a', command: 'render', flags: { input: 'x.json', output: '../../evil.pdf' } }],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).message).toContain('traversal');
    });

    it('refuses a network-reaching task flag without --allow-network (exit 2)', async () => {
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [{
                id: 'signed',
                command: 'sign',
                flags: {
                    input: 'a.pdf', output: 'b.pdf', key: RSA_KEY, cert: RSA_CERT,
                    timestamp: 'http://tsa.example/rfc3161',
                },
            }],
        });
        const { error } = await runBatch(['--manifest', manifestPath]);
        expect(error).toBeInstanceOf(CliError);
        expect(error).toMatchObject({ exitCode: 2, code: ErrorCode.USAGE });
        expect((error as CliError).message).toContain('--allow-network');
    });

    it('accepts the same manifest with --allow-network (validated via --dry-run)', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const { manifestPath } = await makeManifest({
            version: 1,
            tasks: [{
                id: 'signed',
                command: 'sign',
                flags: {
                    input: 'a.pdf', output: 'b.pdf', key: RSA_KEY, cert: RSA_CERT,
                    timestamp: 'http://tsa.example/rfc3161',
                },
            }],
        });
        const { out, error } = await runBatch(
            ['--manifest', manifestPath, '--allow-network', '--dry-run', '--format', 'json'],
        );
        expect(error).toBeUndefined();
        const envelope = JSON.parse(out) as ManifestEnvelope;
        expect(envelope).toMatchObject({ ok: true, mode: 'manifest', dryRun: true, total: 1 });
    });

    it('fail-fast by default: tasks after a failure are skipped', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const { dir, manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'doc', command: 'render', flags: { input: 'doc.json', output: 'out/doc.pdf' } },
                {
                    id: 'signed',
                    command: 'sign',
                    flags: { input: '@doc', output: 'out/signed.pdf', key: 'no-such-key.pem', cert: RSA_CERT },
                },
                {
                    id: 'secured',
                    command: 'encrypt',
                    flags: { input: '@signed', output: 'out/secured.pdf', 'owner-password': 'x' },
                },
            ],
        }, { 'doc.json': DOC_JSON });

        const { out, error } = await runBatch(['--manifest', manifestPath, '--format', 'json']);
        expect(error).toBeInstanceOf(CliError);
        expect(error).toMatchObject({ exitCode: 1 });

        const envelope = JSON.parse(out) as ManifestEnvelope;
        expect(envelope).toMatchObject({ ok: false, total: 3, succeeded: 1, failed: 1, skipped: 1 });
        expect(envelope.tasks[1]?.error?.code).toBeDefined();
        expect(envelope.tasks[2]?.skipped).toBe(true);
        await expect(fs.stat(path.join(dir, 'out', 'secured.pdf'))).rejects.toThrow();
    });

    it('--continue-on-error runs independent tasks but skips @-dependents of a failure', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const { dir, manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'doc', command: 'render', flags: { input: 'doc.json', output: 'out/doc.pdf' } },
                {
                    id: 'signed',
                    command: 'sign',
                    flags: { input: '@doc', output: 'out/signed.pdf', key: 'no-such-key.pem', cert: RSA_CERT },
                },
                {
                    id: 'secured',
                    command: 'encrypt',
                    flags: { input: '@signed', output: 'out/secured.pdf', 'owner-password': 'x' },
                },
                { id: 'other', command: 'render', flags: { input: 'doc.json', output: 'out/other.pdf' } },
            ],
        }, { 'doc.json': DOC_JSON });

        const { out, error } = await runBatch(
            ['--manifest', manifestPath, '--continue-on-error', '--format', 'json'],
        );
        expect(error).toMatchObject({ exitCode: 1 });

        const envelope = JSON.parse(out) as ManifestEnvelope;
        expect(envelope).toMatchObject({ ok: false, total: 4, succeeded: 2, failed: 1, skipped: 1 });
        expect(envelope.tasks[2]?.skipped).toBe(true);
        expect(envelope.tasks[3]?.ok).toBe(true);
        const other = await fs.readFile(path.join(dir, 'out', 'other.pdf'));
        expect(other.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('--dry-run validates and prints the plan without writing anything', async () => {
        process.env['PDFNATIVE_QUIET'] = '1';
        const { dir, manifestPath } = await makeManifest({
            version: 1,
            tasks: [
                { id: 'doc', command: 'render', flags: { input: 'doc.json', output: 'out/doc.pdf' } },
                {
                    id: 'secured',
                    command: 'encrypt',
                    flags: { input: '@doc', output: 'out/secured.pdf', 'owner-password': 'x' },
                },
            ],
        }, { 'doc.json': DOC_JSON });

        const { out, error } = await runBatch(['--manifest', manifestPath, '--dry-run', '--format', 'json']);
        expect(error).toBeUndefined();
        const envelope = JSON.parse(out) as ManifestEnvelope;
        expect(envelope).toMatchObject({ ok: true, dryRun: true, total: 2 });
        await expect(fs.stat(path.join(dir, 'out'))).rejects.toThrow();
    });

    it('rejects --manifest combined with the directory mode (exit 2)', async () => {
        const { dir, manifestPath } = await makeManifest({
            version: 1,
            tasks: [{ id: 'a', command: 'render', flags: { input: 'x.json', output: 'a.pdf' } }],
        });
        const { error } = await runBatch(['--manifest', manifestPath, '--input-dir', dir]);
        expect(error).toBeInstanceOf(CliError);
        expect(error).toMatchObject({ exitCode: 2, code: ErrorCode.USAGE });
    });
});
