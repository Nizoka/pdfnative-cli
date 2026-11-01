// The synthetic ICC profiles the tests, the conformance corpus and the samples
// rely on come from the engine since pdfnative 1.9.0 (`pdfnative/tools`
// buildSyntheticGrayProfile / buildSyntheticCmykProfile, #86): the committed
// copies are those builders' output byte for byte, the engine accepts the Gray
// one as a PDF/A output intent, and the ICC v4 canary of the PDF/A-1 corpus
// entry is a header patch over the Gray profile (scripts/lib/icc-canary.ts).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSyntheticGrayProfile, buildSyntheticCmykProfile } from '../../src/core-bridge/index.js';
import { withIccMajorVersion } from '../../scripts/lib/icc-canary.js';
import { TempFiles, MINIMAL_DOC, SYNTHETIC_GRAY_ICC, SYNTHETIC_CMYK_ICC, renderTo, renderJson, diagnosticCodes, latin1 } from '../helpers/cli-harness.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const tmp = new TempFiles();
afterEach(() => tmp.cleanup());

const ascii = (b: Uint8Array, from: number, to: number): string => Buffer.from(b.subarray(from, to)).toString('latin1');

/** The committed copies of each profile, repository-relative. */
const COPIES = {
    gray: ['tests/fixtures/synthetic-gray.icc', 'samples/render/print/synthetic-gray.icc'],
    cmyk: ['tests/fixtures/synthetic-cmyk.icc', 'samples/render/print/synthetic-cmyk.icc'],
} as const;

describe('synthetic ICC profiles (pdfnative/tools, 1.9.0)', () => {
    it('the committed Gray and CMYK copies are the engine builders\' output, byte for byte', () => {
        const gray = Buffer.from(buildSyntheticGrayProfile());
        const cmyk = Buffer.from(buildSyntheticCmykProfile());
        for (const rel of COPIES.gray) expect(readFileSync(resolve(ROOT, rel)).equals(gray), rel).toBe(true);
        for (const rel of COPIES.cmyk) expect(readFileSync(resolve(ROOT, rel)).equals(cmyk), rel).toBe(true);
        expect(Buffer.from(buildSyntheticGrayProfile()).equals(gray), 'deterministic').toBe(true);
    });

    it('is an ICC v2.1 monochrome output profile whose size field matches its length', () => {
        const icc = buildSyntheticGrayProfile();
        expect(icc.length).toBe(408);
        expect(new DataView(icc.buffer, icc.byteOffset, icc.byteLength).getUint32(0)).toBe(icc.length);
        expect([icc[8], icc[9]]).toEqual([0x02, 0x10]);
        expect(ascii(icc, 12, 16)).toBe('prtr');
        expect(ascii(icc, 16, 20)).toBe('GRAY');
        expect(ascii(icc, 36, 40)).toBe('acsp');
        const cmyk = buildSyntheticCmykProfile();
        expect(ascii(cmyk, 12, 16)).toBe('prtr');
        expect(ascii(cmyk, 16, 20)).toBe('CMYK');
    });

    it('the v4 canary differs from the Gray profile in its two version bytes only, and PDF/A-1 refuses it', async () => {
        const v2 = buildSyntheticGrayProfile();
        const v4 = withIccMajorVersion(v2, 4);
        expect(v4.length).toBe(v2.length);
        expect([v4[8], v4[9]]).toEqual([0x04, 0x20]);
        expect(v4.subarray(10).every((b, i) => b === v2[i + 10])).toBe(true);
        expect(withIccMajorVersion(v4, 2)).toEqual(v2);
        const icc = await tmp.bytes('gray-v4.icc', v4);
        const { envelope } = await renderJson(tmp, MINIMAL_DOC, ['--tagged', 'pdfa1b', '--font', 'latin', '--lang', 'latin', '--output-intent-icc', icc]);
        expect(diagnosticCodes(envelope)).toEqual(['PDFA_ICC_PROFILE_VERSION']);
        expect(() => withIccMajorVersion(new Uint8Array(16), 4)).toThrow(/not an ICC profile/);
    });

    it('render accepts the Gray profile as the PDF/A output intent: one component, RGB remapped', async () => {
        const { bytes, stderr } = await renderTo(tmp, MINIMAL_DOC, ['--tagged', 'pdfa2b', '--font', 'latin', '--lang', 'latin', '--output-intent-icc', SYNTHETIC_GRAY_ICC, '--output-intent-id', 'Synthetic Gray', '--no-compress']);
        const raw = latin1(bytes);
        expect(raw).toMatch(/\/N 1\b/);
        expect(raw).toContain('/DefaultRGB');
        expect(raw).toContain('Synthetic Gray');
        expect(stderr).not.toContain('warning: [');
    });

    it('the CMYK profile is the PDF/X-4 output intent of the corpus: four components', async () => {
        const { bytes } = await renderTo(tmp, { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } }, ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--trapped', 'false', '--font', 'latin', '--lang', 'latin', '--no-compress']);
        expect(latin1(bytes)).toMatch(/\/N 4\b/);
    });
});
