import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { annotate } from '../../src/commands/annotate.js';
import { encrypt } from '../../src/commands/encrypt.js';
import { inspect } from '../../src/commands/inspect.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env['PDFNATIVE_PASSWORD'];
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `annot-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function renderDoc(): Promise<string> {
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({
        blocks: [{ type: 'heading', text: 'Doc', level: 1 }, { type: 'paragraph', text: 'body' }],
    }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

async function writeAnnots(value: unknown): Promise<string> {
    const p = tmpPath('notes.json');
    await fs.writeFile(p, JSON.stringify(value), 'utf8');
    return p;
}

async function annotationSubtypes(pdfPath: string, password?: string): Promise<string[]> {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { chunks.push(String(c)); return true; });
    const argv = ['--input', pdfPath, '--format', 'json', '--annotations'];
    if (password !== undefined) argv.push('--password', password);
    await inspect(parseArgs(argv));
    const res = JSON.parse(chunks.join(''));
    return (res.annotations ?? []).map((a: { subtype: string }) => a.subtype);
}

/** Render a doc, then AES-encrypt it (owner 'o', user 'u') via the encrypt command. */
async function renderEncryptedDoc(): Promise<string> {
    const plain = await renderDoc();
    const enc = tmpPath('doc-enc.pdf');
    await encrypt(parseArgs(['--input', plain, '--output', enc, '--owner-password', 'o', '--user-password', 'u']));
    return enc;
}

describe('annotate', () => {
    it('attaches markup annotations and preserves the original page', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([
            { page: 1, type: 'highlight', rect: [72, 700, 520, 716], color: '#ffd400', contents: 'Important' },
            { page: 1, type: 'text', rect: [540, 700, 560, 720], icon: 'Comment', contents: 'A note' },
        ]);
        const out = tmpPath('annotated.pdf');
        await annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', out]));
        const bytes = await fs.readFile(out);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(await annotationSubtypes(out)).toEqual(expect.arrayContaining(['Highlight', 'Text']));
    });

    it('accepts the { annotations: [...] } wrapper', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots({ annotations: [{ page: 1, type: 'square', rect: [10, 10, 50, 50] }] });
        const out = tmpPath('annotated2.pdf');
        await annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', out]));
        expect(await annotationSubtypes(out)).toContain('Square');
    });

    it('requires --annotations', async () => {
        const doc = await renderDoc();
        await expect(annotate(parseArgs(['--input', doc]))).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an entry missing rect', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([{ page: 1, type: 'highlight' }]);
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an unknown annotation type', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([{ page: 1, type: 'bogus', rect: [0, 0, 1, 1] }]);
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects a page beyond the document', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([{ page: 99, type: 'text', rect: [0, 0, 1, 1] }]);
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('dry-run validates without writing', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([{ page: 1, type: 'text', rect: [0, 0, 1, 1] }]);
        const out = tmpPath('nope.pdf');
        await annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', out, '--dry-run']));
        await expect(fs.access(out)).rejects.toThrow();
    });

    it('supports line and freetext annotations', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([
            { page: 1, type: 'line', rect: [10, 10, 200, 12], start: [10, 11], end: [200, 11] },
            { page: 1, type: 'freetext', rect: [10, 100, 300, 130], contents: 'typed', fontSize: 11 },
        ]);
        const out = tmpPath('lf.pdf');
        await annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', out]));
        expect(await annotationSubtypes(out)).toEqual(expect.arrayContaining(['Line', 'FreeText']));
    });

    it('rejects a line annotation missing start/end', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([{ page: 1, type: 'line', rect: [0, 0, 1, 1] }]);
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects malformed JSON', async () => {
        const doc = await renderDoc();
        const bad = tmpPath('bad.json');
        await fs.writeFile(bad, '{ not json', 'utf8');
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', bad, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects a non-array / non-wrapped payload', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots({ foo: 'bar' });
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an empty annotations array', async () => {
        const doc = await renderDoc();
        const notes = await writeAnnots([]);
        await expect(
            annotate(parseArgs(['--input', doc, '--annotations', notes, '--output', tmpPath('x.pdf')])),
        ).rejects.toBeInstanceOf(CliError);
    });

    // ──────────────────────────────────────────────────────────────────
    // v1.4.0 — encrypted sources via --password / $PDFNATIVE_PASSWORD
    // ──────────────────────────────────────────────────────────────────

    describe('encrypted documents (--password)', () => {
        it('annotates an encrypted PDF with --password', async () => {
            const enc = await renderEncryptedDoc();
            const notes = await writeAnnots([
                { page: 1, type: 'highlight', rect: [72, 700, 520, 716], contents: 'secret note' },
            ]);
            const out = tmpPath('annotated-enc.pdf');
            await annotate(parseArgs(['--input', enc, '--annotations', notes, '--output', out, '--password', 'u']));
            const bytes = await fs.readFile(out);
            expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
            expect(await annotationSubtypes(out, 'u')).toContain('Highlight');
        });

        it('reads the password from $PDFNATIVE_PASSWORD when the flag is absent', async () => {
            const enc = await renderEncryptedDoc();
            const notes = await writeAnnots([{ page: 1, type: 'square', rect: [10, 10, 50, 50] }]);
            const out = tmpPath('annotated-env.pdf');
            process.env['PDFNATIVE_PASSWORD'] = 'u';
            try {
                await annotate(parseArgs(['--input', enc, '--annotations', notes, '--output', out]));
            } finally {
                delete process.env['PDFNATIVE_PASSWORD'];
            }
            expect(await annotationSubtypes(out, 'u')).toContain('Square');
        });

        it('fails with E_PASSWORD when the password is missing', async () => {
            const enc = await renderEncryptedDoc();
            const notes = await writeAnnots([{ page: 1, type: 'text', rect: [0, 0, 1, 1] }]);
            const err = await annotate(
                parseArgs(['--input', enc, '--annotations', notes, '--output', tmpPath('x.pdf')]),
            ).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
            expect((err as CliError).code).toBe(ErrorCode.PASSWORD);
        });

        it('fails with E_PASSWORD on a wrong password', async () => {
            const enc = await renderEncryptedDoc();
            const notes = await writeAnnots([{ page: 1, type: 'text', rect: [0, 0, 1, 1] }]);
            const err = await annotate(
                parseArgs(['--input', enc, '--annotations', notes, '--output', tmpPath('x.pdf'), '--password', 'nope']),
            ).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).code).toBe(ErrorCode.PASSWORD);
        });
    });
});
