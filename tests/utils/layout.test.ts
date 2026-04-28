import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { buildLayoutOptions, loadLayoutFile, assertStreamingCompatible } from '../../src/utils/layout.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    for (const f of tmp.splice(0)) await fs.unlink(f).catch(() => undefined);
    delete process.env['PDFNATIVE_ENCRYPT_OWNER_PASS'];
    delete process.env['PDFNATIVE_ENCRYPT_USER_PASS'];
});

describe('layout — page-size', () => {
    it('parses named A4', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--page-size', 'a4']));
        expect(layout.pageWidth).toBeCloseTo(595.28);
        expect(layout.pageHeight).toBeCloseTo(841.89);
    });

    it('parses named Letter (case-insensitive)', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--page-size', 'LETTER']));
        expect(layout.pageWidth).toBe(612);
        expect(layout.pageHeight).toBe(792);
    });

    it('parses WxH custom size', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--page-size', '500x700']));
        expect(layout.pageWidth).toBe(500);
        expect(layout.pageHeight).toBe(700);
    });

    it('rejects invalid page size', async () => {
        const err = await buildLayoutOptions(parseArgs(['--page-size', 'huge'])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });
});

describe('layout — margin', () => {
    it('parses uniform margin', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--margin', '50']));
        expect(layout.margins).toEqual({ t: 50, r: 50, b: 50, l: 50 });
    });

    it('parses 4-tuple margin', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--margin', '10,20,30,40']));
        expect(layout.margins).toEqual({ t: 10, r: 20, b: 30, l: 40 });
    });

    it('rejects negative margin', async () => {
        const err = await buildLayoutOptions(parseArgs(['--margin', '-5'])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('rejects 3-component margin', async () => {
        const err = await buildLayoutOptions(parseArgs(['--margin', '10,20,30'])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
    });
});

describe('layout — tagged / conformance', () => {
    it('accepts --tagged pdfa3b', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--tagged', 'pdfa3b']));
        expect(layout.tagged).toBe('pdfa3b');
    });

    it('--tagged none disables tagging', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--tagged', 'none']));
        expect(layout.tagged).toBe(false);
    });

    it('rejects invalid --tagged value', async () => {
        const err = await buildLayoutOptions(parseArgs(['--tagged', 'pdfa9z'])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('--conformance 2b maps to --tagged pdfa2b (deprecated alias)', async () => {
        const layout = await buildLayoutOptions(parseArgs(['--conformance', '2b']));
        expect(layout.tagged).toBe('pdfa2b');
    });

    it('rejects --tagged + --conformance combined', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--tagged', 'pdfa1b', '--conformance', '1b']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });
});

describe('layout — header / footer templates', () => {
    it('builds header template from flags', async () => {
        const layout = await buildLayoutOptions(
            parseArgs(['--header-left', 'L', '--header-center', 'C', '--header-right', 'R']),
        );
        expect(layout.headerTemplate).toEqual({ left: 'L', center: 'C', right: 'R' });
    });

    it('builds footer template from flags', async () => {
        const layout = await buildLayoutOptions(
            parseArgs(['--footer-left', '{date}', '--footer-right', '{page} / {pages}']),
        );
        expect(layout.footerTemplate).toBeDefined();
        expect(layout.footerTemplate?.left).toBe('{date}');
        expect(layout.footerTemplate?.right).toBe('{page} / {pages}');
    });
});

describe('layout — watermark', () => {
    it('builds text watermark', async () => {
        const layout = await buildLayoutOptions(
            parseArgs(['--watermark-text', 'CONFIDENTIAL', '--watermark-opacity', '0.3']),
        );
        expect(layout.watermark?.text?.text).toBe('CONFIDENTIAL');
        expect(layout.watermark?.text?.opacity).toBe(0.3);
    });

    it('rejects opacity out of range', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--watermark-text', 'X', '--watermark-opacity', '2']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('rejects invalid watermark position', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--watermark-text', 'X', '--watermark-position', 'middle']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
    });
});

describe('layout — encryption', () => {
    it('builds AES-128 encryption from flags', async () => {
        const layout = await buildLayoutOptions(
            parseArgs(['--encrypt-owner-pass', 'secret', '--encrypt-algorithm', 'aes128']),
        );
        expect(layout.encryption?.ownerPassword).toBe('secret');
        expect(layout.encryption?.algorithm).toBe('aes128');
    });

    it('uses env var $PDFNATIVE_ENCRYPT_OWNER_PASS over flag', async () => {
        process.env['PDFNATIVE_ENCRYPT_OWNER_PASS'] = 'env-secret';
        const layout = await buildLayoutOptions(
            parseArgs(['--encrypt-owner-pass', 'flag-secret']),
        );
        expect(layout.encryption?.ownerPassword).toBe('env-secret');
    });

    it('rejects encryption without owner password', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--encrypt-algorithm', 'aes256']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('rejects encryption + tagged combined (ISO 19005-1 §6.3.2)', async () => {
        const err = await buildLayoutOptions(
            parseArgs([
                '--encrypt-owner-pass', 'x',
                '--tagged', 'pdfa2b',
            ]),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('rejects invalid algorithm', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--encrypt-owner-pass', 'x', '--encrypt-algorithm', 'rc4']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
    });

    it('rejects invalid permission', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--encrypt-owner-pass', 'x', '--encrypt-permissions', 'fly']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
    });
});

describe('layout — file loader', () => {
    it('returns empty when no path', async () => {
        const r = await loadLayoutFile(undefined);
        expect(r).toEqual({});
    });

    it('rejects non-object JSON', async () => {
        const p = path.join(os.tmpdir(), `layout-${Date.now()}.json`);
        tmp.push(p);
        await fs.writeFile(p, '[1,2,3]', 'utf8');
        const err = await loadLayoutFile(p).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
    });

    it('strips attachments[].data from layout file', async () => {
        const p = path.join(os.tmpdir(), `layout-${Date.now()}-2.json`);
        tmp.push(p);
        await fs.writeFile(
            p,
            JSON.stringify({ attachments: [{ filename: 'x.txt', data: 'INJECTED' }] }),
            'utf8',
        );
        const r = await loadLayoutFile(p);
        const att = (r.attachments?.[0] ?? {}) as Record<string, unknown>;
        expect(att.data).toBeUndefined();
        expect(att.filename).toBe('x.txt');
    });
});

describe('layout — assertStreamingCompatible', () => {
    it('rejects {pages} in header template', () => {
        expect(() =>
            assertStreamingCompatible({
                headerTemplate: { center: 'Page {page} / {pages}' },
            }),
        ).toThrow(CliError);
    });

    it('accepts {page} alone in footer', () => {
        expect(() =>
            assertStreamingCompatible({
                footerTemplate: { center: 'Page {page}' },
            }),
        ).not.toThrow();
    });

    it('accepts no templates', () => {
        expect(() => assertStreamingCompatible({})).not.toThrow();
    });
});

// ──────────────────────────────────────────────────────────────────────────
// Regression tests for bugs fixed in v0.2.0 patch
// ──────────────────────────────────────────────────────────────────────────

describe('layout — attachment flag parsing (Windows path regression)', () => {
    // Before the fix, `raw.split(':')` broke on Windows drive-letter paths like
    // `C:\path\to\file.xml:mime:rel:desc`, silently truncating the path to just
    // the drive letter.  This suite verifies the parser handles the drive-letter
    // colon correctly on all platforms.

    it('parses a POSIX-style attachment path with mime + relationship + description', async () => {
        const xmlPath = path.join(os.tmpdir(), `attach-posix-${Date.now()}.xml`);
        tmp.push(xmlPath);
        await fs.writeFile(xmlPath, '<root/>', 'utf8');

        const rawArg = `${xmlPath}:application/xml:Source:Test description`;
        const layout = await buildLayoutOptions(
            parseArgs(['--attachment', rawArg, '--tagged', 'pdfa3b']),
        );
        expect(layout.attachments).toHaveLength(1);
        const att = (layout.attachments?.[0] ?? {}) as Record<string, unknown>;
        expect(att.filename).toBe(path.basename(xmlPath));
        expect(att.mimeType).toBe('application/xml');
        expect(att.relationship).toBe('Source');
        expect(att.description).toBe('Test description');
    });

    it('uses application/octet-stream when mime is omitted', async () => {
        const binPath = path.join(os.tmpdir(), `attach-noext-${Date.now()}`);
        tmp.push(binPath);
        await fs.writeFile(binPath, 'binary', 'utf8');

        const layout = await buildLayoutOptions(
            parseArgs(['--attachment', binPath, '--tagged', 'pdfa3b']),
        );
        const att = (layout.attachments?.[0] ?? {}) as Record<string, unknown>;
        expect(att.mimeType).toBe('application/octet-stream');
    });

    it('parses multiple --attachment values as separate entries', async () => {
        const f1 = path.join(os.tmpdir(), `attach-multi1-${Date.now()}.txt`);
        const f2 = path.join(os.tmpdir(), `attach-multi2-${Date.now()}.csv`);
        tmp.push(f1, f2);
        await fs.writeFile(f1, 'hello', 'utf8');
        await fs.writeFile(f2, 'a,b,c', 'utf8');

        const layout = await buildLayoutOptions(
            parseArgs([
                '--attachment', `${f1}:text/plain`,
                '--attachment', `${f2}:text/csv`,
                '--tagged', 'pdfa3b',
            ]),
        );
        expect(layout.attachments).toHaveLength(2);
    });

    it('rejects a blank --attachment value with exit code 2', async () => {
        const err = await buildLayoutOptions(
            parseArgs(['--attachment', '', '--tagged', 'pdfa3b']),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    // Windows-specific: the OS temp directory on Windows begins with a drive
    // letter (e.g. C:\Users\…\AppData\Local\Temp).  We exercise the real temp
    // path unconditionally so the test catches regressions on both Windows and
    // POSIX (on POSIX there is no drive letter, but the parser must still work).
    it('parses the OS temp-dir path (covers Windows drive-letter colon)', async () => {
        const xmlPath = path.join(os.tmpdir(), `attach-win-${Date.now()}.xml`);
        tmp.push(xmlPath);
        await fs.writeFile(xmlPath, '<invoice/>', 'utf8');

        // On Windows: `C:\Users\…\file.xml:application/xml:Source:payload`
        // On POSIX:   `/tmp/file.xml:application/xml:Source:payload`
        const rawArg = `${xmlPath}:application/xml:Source:Structured invoice payload`;
        const layout = await buildLayoutOptions(
            parseArgs(['--attachment', rawArg, '--tagged', 'pdfa3b']),
        );
        const att = (layout.attachments?.[0] ?? {}) as Record<string, unknown>;
        // The entire path (with drive letter on Windows) must be the resolved path.
        expect(att.filename).toBe(path.basename(xmlPath));
        expect(att.mimeType).toBe('application/xml');
        expect(att.relationship).toBe('Source');
        expect(att.description).toBe('Structured invoice payload');
    });
});
