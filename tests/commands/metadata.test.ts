import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { render } from '../../src/commands/render.js';
import { sign } from '../../src/commands/sign.js';
import { metadata } from '../../src/commands/metadata.js';
import { inspect } from '../../src/commands/inspect.js';
import { extractTextCmd } from '../../src/commands/extract-text.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const RSA_KEY = path.join(FIXTURES, 'rsa-key.pem');
const RSA_CERT = path.join(FIXTURES, 'rsa-cert.pem');

const FIXED_DATE = '2026-01-15T00:00:00Z';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `meta-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function renderDoc(): Promise<string> {
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({
        blocks: [
            { type: 'heading', text: 'Metadata Doc', level: 1 },
            { type: 'paragraph', text: 'stable body text' },
        ],
    }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
        chunks.push(String(c));
        return true;
    });
    try {
        await fn();
    } finally {
        spy.mockRestore();
    }
    return chunks.join('');
}

interface InspectJson {
    readonly pageCount: number;
    readonly metadata: {
        readonly title: string | null;
        readonly author: string | null;
        readonly subject: string | null;
    };
}

async function inspectJson(pdfPath: string): Promise<InspectJson> {
    const out = await captureStdout(() => inspect(parseArgs(['--input', pdfPath, '--format', 'json'])));
    return JSON.parse(out) as InspectJson;
}

async function extractedText(pdfPath: string): Promise<string> {
    return captureStdout(() => extractTextCmd(parseArgs(['--input', pdfPath])));
}

describe('metadata', () => {
    it('updates title and author without touching the document content', async () => {
        const doc = await renderDoc();
        const before = await inspectJson(doc);
        const textBefore = await extractedText(doc);
        const out = tmpPath('updated.pdf');

        await metadata(parseArgs([
            '--input', doc, '--output', out,
            '--title', 'New Title', '--author', 'New Author',
            '--mod-date', FIXED_DATE,
        ]));

        const after = await inspectJson(out);
        expect(after.metadata.title).toBe('New Title');
        expect(after.metadata.author).toBe('New Author');
        expect(after.pageCount).toBe(before.pageCount);
        expect(await extractedText(out)).toBe(textBefore);
    });

    it('preserves an existing signature (original bytes are a prefix of the output)', async () => {
        const doc = await renderDoc();
        const signed = tmpPath('signed.pdf');
        await sign(parseArgs([
            '--input', doc, '--output', signed,
            '--key', RSA_KEY, '--cert', RSA_CERT,
        ]));
        const out = tmpPath('signed-meta.pdf');

        await metadata(parseArgs([
            '--input', signed, '--output', out,
            '--title', 'Retitled', '--mod-date', FIXED_DATE,
        ]));

        const original = await fs.readFile(signed);
        const updated = await fs.readFile(out);
        // Incremental save: the document only GROWS — the signed revision
        // (signature bytes included) must be an exact byte prefix.
        expect(updated.length).toBeGreaterThan(original.length);
        expect(updated.subarray(0, original.length).equals(original)).toBe(true);
    });

    it('accepts a --from-json payload', async () => {
        const doc = await renderDoc();
        const payload = tmpPath('meta.json');
        await fs.writeFile(payload, JSON.stringify({
            title: 'From JSON',
            keywords: 'alpha, beta',
            modDate: FIXED_DATE,
        }), 'utf8');
        const out = tmpPath('fromjson.pdf');

        await metadata(parseArgs(['--input', doc, '--output', out, '--from-json', payload]));

        const after = await inspectJson(out);
        expect(after.metadata.title).toBe('From JSON');
        const original = await fs.readFile(doc);
        const updated = await fs.readFile(out);
        const tail = updated.subarray(original.length).toString('latin1');
        expect(tail).toContain('/Keywords');
    });

    it('rejects an unknown key in --from-json with E_INPUT', async () => {
        const doc = await renderDoc();
        const payload = tmpPath('bad-meta.json');
        await fs.writeFile(payload, JSON.stringify({ title: 'ok', creator: 'nope' }), 'utf8');

        const err = await metadata(parseArgs([
            '--input', doc, '--output', tmpPath('x.pdf'), '--from-json', payload,
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe('E_INPUT');
    });

    it('rejects --from-json combined with per-field flags (exit 2)', async () => {
        const doc = await renderDoc();
        const payload = tmpPath('meta.json');
        await fs.writeFile(payload, JSON.stringify({ title: 'x' }), 'utf8');

        const err = await metadata(parseArgs([
            '--input', doc, '--output', tmpPath('x.pdf'),
            '--from-json', payload, '--title', 'clash',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('requires at least one field (exit 2)', async () => {
        const doc = await renderDoc();
        const err = await metadata(parseArgs([
            '--input', doc, '--output', tmpPath('x.pdf'),
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('--dry-run validates without writing', async () => {
        const doc = await renderDoc();
        const out = tmpPath('nope.pdf');
        await metadata(parseArgs([
            '--input', doc, '--output', out, '--title', 'Dry', '--dry-run',
        ]));
        await expect(fs.access(out)).rejects.toThrow();
    });

    it('stamps a /ModDate by default when --mod-date is omitted', async () => {
        const doc = await renderDoc();
        const out = tmpPath('moddate.pdf');
        await metadata(parseArgs(['--input', doc, '--output', out, '--title', 'Dated']));

        const original = await fs.readFile(doc);
        const updated = await fs.readFile(out);
        const tail = updated.subarray(original.length).toString('latin1');
        expect(tail).toContain('/ModDate');
    });
});
