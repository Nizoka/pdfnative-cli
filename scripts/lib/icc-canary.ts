/**
 * ICC header canary — for the conformance corpus and tests only
 * ==============================================================
 * pdfnative 1.9.0 ships the synthetic Gray and CMYK `prtr` profiles on
 * `pdfnative/tools` (`buildSyntheticGrayProfile`, `buildSyntheticCmykProfile`),
 * so the CLI no longer carries a generator of its own. What the engine does
 * not build is the ICC v4 variant the PDF/A-1 canary needs: ISO 19005-1
 * §6.2.2 refuses a v4 profile (`PDFA_ICC_PROFILE_VERSION`), and the engine
 * reads the major version from header byte 8 only. This patches that byte
 * (and the minor at byte 9) on a copy of a v2 profile — the same trick the
 * test harness uses for its `v4Icc` fixture. The result is never committed.
 */

/** A copy of `profile` whose header declares ICC major version `major` (minor 2.0, BCD). */
export function withIccMajorVersion(profile: Uint8Array, major: 2 | 4): Uint8Array {
    if (profile.length < 128) throw new Error('withIccMajorVersion: not an ICC profile (header shorter than 128 bytes)');
    const out = new Uint8Array(profile);
    out[8] = major;
    out[9] = major === 4 ? 0x20 : 0x10;
    return out;
}
