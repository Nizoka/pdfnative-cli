import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    BUNDLED_FONT_MODULES,
    SCRIPT_CODES,
    FONT_ALIASES,
    resolveFontAlias,
    normalizeLangs,
    resolveFontsDir,
    applyFontFlags,
    sniffFontFormat,
    defaultFontName,
    parseFontFileSpec,
    loadCustomFonts,
    MAX_FONT_FILE_BYTES,
} from '../../src/utils/fonts.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { TempFiles } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(() => tmp.cleanup());

describe('fonts: the bundled inventory (pdfnative 1.8.0)', () => {
    it('lists 31 modules: 4 utility faces and 27 script codes', () => {
        expect(Object.keys(BUNDLED_FONT_MODULES)).toHaveLength(31);
        expect(SCRIPT_CODES).toHaveLength(27);
        for (const code of ['lo', 'nod', 'khb', 'tdd', 'cjm']) expect(SCRIPT_CODES).toContain(code);
        for (const face of ['latin', 'emoji', 'color-emoji', 'math']) expect(BUNDLED_FONT_MODULES).toHaveProperty(face);
    });

    it('every module file exists in the installed pdfnative package', () => {
        const dir = resolveFontsDir();
        for (const [code, file] of Object.entries(BUNDLED_FONT_MODULES)) {
            expect(existsSync(join(dir, file)), `${code} → ${file}`).toBe(true);
        }
    });

    it('aliases Hausa, Yoruba, Igbo and Swahili to latin — no module of their own', () => {
        expect(Object.keys(FONT_ALIASES).sort()).toEqual(['ha', 'ig', 'sw', 'yo']);
        for (const a of Object.keys(FONT_ALIASES)) {
            expect(resolveFontAlias(a)).toBe('latin');
            expect(BUNDLED_FONT_MODULES).not.toHaveProperty(a);
        }
        expect(resolveFontAlias(' TH ')).toBe('th');
    });

    it('normalizeLangs splits, aliases and de-duplicates while keeping order', () => {
        expect(normalizeLangs(undefined)).toEqual([]);
        expect(normalizeLangs('th, yo,latin,ha,,th')).toEqual(['th', 'latin']);
    });

    it('applyFontFlags rejects an unknown shortcut with a usage error naming the aliases', async () => {
        try {
            await applyFontFlags(['klingon']);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).exitCode).toBe(2);
            expect((e as CliError).message).toContain('cjm');
            expect((e as CliError).message).toContain('aliases of latin: ha, yo, ig, sw');
        }
    });

    it('applyFontFlags accepts an alias and the new 1.8.0 codes', async () => {
        await expect(applyFontFlags(['yo', 'lo', 'nod', 'khb', 'tdd', 'cjm'])).resolves.toBeUndefined();
    });
});

describe('fonts: --font-file posture', () => {
    it('sniffs the sfnt signature and names the containers it refuses', () => {
        expect(sniffFontFormat(new Uint8Array([0, 1, 0, 0, 0, 10]))).toBe('ttf');
        expect(sniffFontFormat(new TextEncoder().encode('true0000'))).toBe('ttf');
        expect(sniffFontFormat(new TextEncoder().encode('OTTO0000'))).toBe('otf');
        expect(sniffFontFormat(new TextEncoder().encode('ttcf0000'))).toBe('ttc');
        expect(sniffFontFormat(new TextEncoder().encode('wOFF0000'))).toBe('woff');
        expect(sniffFontFormat(new TextEncoder().encode('wOF20000'))).toBe('woff2');
        expect(sniffFontFormat(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
        expect(sniffFontFormat(new Uint8Array(2))).toBeNull();
    });

    it('derives a registry name from the basename', () => {
        expect(defaultFontName('C:\\fonts\\My Font_v2.ttf')).toBe('my-font-v2');
        expect(defaultFontName('/tmp/__.otf')).toBe('custom-font');
    });

    it('derives the SAME name on every platform: both separators end a directory', () => {
        // node:path only splits on the host separator; the name is part of the rendered
        // bytes, so a Windows path in a manifest must not name the font differently on Linux.
        for (const path of ['C:\\fonts\\brand.ttf', 'C:/fonts/brand.ttf', '/usr/share/fonts/brand.ttf', 'fonts\\sub/brand.ttf', 'brand.ttf']) {
            expect(defaultFontName(path), path).toBe('brand');
        }
        expect(defaultFontName('fonts/Brand.Sans.Bold.otf')).toBe('brand-sans-bold');
        expect(defaultFontName('fonts/noextension')).toBe('noextension');
        expect(defaultFontName('fonts/.hidden')).toBe('hidden');
        expect(defaultFontName('fonts/')).toBe('custom-font');
    });

    it('parses <path>[:name], honouring a Windows drive letter', () => {
        expect(parseFontFileSpec('C:\\fonts\\a.ttf')).toEqual({ path: 'C:\\fonts\\a.ttf', name: 'a' });
        expect(parseFontFileSpec('C:\\fonts\\a.ttf:brand')).toEqual({ path: 'C:\\fonts\\a.ttf', name: 'brand' });
        expect(parseFontFileSpec('fonts/a.ttf:brand')).toEqual({ path: 'fonts/a.ttf', name: 'brand' });
        expect(() => parseFontFileSpec('fonts/a.ttf:Bad Name')).toThrow(CliError);
        expect(() => parseFontFileSpec('')).toThrow(CliError);
    });

    it('refuses a name that collides with a bundled shortcut or an alias', async () => {
        const p = await tmp.bytes('latin.ttf', new Uint8Array([0, 1, 0, 0]));
        await expect(loadCustomFonts([`${p}:latin`], true)).rejects.toMatchObject({ exitCode: 2 });
        await expect(loadCustomFonts([`${p}:yo`], true)).rejects.toMatchObject({ exitCode: 2 });
    });

    it('refuses a non-font, a collection and a WOFF container with E_INPUT', async () => {
        const cases: Array<[string, Uint8Array]> = [
            ['plain.ttf', new TextEncoder().encode('%PDF-1.7 not a font')],
            ['coll.ttc', new TextEncoder().encode('ttcf\0\0\0\0')],
            ['web.woff', new TextEncoder().encode('wOFF\0\0\0\0')],
        ];
        for (const [name, bytes] of cases) {
            const p = await tmp.bytes(name, bytes);
            try {
                await loadCustomFonts([`${p}:x${name.replace(/\W/g, '')}`], true);
                expect.unreachable();
            } catch (e) {
                expect(e).toBeInstanceOf(CliError);
                expect((e as CliError).code).toBe(ErrorCode.INPUT);
            }
        }
    });

    it('refuses a truncated sfnt (parse failure → E_INPUT, message only)', async () => {
        const p = await tmp.bytes('trunc.ttf', new Uint8Array([0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0]));
        try {
            await loadCustomFonts([`${p}:trunc`], true);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.INPUT);
            expect((e as CliError).message).toContain('could not be parsed');
        }
    });

    it('rejects path traversal before touching the disk', async () => {
        await expect(loadCustomFonts(['../evil.ttf:evil'], true)).rejects.toThrow(/traversal/);
    });

    it('caps the file size at 32 MiB', () => {
        expect(MAX_FONT_FILE_BYTES).toBe(32 * 1024 * 1024);
    });
});
