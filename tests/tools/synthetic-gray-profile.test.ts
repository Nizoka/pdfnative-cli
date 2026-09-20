// scripts/lib/synthetic-gray-profile.ts — the committed Gray ICC fixture is
// exactly what the generator writes, and the engine accepts it as a Gray
// output intent.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSyntheticGrayProfile, GRAY_PROFILE_COPIES, GRAY_PROFILE_DESCRIPTION } from '../../scripts/lib/synthetic-gray-profile.js';
import { TempFiles, MINIMAL_DOC, SYNTHETIC_GRAY_ICC, renderTo, latin1 } from '../helpers/cli-harness.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const tmp = new TempFiles();
afterEach(() => tmp.cleanup());

const ascii = (b: Uint8Array, from: number, to: number): string => Buffer.from(b.subarray(from, to)).toString('latin1');

describe('synthetic Gray profile', () => {
    it('the committed copies are the generator output, byte for byte', () => {
        const generated = Buffer.from(buildSyntheticGrayProfile());
        for (const rel of GRAY_PROFILE_COPIES) {
            expect(readFileSync(resolve(ROOT, rel)).equals(generated), rel).toBe(true);
        }
        expect(Buffer.from(buildSyntheticGrayProfile()).equals(generated)).toBe(true);
    });

    it('is an ICC v2.1 monochrome output profile whose size field matches its length', () => {
        const icc = buildSyntheticGrayProfile();
        expect(icc.length).toBe(408);
        expect(new DataView(icc.buffer).getUint32(0)).toBe(icc.length);
        expect([icc[8], icc[9]]).toEqual([0x02, 0x10]);
        expect(ascii(icc, 12, 16)).toBe('prtr');
        expect(ascii(icc, 16, 20)).toBe('GRAY');
        expect(ascii(icc, 20, 24)).toBe('XYZ ');
        expect(ascii(icc, 36, 40)).toBe('acsp');
        const tagCount = new DataView(icc.buffer).getUint32(128);
        const tags = Array.from({ length: tagCount }, (_, i) => ascii(icc, 132 + i * 12, 136 + i * 12));
        expect(tags).toEqual(['desc', 'cprt', 'wtpt', 'kTRC']);
        expect(latin1(icc)).toContain(GRAY_PROFILE_DESCRIPTION);
    });

    it('every tag lies inside the file on a 4-byte boundary', () => {
        for (const version of [2, 4] as const) {
            const icc = buildSyntheticGrayProfile({ version });
            const view = new DataView(icc.buffer);
            for (let i = 0; i < view.getUint32(128); i++) {
                const offset = view.getUint32(136 + i * 12);
                const size = view.getUint32(140 + i * 12);
                expect(offset % 4).toBe(0);
                expect(offset + size).toBeLessThanOrEqual(icc.length);
            }
            expect(view.getUint32(0)).toBe(icc.length);
        }
    });

    it('the v4 variant differs only by its version and its mluc text tags', () => {
        const v4 = buildSyntheticGrayProfile({ version: 4 });
        expect([v4[8], v4[9]]).toEqual([0x04, 0x20]);
        expect(ascii(v4, 16, 20)).toBe('GRAY');
        const descOffset = new DataView(v4.buffer).getUint32(136);
        expect(ascii(v4, descOffset, descOffset + 4)).toBe('mluc');
    });

    it('render accepts it as the PDF/A output intent: one component, RGB remapped', async () => {
        const { bytes, stderr } = await renderTo(tmp, MINIMAL_DOC, ['--tagged', 'pdfa2b', '--font', 'latin', '--lang', 'latin', '--output-intent-icc', SYNTHETIC_GRAY_ICC, '--output-intent-id', 'Synthetic Gray', '--no-compress']);
        const raw = latin1(bytes);
        expect(raw).toMatch(/\/N 1\b/);
        expect(raw).toContain('/DefaultRGB');
        expect(raw).toContain('Synthetic Gray');
        expect(stderr).not.toContain('warning: [');
    });
});
