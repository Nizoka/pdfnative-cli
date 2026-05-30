// CMS / PKCS#7 signature-value verification helpers (RFC 5652 §5).
//
// pdfnative v1.1.0 does not (yet) ship a CMS verifier. v0.3.0 of the CLI
// implements signature-value verification locally, on top of pdfnative's
// already-exported primitives:
//   - `derDecode`         — generic ASN.1 DER walker
//   - `rsaVerifyHash`     — RSA PKCS#1 v1.5 verify against a pre-computed hash
//   - `ecdsaVerify`       — ECDSA P-256 verify (hashes the message internally)
//   - `decodeEcPublicKey` — parse 0x04||x||y uncompressed point
//
// Scope:
//   ✔ RSA-SHA-256 and ECDSA-SHA-256 SignerInfo verification
//   ✔ Standard DER re-encoding of `signedAttrs` (replace IMPLICIT [0] tag 0xA0
//     with the explicit SET tag 0x31, RFC 5652 §5.4 — the rest of the encoded
//     bytes is byte-identical)
//   ✔ Recognition of the RFC 3161 `signature-time-stamp-token` unsigned
//     attribute (no TSP signature validation in v0.3.0 — see ROADMAP)
//
// Out of scope (deferred to v0.4.0):
//   ✘ Full RFC 3161 timestamp signature validation
//   ✘ OCSP / CRL revocation
//   ✘ Long-Term Validation (LTV)

import { createHash } from 'node:crypto';
import {
    derDecode,
    rsaVerifyHash,
    ecdsaVerify,
    decodeEcPublicKey,
} from '../core-bridge/index.js';
import type {
    Asn1Node,
    X509Certificate,
} from '../core-bridge/index.js';
import { walkAbs, sliceNode, sliceContent, type AbsNode } from './asn1-walk.js';

// ── OID constants ─────────────────────────────────────────────────────

/** RSA encryption (PKCS#1) — id-rsaEncryption. */
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
/** SHA-256 with RSA encryption — sha256WithRSAEncryption. */
const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
/** SHA-1 with RSA encryption (legacy CRL/OCSP responders). */
const OID_SHA1_RSA = '1.2.840.113549.1.1.5';
/** SHA-384 / SHA-512 with RSA encryption. */
const OID_SHA384_RSA = '1.2.840.113549.1.1.12';
const OID_SHA512_RSA = '1.2.840.113549.1.1.13';
/** ECDSA with SHA-256 — ecdsa-with-SHA256. */
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
/** id-data — ContentInfo content type. */
const OID_DATA = '1.2.840.113549.1.7.1';
/** PKCS#9 message-digest signed attribute. */
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
/** PKCS#9 content-type signed attribute. */
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
/** RFC 3161 — id-aa-signatureTimeStampToken (unsigned attribute). */
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';
/** PKCS#7 SignedData. */
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';

// ── ASN.1 helpers ─────────────────────────────────────────────────────

/** Decode a DER OID node value to dotted-decimal string. Returns null when not OID-shaped. */
export function oidToString(node: Asn1Node): string | null {
    if (node.tag !== 0x06) return null;
    const bytes = node.value;
    if (bytes.length === 0) return null;
    const first = bytes[0] as number;
    const parts: number[] = [Math.floor(first / 40), first % 40];
    let v = 0;
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i] as number;
        v = (v << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            parts.push(v);
            v = 0;
        }
    }
    return parts.join('.');
}

/** Big-endian byte array → BigInt. */
function bytesToBigInt(bytes: Uint8Array): bigint {
    let v = 0n;
    for (let i = 0; i < bytes.length; i++) {
        v = (v << 8n) | BigInt(bytes[i] as number);
    }
    return v;
}

// ── Public key extraction from X509Certificate ────────────────────────

interface RsaPublicKey { readonly n: bigint; readonly e: bigint }

/**
 * Extract an RSA public key from an `X509Certificate`.
 * `cert.publicKeyBytes` carries the BIT STRING content of the cert's
 * SubjectPublicKeyInfo, which for RSA is `SEQUENCE { modulus INTEGER,
 * publicExponent INTEGER }`.
 */
function rsaPubKeyFromCert(cert: X509Certificate): RsaPublicKey {
    const node = derDecode(cert.publicKeyBytes);
    if (node.tag !== 0x30 || node.children.length !== 2) {
        throw new Error('not an RSA public key SEQUENCE');
    }
    const nNode = node.children[0] as Asn1Node;
    const eNode = node.children[1] as Asn1Node;
    if (nNode.tag !== 0x02 || eNode.tag !== 0x02) {
        throw new Error('RSA public key components are not INTEGERs');
    }
    return { n: bytesToBigInt(nNode.value), e: bytesToBigInt(eNode.value) };
}

// ── CMS walker ────────────────────────────────────────────────────────

/** Decode an OID from an `AbsNode` whose tag is OID (0x06). */
function oidFromAbs(buf: Uint8Array, node: AbsNode): string | null {
    if (node.tag !== 0x06) return null;
    const bytes = sliceContent(buf, node);
    if (bytes.length === 0) return null;
    const first = bytes[0] as number;
    const parts: number[] = [Math.floor(first / 40), first % 40];
    let v = 0;
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i] as number;
        v = (v << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            parts.push(v);
            v = 0;
        }
    }
    return parts.join('.');
}

/**
 * Locate the inner `SignedData` SEQUENCE of a CMS `ContentInfo`.
 *
 * ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT ANY }
 * (contentType MUST be id-signedData).
 */
function getSignedData(buf: Uint8Array, root: AbsNode): AbsNode | null {
    if (root.tag !== 0x30 || root.children.length < 2) return null;
    if (oidFromAbs(buf, root.children[0] as AbsNode) !== OID_SIGNED_DATA) return null;
    const explicit = root.children[1] as AbsNode;
    if (explicit.tag !== 0xa0 || explicit.children.length === 0) return null;
    const signedData = explicit.children[0] as AbsNode;
    return signedData.tag === 0x30 ? signedData : null;
}

/**
 * Locate the SignerInfo node inside a parsed CMS ContentInfo.
 *
 * SignedData  ::= SEQUENCE { version, digestAlgorithms SET, encapContentInfo,
 *                            certificates [0] IMPLICIT?, crls [1] IMPLICIT?,
 *                            signerInfos SET OF SignerInfo }
 */
function findSignerInfo(buf: Uint8Array, root: AbsNode): AbsNode | null {
    const signedData = getSignedData(buf, root);
    if (signedData === null) return null;
    // signerInfos is the last SET in SignedData.
    for (let i = signedData.children.length - 1; i >= 0; i--) {
        const child = signedData.children[i] as AbsNode;
        if (child.tag === 0x31 && child.children.length > 0) {
            return child.children[0] as AbsNode;
        }
    }
    return null;
}

// ── SignerInfo destructuring ──────────────────────────────────────────

interface ParsedSignerInfo {
    readonly signedAttrsRaw: Uint8Array | null; // includes [0] IMPLICIT tag header
    readonly signatureAlgorithmOid: string | null;
    readonly signatureValue: Uint8Array | null;
    readonly unsignedAttrsRaw: Uint8Array | null;
}

/**
 * SignerInfo ::= SEQUENCE {
 *   version             CMSVersion,
 *   sid                 SignerIdentifier,
 *   digestAlgorithm     DigestAlgorithmIdentifier,
 *   signedAttrs   [0] IMPLICIT SignedAttributes OPTIONAL,
 *   signatureAlgorithm  SignatureAlgorithmIdentifier,
 *   signature           SignatureValue,
 *   unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL
 * }
 */
function parseSignerInfo(cmsBytes: Uint8Array, signerInfo: AbsNode): ParsedSignerInfo {
    if (signerInfo.tag !== 0x30) {
        return {
            signedAttrsRaw: null,
            signatureAlgorithmOid: null,
            signatureValue: null,
            unsignedAttrsRaw: null,
        };
    }
    let signedAttrsRaw: Uint8Array | null = null;
    let signatureAlgorithmOid: string | null = null;
    let signatureValue: Uint8Array | null = null;
    let unsignedAttrsRaw: Uint8Array | null = null;

    // Walk children left-to-right so we can rely on declaration order.
    let sigAlgSeen = false;
    for (const child of signerInfo.children) {
        if (child.tag === 0xa0) {
            // [0] IMPLICIT signedAttrs — capture raw bytes including header.
            signedAttrsRaw = sliceNode(cmsBytes, child);
        } else if (child.tag === 0xa1) {
            unsignedAttrsRaw = sliceNode(cmsBytes, child);
        } else if (child.tag === 0x30 && !sigAlgSeen) {
            // First plain SEQUENCE we encounter AFTER signedAttrs must be the
            // signatureAlgorithm. (digestAlgorithm appears before signedAttrs.)
            if (signedAttrsRaw !== null) {
                signatureAlgorithmOid = oidFromAbs(cmsBytes, child.children[0] as AbsNode);
                sigAlgSeen = true;
            }
        } else if (child.tag === 0x04 && sigAlgSeen) {
            signatureValue = sliceContent(cmsBytes, child);
        }
    }
    return { signedAttrsRaw, signatureAlgorithmOid, signatureValue, unsignedAttrsRaw };
}

// ── signedAttrs DER re-encoding for hashing (RFC 5652 §5.4) ───────────

/**
 * Replace the leading `[0] IMPLICIT` tag (`0xA0`) of the signedAttrs blob
 * with the explicit `SET OF` tag (`0x31`). The length encoding is
 * unchanged. Returns a NEW byte array (input is never mutated).
 */
export function reencodeSignedAttrsAsSet(signedAttrsRaw: Uint8Array): Uint8Array {
    if (signedAttrsRaw.length === 0 || signedAttrsRaw[0] !== 0xa0) {
        throw new Error('signedAttrs does not start with [0] IMPLICIT tag');
    }
    const out = new Uint8Array(signedAttrsRaw.length);
    out.set(signedAttrsRaw);
    out[0] = 0x31;
    return out;
}

// ── ECDSA signature value parsing ─────────────────────────────────────

/**
 * CMS ECDSA `signatureValue` is a DER-encoded `Ecdsa-Sig-Value
 * SEQUENCE { r INTEGER, s INTEGER }`. Extract `(r, s)` as BigInts.
 */
export function decodeEcdsaSignatureValue(sig: Uint8Array): { r: bigint; s: bigint } {
    const node = derDecode(sig);
    if (node.tag !== 0x30 || node.children.length !== 2) {
        throw new Error('ECDSA signature is not a 2-element SEQUENCE');
    }
    const rNode = node.children[0] as Asn1Node;
    const sNode = node.children[1] as Asn1Node;
    if (rNode.tag !== 0x02 || sNode.tag !== 0x02) {
        throw new Error('ECDSA signature components are not INTEGERs');
    }
    return { r: bytesToBigInt(rNode.value), s: bytesToBigInt(sNode.value) };
}

// ── Timestamp recognition ─────────────────────────────────────────────

/** Scan an UnsignedAttributes node for the RFC 3161 timestamp OID. */
export function hasTimestampToken(unsignedAttrsRaw: Uint8Array | null): boolean {
    if (unsignedAttrsRaw === null) return false;
    let root: Asn1Node;
    try {
        // Re-encode to a SET so derDecode does not refuse the IMPLICIT [1] tag.
        const buf = new Uint8Array(unsignedAttrsRaw);
        buf[0] = 0x31;
        root = derDecode(buf);
    } catch {
        return false;
    }
    for (const attr of root.children) {
        if (attr.children.length > 0) {
            const oid = oidToString(attr.children[0] as Asn1Node);
            if (oid === OID_TIMESTAMP_TOKEN) return true;
        }
    }
    return false;
}

// ── Signature-value verification ──────────────────────────────────────

export interface CmsVerifyResult {
    /** True iff the signature value verifies against the signed attributes. */
    readonly signatureValid: boolean;
    /** Detected algorithm. `null` when unknown / unsupported. */
    readonly algorithm: 'rsa-sha256' | 'ecdsa-sha256' | null;
    /** True when an RFC 3161 timestamp token is present (NOT validated). */
    readonly timestampPresent: boolean;
    /** Human-readable diagnostic for failures or unsupported flows. */
    readonly note: string | null;
}

/**
 * Verify the CMS signature value against the signed attributes for a single
 * SignerInfo, using the leaf certificate's public key.
 *
 * The CLI's [verify command](../commands/verify.ts) is responsible for
 * orchestrating chain + integrity + trust checks; this function ONLY checks
 * the cryptographic signature over `signedAttrs`.
 */
export function verifyCmsSignatureValue(
    cmsBytes: Uint8Array,
    leafCert: X509Certificate,
): CmsVerifyResult {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return {
            signatureValid: false,
            algorithm: null,
            timestampPresent: false,
            note: 'failed to decode CMS DER',
        };
    }
    const signerInfo = findSignerInfo(cmsBytes, root);
    if (signerInfo === null) {
        return {
            signatureValid: false,
            algorithm: null,
            timestampPresent: false,
            note: 'SignerInfo not found in CMS',
        };
    }

    const parsed = parseSignerInfo(cmsBytes, signerInfo);
    const timestampPresent = hasTimestampToken(parsed.unsignedAttrsRaw);

    if (parsed.signedAttrsRaw === null) {
        return {
            signatureValid: false,
            algorithm: null,
            timestampPresent,
            note: 'signedAttrs missing — direct content signing not supported in v0.3.0',
        };
    }
    if (parsed.signatureValue === null) {
        return {
            signatureValid: false,
            algorithm: null,
            timestampPresent,
            note: 'signatureValue missing in SignerInfo',
        };
    }

    let signedAttrsForHash: Uint8Array;
    try {
        signedAttrsForHash = reencodeSignedAttrsAsSet(parsed.signedAttrsRaw);
    } catch (e) {
        return {
            signatureValid: false,
            algorithm: null,
            timestampPresent,
            note: e instanceof Error ? e.message : 'signedAttrs re-encoding failed',
        };
    }

    const oid = parsed.signatureAlgorithmOid;
    if (oid === OID_SHA256_RSA || oid === OID_RSA_ENCRYPTION) {
        let pubKey: RsaPublicKey;
        try {
            pubKey = rsaPubKeyFromCert(leafCert);
        } catch (e) {
            return {
                signatureValid: false,
                algorithm: 'rsa-sha256',
                timestampPresent,
                note: e instanceof Error ? e.message : 'RSA public key extraction failed',
            };
        }
        const hash = createHash('sha256').update(signedAttrsForHash).digest();
        let valid = false;
        try {
            valid = rsaVerifyHash(new Uint8Array(hash), parsed.signatureValue, pubKey);
        } catch (e) {
            return {
                signatureValid: false,
                algorithm: 'rsa-sha256',
                timestampPresent,
                note: e instanceof Error ? e.message : 'RSA verification threw',
            };
        }
        return {
            signatureValid: valid,
            algorithm: 'rsa-sha256',
            timestampPresent,
            note: valid ? null : 'RSA signature value mismatch',
        };
    }

    if (oid === OID_ECDSA_SHA256) {
        // For ECDSA, ecdsaVerify takes the message bytes (it hashes internally).
        let r: bigint;
        let s: bigint;
        try {
            ({ r, s } = decodeEcdsaSignatureValue(parsed.signatureValue));
        } catch (e) {
            return {
                signatureValid: false,
                algorithm: 'ecdsa-sha256',
                timestampPresent,
                note: e instanceof Error ? e.message : 'ECDSA signature decode failed',
            };
        }
        let pubKey;
        try {
            pubKey = decodeEcPublicKey(leafCert.publicKeyBytes);
        } catch (e) {
            return {
                signatureValid: false,
                algorithm: 'ecdsa-sha256',
                timestampPresent,
                note: e instanceof Error ? e.message : 'EC public key extraction failed',
            };
        }
        let valid = false;
        try {
            valid = ecdsaVerify(signedAttrsForHash, r, s, pubKey);
        } catch (e) {
            return {
                signatureValid: false,
                algorithm: 'ecdsa-sha256',
                timestampPresent,
                note: e instanceof Error ? e.message : 'ECDSA verification threw',
            };
        }
        return {
            signatureValid: valid,
            algorithm: 'ecdsa-sha256',
            timestampPresent,
            note: valid ? null : 'ECDSA signature value mismatch',
        };
    }

    return {
        signatureValid: false,
        algorithm: null,
        timestampPresent,
        note: `unsupported signature algorithm OID ${oid ?? '<unknown>'}`,
    };
}

export const __testOnly = {
    OID_DATA,
    OID_MESSAGE_DIGEST,
    OID_CONTENT_TYPE,
    OID_TIMESTAMP_TOKEN,
};

// ──────────────────────────────────────────────────────────────────────
// Generic signed-structure verification (CRL `tbsCertList`, OCSP
// `tbsResponseData`). Reuses the same RSA / ECDSA primitives as the CMS
// SignerInfo verifier.
// ──────────────────────────────────────────────────────────────────────

const RSA_DIGEST_BY_OID: Readonly<Record<string, string>> = {
    [OID_SHA256_RSA]: 'sha256',
    [OID_SHA1_RSA]: 'sha1',
    [OID_SHA384_RSA]: 'sha384',
    [OID_SHA512_RSA]: 'sha512',
};

/**
 * Verify a DER-signed structure (e.g. a CRL `tbsCertList` or an OCSP
 * `tbsResponseData`) against a signer certificate's public key.
 *
 * Supports RSA with SHA-1/256/384/512 and ECDSA-SHA-256. Returns `false`
 * (never throws) for unsupported algorithms or any structural problem.
 */
export function verifySignedStructure(
    tbsBytes: Uint8Array,
    signatureAlgorithmOid: string | null,
    signature: Uint8Array,
    signerCert: X509Certificate,
): boolean {
    if (signatureAlgorithmOid === null) return false;
    try {
        const rsaDigest = RSA_DIGEST_BY_OID[signatureAlgorithmOid];
        if (rsaDigest !== undefined) {
            const pub = rsaPubKeyFromCert(signerCert);
            const hash = new Uint8Array(createHash(rsaDigest).update(tbsBytes).digest());
            return rsaVerifyHash(hash, signature, pub);
        }
        if (signatureAlgorithmOid === OID_ECDSA_SHA256) {
            const { r, s } = decodeEcdsaSignatureValue(signature);
            const pub = decodeEcPublicKey(signerCert.publicKeyBytes);
            return ecdsaVerify(tbsBytes, r, s, pub);
        }
    } catch {
        return false;
    }
    return false;
}

// ──────────────────────────────────────────────────────────────────────
// Shared CMS extraction helpers
//
// Re-used by the `verify` command, the RFC 3161 timestamp verifier
// (timestamp-verify.ts) and the revocation checker (revocation.ts). Each
// returns `null` / `[]` on any structural problem — callers decide how to
// report. None of these throw on malformed input.
// ──────────────────────────────────────────────────────────────────────

/** Decode a DER OID node (absolute-offset) to dotted-decimal, or null. */
export function decodeOid(buf: Uint8Array, node: AbsNode): string | null {
    return oidFromAbs(buf, node);
}

/** Extract every embedded X.509 certificate DER block from a CMS SignedData. */
export function extractCmsCertificates(cmsBytes: Uint8Array): Uint8Array[] {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return [];
    }
    const signedData = getSignedData(cmsBytes, root);
    if (signedData === null) return [];
    for (const child of signedData.children) {
        if (child.tag === 0xa0) {
            // certificates [0] IMPLICIT — children are SEQUENCEs (one per cert).
            const out: Uint8Array[] = [];
            for (const certNode of child.children) {
                if (certNode.tag === 0x30) out.push(sliceNode(cmsBytes, certNode));
            }
            return out;
        }
    }
    return [];
}

/** Extract every embedded CRL DER block from a CMS SignedData (`crls [1]`). */
export function extractCmsCrls(cmsBytes: Uint8Array): Uint8Array[] {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return [];
    }
    const signedData = getSignedData(cmsBytes, root);
    if (signedData === null) return [];
    for (const child of signedData.children) {
        if (child.tag === 0xa1) {
            // crls [1] IMPLICIT — children are CertificateList SEQUENCEs.
            const out: Uint8Array[] = [];
            for (const crlNode of child.children) {
                if (crlNode.tag === 0x30) out.push(sliceNode(cmsBytes, crlNode));
            }
            return out;
        }
    }
    return [];
}

/**
 * Extract the document SignerInfo's `signatureValue` OCTET STRING content.
 * This is the value an RFC 3161 timestamp's `messageImprint` is taken over.
 */
export function extractSignerSignatureValue(cmsBytes: Uint8Array): Uint8Array | null {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return null;
    }
    const signerInfo = findSignerInfo(cmsBytes, root);
    if (signerInfo === null) return null;
    return parseSignerInfo(cmsBytes, signerInfo).signatureValue;
}

/** Extract the raw `[1] IMPLICIT unsignedAttrs` blob (header included), or null. */
export function extractUnsignedAttrs(cmsBytes: Uint8Array): Uint8Array | null {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return null;
    }
    const signerInfo = findSignerInfo(cmsBytes, root);
    if (signerInfo === null) return null;
    return parseSignerInfo(cmsBytes, signerInfo).unsignedAttrsRaw;
}

/**
 * Extract the value of the SignerInfo `messageDigest` signed attribute
 * (PKCS#9 OID 1.2.840.113549.1.9.4), or null when absent.
 */
export function extractSignedMessageDigest(cmsBytes: Uint8Array): Uint8Array | null {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return null;
    }
    const signerInfo = findSignerInfo(cmsBytes, root);
    if (signerInfo === null) return null;
    const signedAttrsRaw = parseSignerInfo(cmsBytes, signerInfo).signedAttrsRaw;
    if (signedAttrsRaw === null) return null;
    let attrsSet: AbsNode;
    try {
        // Re-tag [0] IMPLICIT → SET (0x31) so the walker treats it uniformly.
        const buf = new Uint8Array(signedAttrsRaw);
        buf[0] = 0x31;
        attrsSet = walkAbs(buf);
        for (const attr of attrsSet.children) {
            if (attr.children.length < 2) continue;
            if (oidFromAbs(buf, attr.children[0] as AbsNode) !== OID_MESSAGE_DIGEST) continue;
            const valueSet = attr.children[1] as AbsNode;
            if (valueSet.children.length === 0) return null;
            const oct = valueSet.children[0] as AbsNode;
            if (oct.tag !== 0x04) return null;
            return sliceContent(buf, oct);
        }
    } catch {
        return null;
    }
    return null;
}

/** Encapsulated content of a CMS SignedData (`eContentType` + `eContent` bytes). */
export interface EncapsulatedContent {
    readonly contentType: string | null;
    readonly content: Uint8Array;
}

/**
 * Extract the encapsulated content (`eContentType`, `eContent`) of a CMS
 * SignedData. For an RFC 3161 token the content is the DER-encoded TSTInfo.
 */
export function extractEContent(cmsBytes: Uint8Array): EncapsulatedContent | null {
    let root: AbsNode;
    try {
        root = walkAbs(cmsBytes);
    } catch {
        return null;
    }
    const signedData = getSignedData(cmsBytes, root);
    if (signedData === null) return null;
    // encapContentInfo is the first plain SEQUENCE child (after version INTEGER
    // and digestAlgorithms SET).
    for (const child of signedData.children) {
        if (child.tag !== 0x30) continue;
        if (child.children.length < 1) return null;
        const oid = oidFromAbs(cmsBytes, child.children[0] as AbsNode);
        // eContent is wrapped in [0] EXPLICIT containing an OCTET STRING.
        if (child.children.length >= 2) {
            const explicit = child.children[1] as AbsNode;
            if (explicit.tag === 0xa0 && explicit.children.length > 0) {
                const oct = explicit.children[0] as AbsNode;
                if (oct.tag === 0x04) {
                    return { contentType: oid, content: sliceContent(cmsBytes, oct) };
                }
            }
        }
        return { contentType: oid, content: new Uint8Array(0) };
    }
    return null;
}
