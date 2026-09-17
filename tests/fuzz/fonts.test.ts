// Hostile font input: random bytes never crash the sniffer, random
// `--font-file` specs are a usage error or a {path, name}, and a garbage
// program behind a valid sfnt magic is refused with E_INPUT (the engine's
// parser error is wrapped, never leaked as a TypeError).

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffFontFormat, parseFontFileSpec, loadCustomFonts, BUNDLED_FONT_MODULES, FONT_ALIASES } from '../../src/utils/fonts.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, forEachCaseAsync, onlyCliError, onlyCliErrorAsync, randomToken, assertPrototypeClean, concatBytes, mulberry32 } from '../helpers/fuzz.js';

const dir = mkdtempSync(join(tmpdir(), 'pdfcli-fuzz-fonts-'));
afterAll(() => { assertPrototypeClean(); rmSync(dir, { recursive: true, force: true }); });
afterEach(assertPrototypeClean);

const MAGICS: readonly [string, Uint8Array][] = [
    ['ttf', Uint8Array.from([0, 1, 0, 0])],
    ['ttf', new TextEncoder().encode('true')],
    ['otf', new TextEncoder().encode('OTTO')],
    ['ttc', new TextEncoder().encode('ttcf')],
    ['woff', new TextEncoder().encode('wOFF')],
    ['woff2', new TextEncoder().encode('wOF2')],
];

function randomBytes(rng: ReturnType<typeof mulberry32>, n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = rng.int(256);
    return out;
}

describe('fuzz: fonts', () => {
    it('sniffFontFormat never throws on 500 random byte strings and only ever returns a known format', () => {
        const known = new Set(['ttf', 'otf', 'ttc', 'woff', 'woff2', null]);
        forEachCase('sniff', 500, (rng) => {
            const bytes = randomBytes(rng, rng.int(40));
            expect(known.has(sniffFontFormat(bytes))).toBe(true);
        });
        for (const [format, magic] of MAGICS) expect(sniffFontFormat(concatBytes([magic, new Uint8Array(12)]))).toBe(format);
    });

    it('parseFontFileSpec answers 300 random specs with {path, name} or E_USAGE', () => {
        forEachCase('spec', 300, (rng) => {
            const r = onlyCliError(() => parseFontFileSpec(randomToken(rng, 5)), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            expect(r.value.path.length).toBeGreaterThan(0);
            expect(r.value.name.length).toBeGreaterThan(0);
        });
    });

    it('20 garbage programs behind a valid sfnt magic are refused with E_INPUT, never a parser crash', async () => {
        await forEachCaseAsync('garbage-font', 20, async (rng, i) => {
            const magic = rng.pick(MAGICS.filter(([f]) => f === 'ttf' || f === 'otf'))[1];
            const p = join(dir, `g${i}.ttf`);
            writeFileSync(p, concatBytes([magic, randomBytes(rng, 16 + rng.int(4096))]));
            const r = await onlyCliErrorAsync(() => loadCustomFonts([`${p}:fuzz${i}`], true), [ErrorCode.INPUT]);
            expect(r.outcome).toBe('error');
        });
    });

    it.each(['ttcf', 'wOFF', 'wOF2', 'JUNK'])('a %s container is refused with E_INPUT', async (magic) => {
        const p = join(dir, `${magic}.ttf`);
        writeFileSync(p, concatBytes([new TextEncoder().encode(magic), new Uint8Array(64)]));
        const r = await onlyCliErrorAsync(() => loadCustomFonts([`${p}:custom`], true), [ErrorCode.INPUT]);
        expect(r.outcome).toBe('error');
    });

    it('a name colliding with a bundled shortcut or alias is a usage error before the file is read', async () => {
        for (const name of [Object.keys(BUNDLED_FONT_MODULES)[0]!, Object.keys(FONT_ALIASES)[0]!]) {
            const r = await onlyCliErrorAsync(() => loadCustomFonts([`${join(dir, 'missing.ttf')}:${name}`], true), [ErrorCode.USAGE]);
            expect(r.outcome).toBe('error');
        }
    });
});
