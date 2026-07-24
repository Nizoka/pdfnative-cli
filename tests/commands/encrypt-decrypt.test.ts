import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { encrypt } from '../../src/commands/encrypt.js';
import { decrypt } from '../../src/commands/decrypt.js';
import { merge } from '../../src/commands/merge.js';
import { extract } from '../../src/commands/extract.js';
import { split } from '../../src/commands/split.js';
import { inspect } from '../../src/commands/inspect.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `crypto-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function renderPages(pages: number): Promise<string> {
    const blocks: unknown[] = [{ type: 'heading', text: 'T', level: 1 }];
    for (let i = 0; i < pages; i++) {
        if (i > 0) blocks.push({ type: 'pageBreak' });
        blocks.push({ type: 'paragraph', text: `page ${i + 1}` });
    }
    const inPath = tmpPath('in.json');
    const outPath = tmpPath('doc.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

/** Read `inspect --encryption` JSON, optionally with a password. */
async function encryptionOf(pdf: string, password?: string): Promise<unknown> {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { calls.push(String(c)); return true; });
    const args = ['--input', pdf, '--encryption', '--format', 'json', '--pretty'];
    if (password !== undefined) args.push('--password', password);
    try {
        await inspect(parseArgs(args));
    } finally {
        spy.mockRestore();
    }
    return JSON.parse(calls.join('')).encryption;
}

describe('encrypt', () => {
    it('encrypts with AES-128 by default and reports the scheme', async () => {
        const doc = await renderPages(1);
        const out = tmpPath('enc.pdf');
        await encrypt(parseArgs(['--input', doc, '--output', out, '--owner-password', 'o']));
        expect(await encryptionOf(out)).toMatchObject({ algorithm: 'aes128' });
    });

    it('encrypts with AES-256 via --algorithm', async () => {
        const doc = await renderPages(1);
        const out = tmpPath('enc256.pdf');
        await encrypt(parseArgs(['--input', doc, '--output', out, '--owner-password', 'o', '--algorithm', 'aes-256']));
        expect(await encryptionOf(out)).toMatchObject({ algorithm: 'aes256' });
    });

    it('requires an owner password', async () => {
        const doc = await renderPages(1);
        await expect(
            encrypt(parseArgs(['--input', doc, '--output', tmpPath('x.pdf')])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('rejects an invalid --algorithm', async () => {
        const doc = await renderPages(1);
        await expect(
            encrypt(parseArgs(['--input', doc, '--output', tmpPath('x.pdf'), '--owner-password', 'o', '--algorithm', 'des'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });
});

describe('decrypt', () => {
    it('round-trips: encrypt (user pw) then decrypt restores an openable PDF', async () => {
        const doc = await renderPages(2);
        const enc = tmpPath('enc.pdf');
        const dec = tmpPath('dec.pdf');
        await encrypt(parseArgs(['--input', doc, '--output', enc, '--owner-password', 'o', '--user-password', 'u']));
        // The encrypted doc requires the user password to open.
        await expect(encryptionOf(enc)).rejects.toMatchObject({ code: ErrorCode.PASSWORD });
        expect(await encryptionOf(enc, 'u')).toMatchObject({ algorithm: 'aes128', authenticatedAs: 'user' });

        await decrypt(parseArgs(['--input', enc, '--output', dec, '--password', 'u']));
        expect(await encryptionOf(dec)).toBeNull();
    });

    it('surfaces E_PASSWORD for a wrong password', async () => {
        const doc = await renderPages(1);
        const enc = tmpPath('enc.pdf');
        await encrypt(parseArgs(['--input', doc, '--output', enc, '--owner-password', 'o', '--user-password', 'u']));
        await expect(
            decrypt(parseArgs(['--input', enc, '--output', tmpPath('x.pdf'), '--password', 'WRONG'])),
        ).rejects.toMatchObject({ code: ErrorCode.PASSWORD });
    });
});

describe('page-tree re-encryption & streaming', () => {
    it('merge --encrypt produces an encrypted document', async () => {
        const a = await renderPages(1);
        const b = await renderPages(1);
        const out = tmpPath('menc.pdf');
        await merge(parseArgs([a, b, '--output', out, '--encrypt', 'aes-256', '--owner-password', 'o']));
        expect(await encryptionOf(out)).toMatchObject({ algorithm: 'aes256' });
    });

    it('extract --stream writes a valid PDF', async () => {
        const doc = await renderPages(3);
        const out = tmpPath('xs.pdf');
        await extract(parseArgs(['--input', doc, '--pages', '1,3', '--output', out, '--stream']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('split --stream writes one PDF per range', async () => {
        const doc = await renderPages(3);
        const outDir = tmpPath('splitstream');
        await split(parseArgs(['--input', doc, '--output-dir', outDir, '--pages', '1-2,3', '--stream']));
        const files = (await fs.readdir(outDir)).filter((f) => f.endsWith('.pdf'));
        expect(files).toHaveLength(2);
        for (const f of files) {
            expect((await fs.readFile(path.join(outDir, f))).subarray(0, 4).toString('ascii')).toBe('%PDF');
        }
    });

    it('extract --stream --encrypt writes an encrypted PDF', async () => {
        const doc = await renderPages(2);
        const out = tmpPath('xse.pdf');
        await extract(parseArgs(['--input', doc, '--pages', '1', '--output', out, '--stream', '--encrypt', '--owner-password', 'o']));
        expect(await encryptionOf(out)).toMatchObject({ algorithm: 'aes128' });
    });

    it('encrypt --stream produces an encrypted PDF, decrypt --stream restores it', async () => {
        const doc = await renderPages(3);
        const enc = tmpPath('senc.pdf');
        const dec = tmpPath('sdec.pdf');
        await encrypt(parseArgs(['--input', doc, '--output', enc, '--owner-password', 'o', '--user-password', 'u', '--stream']));
        expect(await encryptionOf(enc, 'u')).toMatchObject({ algorithm: 'aes128' });
        await decrypt(parseArgs(['--input', enc, '--output', dec, '--password', 'u', '--stream', '--chunk-size', '4096']));
        expect(await encryptionOf(dec)).toBeNull();
    });

    it('merge reads an encrypted source via --password', async () => {
        const a = await renderPages(1);
        const enc = tmpPath('enc.pdf');
        await encrypt(parseArgs(['--input', a, '--output', enc, '--owner-password', 'o', '--user-password', 'u']));
        const b = await renderPages(1);
        const out = tmpPath('mixed.pdf');
        // Both sources share the same password here (b is unencrypted → password ignored).
        await merge(parseArgs([enc, b, '--output', out, '--password', 'u']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
});
