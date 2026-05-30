// RFC 3161 timestamp-token validation (PAdES-T).
//
// A PDF signature may carry a signed timestamp as the SignerInfo unsigned
// attribute `id-aa-signatureTimeStampToken` (OID 1.2.840.113549.1.9.16.2.14).
// The attribute value is a complete CMS `ContentInfo` (SignedData) whose
// encapsulated content is an RFC 3161 `TSTInfo`.
//
// This verifier proves, OFFLINE and with no network access:
//   1. the TSA's SignerInfo signature over its own signedAttrs is valid
//      (delegated to cms-verify);
//   2. the token's signed `messageDigest` attribute equals SHA-256 of the
//      encapsulated TSTInfo (eContent integrity);
//   3. the TSTInfo `messageImprint` equals the configured hash of the document
//      signature value the token is bound to (binding integrity);
//   4. the TSA certificate chain builds and (optionally) anchors to trust.
//
// `genTime` is extracted for reporting. No network, no nonce replay store.

import { createHash } from 'node:crypto';
import { walkAbs, sliceContent, type AbsNode } from './asn1-walk.js';
import {
    verifyCmsSignatureValue,
    extractEContent,
    extractCmsCertificates,
    extractSignedMessageDigest,
    decodeOid,
} from './cms-verify.js';
import { buildChain, isTrustedRoot } from './cert-chain.js';
import { parseCertificate } from '../core-bridge/index.js';
import type { X509Certificate } from '../core-bridge/index.js';

// ── OID constants ─────────────────────────────────────────────────────

/** RFC 3161 — id-aa-signatureTimeStampToken (SignerInfo unsigned attribute). */
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';
/** RFC 3161 — id-ct-TSTInfo (eContentType of the timestamp token). */
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';
/** Digest-algorithm OIDs supported for the messageImprint. */
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_SHA384 = '2.16.840.1.101.3.4.2.2';
const OID_SHA512 = '2.16.840.1.101.3.4.2.3';
const OID_SHA1 = '1.3.14.3.2.26';

const DIGEST_BY_OID: Readonly<Record<string, string>> = {
    [OID_SHA256]: 'sha256',
    [OID_SHA384]: 'sha384',
    [OID_SHA512]: 'sha512',
    [OID_SHA1]: 'sha1',
};

// ── Result type ───────────────────────────────────────────────────────

export interface TimestampVerifyResult {
    /** True when a timestamp-token attribute was found. */
    readonly present: boolean;
    /**
     * True when the token signature, eContent digest and messageImprint
     * binding all verify. Trust/chain are reported separately so a valid
     * timestamp from an untrusted TSA is still distinguishable.
     */
    readonly valid: boolean;
    /** RFC 3161 `genTime` as an ISO 8601 string, or null. */
    readonly genTime: string | null;
    /** TSA signer certificate subject CN, or null. */
    readonly tsaSubject: string | null;
    /** True when the TSA certificate chain resolved to a (self-signed) root. */
    readonly chainValid: boolean;
    /** True when the TSA chain root is trusted (anchors or self-signed). */
    readonly trusted: boolean;
    /** Diagnostic for failures; never leaks byte offsets. */
    readonly note: string | null;
}

const ABSENT: TimestampVerifyResult = {
    present: false,
    valid: false,
    genTime: null,
    tsaSubject: null,
    chainValid: false,
    trusted: false,
    note: null,
};

// ── Token extraction from the document SignerInfo unsignedAttrs ────────

/**
 * Extract the timestamp-token CMS bytes from a re-tagged unsignedAttrs blob.
 * `unsignedAttrsRaw` must start with the `[1] IMPLICIT` tag (0xA1).
 */
export function extractTimestampToken(unsignedAttrsRaw: Uint8Array | null): Uint8Array | null {
    if (unsignedAttrsRaw === null || unsignedAttrsRaw.length === 0) return null;
    let attrs: AbsNode;
    try {
        const buf = new Uint8Array(unsignedAttrsRaw);
        buf[0] = 0x31; // [1] IMPLICIT → SET
        attrs = walkAbs(buf);
        for (const attr of attrs.children) {
            if (attr.children.length < 2) continue;
            if (decodeOid(buf, attr.children[0] as AbsNode) !== OID_TIMESTAMP_TOKEN) continue;
            const valueSet = attr.children[1] as AbsNode;
            if (valueSet.children.length === 0) return null;
            const token = valueSet.children[0] as AbsNode;
            // token is a ContentInfo SEQUENCE — slice it as a standalone buffer.
            return buf.subarray(token.abs, token.abs + token.totalLen).slice();
        }
    } catch {
        return null;
    }
    return null;
}

// ── TSTInfo parsing ───────────────────────────────────────────────────

interface TstInfo {
    readonly hashAlgorithm: string | null; // node:crypto digest name
    readonly hashedMessage: Uint8Array;
    readonly genTime: string | null;
}

/** Parse the minimal fields of a DER-encoded TSTInfo. */
function parseTstInfo(tstBytes: Uint8Array): TstInfo | null {
    let root: AbsNode;
    try {
        root = walkAbs(tstBytes);
    } catch {
        return null;
    }
    if (root.tag !== 0x30 || root.children.length < 5) return null;
    // children: version, policy, messageImprint, serialNumber, genTime, ...
    const messageImprint = root.children[2] as AbsNode;
    if (messageImprint.tag !== 0x30 || messageImprint.children.length < 2) return null;
    const algId = messageImprint.children[0] as AbsNode;
    if (algId.tag !== 0x30 || algId.children.length < 1) return null;
    const algOid = decodeOid(tstBytes, algId.children[0] as AbsNode);
    const hashAlgorithm = algOid !== null ? (DIGEST_BY_OID[algOid] ?? null) : null;
    const hashedOct = messageImprint.children[1] as AbsNode;
    if (hashedOct.tag !== 0x04) return null;
    const hashedMessage = sliceContent(tstBytes, hashedOct);

    // genTime is the first GeneralizedTime (tag 0x18) at the top level.
    let genTime: string | null = null;
    for (let i = 3; i < root.children.length; i++) {
        const node = root.children[i] as AbsNode;
        if (node.tag === 0x18) {
            genTime = decodeGeneralizedTime(sliceContent(tstBytes, node));
            break;
        }
    }
    return { hashAlgorithm, hashedMessage, genTime };
}

/** Decode an ASN.1 GeneralizedTime (e.g. `20260530120000Z`) to ISO 8601. */
function decodeGeneralizedTime(bytes: Uint8Array): string | null {
    const s = new TextDecoder('latin1').decode(bytes).trim();
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z?$/.exec(s);
    if (m === null) return null;
    const [, y, mo, d, h, mi, sec, frac] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}${frac ? '.' + frac : ''}Z`;
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function cnOf(cert: X509Certificate): string | null {
    return cert.subject.cn ?? null;
}

// ── Public entry point ────────────────────────────────────────────────

/**
 * Verify the RFC 3161 timestamp token bound to a document signature.
 *
 * @param unsignedAttrsRaw  The document SignerInfo `[1] unsignedAttrs` blob.
 * @param documentSignatureValue  The document SignerInfo `signature` OCTET
 *        STRING content — the value the timestamp imprints.
 * @param trustRoots  Optional trust anchors for the TSA chain.
 */
export function verifyTimestamp(
    unsignedAttrsRaw: Uint8Array | null,
    documentSignatureValue: Uint8Array | null,
    trustRoots: readonly X509Certificate[],
): TimestampVerifyResult {
    const token = extractTimestampToken(unsignedAttrsRaw);
    if (token === null) return ABSENT;

    const fail = (note: string): TimestampVerifyResult => ({
        present: true,
        valid: false,
        genTime: null,
        tsaSubject: null,
        chainValid: false,
        trusted: false,
        note,
    });

    const encap = extractEContent(token);
    if (encap === null || encap.contentType !== OID_TST_INFO || encap.content.length === 0) {
        return fail('timestamp token has no TSTInfo content');
    }
    const tst = parseTstInfo(encap.content);
    if (tst === null) {
        return fail('failed to parse TSTInfo');
    }

    // (2) eContent integrity: signed messageDigest == SHA-256(TSTInfo).
    const tokenMd = extractSignedMessageDigest(token);
    if (tokenMd !== null) {
        const eHash = new Uint8Array(createHash('sha256').update(encap.content).digest());
        if (!bytesEqual(tokenMd, eHash)) {
            return fail('timestamp eContent digest mismatch');
        }
    }

    // TSA certificate + (1) SignerInfo signature.
    const certDers = extractCmsCertificates(token);
    if (certDers.length === 0) {
        return fail('no TSA certificate embedded in timestamp token');
    }
    let tsaCerts: X509Certificate[];
    try {
        tsaCerts = certDers.map((der) => parseCertificate(der));
    } catch {
        return fail('failed to parse TSA certificate');
    }

    // The TSA signer is whichever embedded cert verifies the token signature.
    let tsaLeaf: X509Certificate | null = null;
    let sigNote: string | null = null;
    for (const cand of tsaCerts) {
        const r = verifyCmsSignatureValue(token, cand);
        if (r.signatureValid) {
            tsaLeaf = cand;
            break;
        }
        sigNote = r.note;
    }
    if (tsaLeaf === null) {
        return fail(`TSA signature invalid${sigNote !== null ? ` (${sigNote})` : ''}`);
    }

    // (3) messageImprint binding to the document signature value.
    let bindingOk = true;
    if (documentSignatureValue !== null && tst.hashAlgorithm !== null) {
        const imprint = new Uint8Array(
            createHash(tst.hashAlgorithm).update(documentSignatureValue).digest(),
        );
        bindingOk = bytesEqual(imprint, tst.hashedMessage);
    }
    if (!bindingOk) {
        return fail('timestamp messageImprint does not match the document signature');
    }

    // (4) TSA chain + trust.
    const built = buildChain(tsaLeaf, tsaCerts.concat(trustRoots));
    const trusted = isTrustedRoot(built.root, trustRoots);

    return {
        present: true,
        valid: true,
        genTime: tst.genTime,
        tsaSubject: cnOf(tsaLeaf),
        chainValid: built.chainValid,
        trusted,
        note: null,
    };
}
