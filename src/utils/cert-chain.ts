// X.509 certificate-chain construction and trust evaluation.
//
// Shared by the `verify` command, the RFC 3161 timestamp verifier
// (timestamp-verify.ts) and the revocation checker (revocation.ts). All
// signature math is delegated to pdfnative's `verifyCertSignature` /
// `isSelfSigned`; this module only walks the parent links.

import { verifyCertSignature, isSelfSigned } from '../core-bridge/index.js';
import type { X509Certificate } from '../core-bridge/index.js';

/** Byte-exact certificate equality (DER comparison). */
export function certEquals(a: X509Certificate, b: X509Certificate): boolean {
    if (a.raw.length !== b.raw.length) return false;
    for (let i = 0; i < a.raw.length; i++) {
        if (a.raw[i] !== b.raw[i]) return false;
    }
    return true;
}

/** Find a certificate in `candidates` that signed `cert` (i.e. its issuer). */
export function findChainParent(
    cert: X509Certificate,
    candidates: readonly X509Certificate[],
): X509Certificate | undefined {
    for (const c of candidates) {
        if (certEquals(c, cert)) continue;
        try {
            if (verifyCertSignature(cert, c)) return c;
        } catch {
            // ignore — try next candidate
        }
    }
    return undefined;
}

export interface BuiltChain {
    /** Ordered chain from leaf → … → root. */
    readonly chain: readonly X509Certificate[];
    /** True when every intermediate link resolved to a verified parent. */
    readonly chainValid: boolean;
    /** The terminal certificate (self-signed root, or the last link found). */
    readonly root: X509Certificate;
}

/**
 * Build a certificate chain from `leaf`, drawing parents from `pool`
 * (embedded certs + trust anchors). Stops at a self-signed certificate or
 * when no verified parent is found. Cycle-safe.
 */
export function buildChain(
    leaf: X509Certificate,
    pool: readonly X509Certificate[],
): BuiltChain {
    const chain: X509Certificate[] = [leaf];
    let current = leaf;
    let chainValid = true;
    const seen: X509Certificate[] = [leaf];
    while (!isSelfSigned(current)) {
        const parent = findChainParent(current, pool);
        if (parent === undefined || seen.some((c) => certEquals(c, parent))) {
            chainValid = false;
            break;
        }
        chain.push(parent);
        seen.push(parent);
        current = parent;
    }
    return { chain, chainValid, root: current };
}

/**
 * Evaluate whether a built chain's root is trusted.
 *
 * When `trustRoots` is empty, a self-signed root is accepted (the historical
 * CLI behaviour, surfaced as a note by callers). Otherwise the root must be
 * byte-equal to one of the provided anchors.
 */
export function isTrustedRoot(
    root: X509Certificate,
    trustRoots: readonly X509Certificate[],
): boolean {
    if (trustRoots.length === 0) return isSelfSigned(root);
    return trustRoots.some((t) => certEquals(t, root));
}
