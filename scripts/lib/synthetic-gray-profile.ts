/**
 * Synthetic Gray output profile — for samples and tests only
 * ==========================================================
 * pdfnative 1.8.0 accepts RGB, CMYK and Gray output intents, and ships a
 * synthetic CMYK profile only (`docs/assets/synthetic-cmyk.icc`, copied to
 * `tests/fixtures/` and `samples/render/print/`). This builds its monochrome
 * twin: a small ICC output profile (`prtr`, `GRAY` data, XYZ connection
 * space) carrying the four tags a monochrome output profile requires —
 * `desc`, `cprt`, `wtpt` and the gray tone curve `kTRC` (gamma 2.2).
 *
 * Why the CLI needs it: a Gray `prtr` profile is the only way to exercise,
 * through the command line, (1) the Gray OutputIntent (`/N 1`), and (2) the
 * `PDFX_DEVICE_CMYK` diagnostic, which fires on CMYK content under a PDF/X
 * claim whose intent is NOT CMYK.
 *
 * It characterises no printing condition. Do not use it for real print:
 * supply the profile your printer names.
 *
 * `version: 4` writes the same profile as ICC v4.2 (`mluc` text tags). It is
 * never committed: the conformance corpus writes it to prove that PDF/A-1
 * refuses a v4 profile (`PDFA_ICC_PROFILE_VERSION`, ISO 19005-1 §6.2.2).
 *
 * Deterministic: the same bytes on every run. The shape follows pdfnative's
 * `scripts/lib/synthetic-cmyk-profile.ts` (not shipped in the npm package).
 *
 *   npx tsx scripts/lib/synthetic-gray-profile.ts   # rewrites both committed copies
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Growable big-endian byte writer. */
class Bytes {
    private readonly parts: number[] = [];
    get length(): number { return this.parts.length; }
    u8(v: number): this { this.parts.push(v & 0xFF); return this; }
    u16(v: number): this { return this.u8(v >> 8).u8(v); }
    u32(v: number): this { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); }
    s15f16(v: number): this { return this.u32(Math.round(v * 65536) >>> 0); }
    sig(s: string): this { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
    zeros(n: number): this { for (let i = 0; i < n; i++) this.u8(0); return this; }
    ascii(s: string): this { for (const ch of s) this.u8(ch.charCodeAt(0)); return this; }
    bytes(b: readonly number[]): this { for (const v of b) this.u8(v); return this; }
    pad4(): this { while (this.parts.length % 4) this.u8(0); return this; }
    toArray(): number[] { return this.parts; }
}

const D50 = [0.9642, 1.0, 0.8249] as const;
export const GRAY_PROFILE_DESCRIPTION = 'pdfnative synthetic Gray (samples only, not a press condition)';
const COPYRIGHT = 'No copyright, use freely';

/** ICC v2 textDescriptionType: ASCII, then empty Unicode and ScriptCode records. */
function textDescription(text: string): number[] {
    return new Bytes().sig('desc').zeros(4).u32(text.length + 1).ascii(text).u8(0)
        .u32(0).u32(0).u16(0).u8(0).zeros(67).toArray();
}

/** ICC v4 multiLocalizedUnicodeType with one en-US record (UTF-16BE). */
function multiLocalized(text: string): number[] {
    const w = new Bytes().sig('mluc').zeros(4).u32(1).u32(12).ascii('enUS').u32(text.length * 2).u32(28);
    for (const ch of text) w.u16(ch.charCodeAt(0));
    return w.toArray();
}

export interface GrayProfileOptions {
    /** ICC major version: 2 (the committed fixture, v2.1) or 4 (v4.2, corpus canary only). */
    readonly version?: 2 | 4;
}

/**
 * Build the synthetic Gray output profile.
 *
 * @returns ICC profile bytes (408 bytes for v2).
 */
export function buildSyntheticGrayProfile(opts: GrayProfileOptions = {}): Uint8Array {
    const v4 = opts.version === 4;
    const tags: [string, number[]][] = [
        ['desc', v4 ? multiLocalized(GRAY_PROFILE_DESCRIPTION) : textDescription(GRAY_PROFILE_DESCRIPTION)],
        ['cprt', v4 ? multiLocalized(COPYRIGHT) : new Bytes().sig('text').zeros(4).ascii(COPYRIGHT).u8(0).toArray()],
        ['wtpt', new Bytes().sig('XYZ ').zeros(4).s15f16(D50[0]).s15f16(D50[1]).s15f16(D50[2]).toArray()],
        // curveType with one entry: a u8Fixed8 gamma (2.2 → 0x0233).
        ['kTRC', new Bytes().sig('curv').zeros(4).u32(1).u16(0x0233).toArray()],
    ];

    const tableSize = 4 + tags.length * 12;
    const base = 128 + tableSize;
    const table = new Bytes().u32(tags.length);
    const data = new Bytes();
    for (const [sig, body] of tags) {
        data.pad4();
        table.sig(sig).u32(base + data.length).u32(body.length);
        data.bytes(body);
    }
    data.pad4();
    const size = base + data.length;

    const header = new Bytes()
        .u32(size).zeros(4).u32(v4 ? 0x04200000 : 0x02100000).sig('prtr').sig('GRAY').sig('XYZ ')
        .u16(2026).u16(1).u16(1).u16(0).u16(0).u16(0)
        .sig('acsp').zeros(4).u32(0).zeros(4).zeros(4).zeros(8).u32(0)
        .s15f16(D50[0]).s15f16(D50[1]).s15f16(D50[2])
        .zeros(4).zeros(44);

    return new Uint8Array([...header.toArray(), ...table.toArray(), ...data.toArray()]);
}

/** The two committed copies, repository-relative. */
export const GRAY_PROFILE_COPIES = ['tests/fixtures/synthetic-gray.icc', 'samples/render/print/synthetic-gray.icc'] as const;

// Windows reports the drive letter in either case.
const self = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
    const root = join(self, '..', '..', '..');
    const bytes = buildSyntheticGrayProfile();
    for (const rel of GRAY_PROFILE_COPIES) writeFileSync(join(root, rel), bytes);
    process.stdout.write(`synthetic-gray-profile: ${bytes.length} bytes → ${GRAY_PROFILE_COPIES.join(', ')}\n`);
}
