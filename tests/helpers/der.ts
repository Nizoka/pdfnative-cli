/**
 * Minimal DER primitives for the offline mock PKI (tests/helpers/mock-pki.ts).
 *
 * pdfnative's public barrel exports the DER builders the LTV feature itself
 * needs (derSequence, derSetOf, derOid, derInteger, derBitString,
 * derOctetString, derGeneralizedTime, derDecode) — re-exported through the
 * core-bridge. The extra builders required to assemble X.509 certificates and
 * RFC 3161 / OCSP / CRL structures from scratch are internal to the library,
 * so this file re-implements them locally (plain X.690 TLV encoding).
 *
 * TEST HELPER ONLY — never ships in dist.
 */

import { createHash } from 'node:crypto';
import type { Asn1Node } from '../../src/core-bridge/index.js';

// ── ASN.1 universal tags (subset used by the mock PKI) ───────────────

export const ASN1_BOOLEAN = 0x01;
export const ASN1_INTEGER = 0x02;
export const ASN1_OID = 0x06;
export const ASN1_SEQUENCE = 0x30;

// ── Hashes (node:crypto — the CLI is Node-only) ──────────────────────

export function sha256(input: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha256').update(input).digest());
}

export function sha384(input: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha384').update(input).digest());
}

export function sha512(input: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha512').update(input).digest());
}

// ── TLV encoding ─────────────────────────────────────────────────────

function derLength(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    const bytes: number[] = [];
    let v = len;
    while (v > 0) {
        bytes.unshift(v & 0xff);
        v >>>= 8;
    }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concat(arrays: readonly Uint8Array[]): Uint8Array {
    let total = 0;
    for (const a of arrays) total += a.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

/** Encode a TLV with the given tag around already-encoded value bytes. */
export function derWrap(tag: number, value: Uint8Array): Uint8Array {
    return concat([new Uint8Array([tag]), derLength(value.length), value]);
}

/** SET (0x31) preserving child order (DER SET OF sorting is derSetOf's job). */
export function derSet(...children: Uint8Array[]): Uint8Array {
    return derWrap(0x31, concat(children));
}

export function derNull(): Uint8Array {
    return new Uint8Array([0x05, 0x00]);
}

export function derBoolean(value: boolean): Uint8Array {
    return new Uint8Array([0x01, 0x01, value ? 0xff : 0x00]);
}

export function derUtf8String(text: string): Uint8Array {
    return derWrap(0x0c, new TextEncoder().encode(text));
}

/** UTCTime — YYMMDDHHmmssZ (RFC 5280 §4.1.2.5.1). */
export function derUtcTime(date: Date): Uint8Array {
    const pad = (n: number): string => String(n).padStart(2, '0');
    const text = pad(date.getUTCFullYear() % 100)
        + pad(date.getUTCMonth() + 1)
        + pad(date.getUTCDate())
        + pad(date.getUTCHours())
        + pad(date.getUTCMinutes())
        + pad(date.getUTCSeconds())
        + 'Z';
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return derWrap(0x17, bytes);
}

/** Context-specific explicit tag [n] — constructed. */
export function derContextExplicit(tagNum: number, inner: Uint8Array): Uint8Array {
    return derWrap(0xa0 | tagNum, inner);
}

/** Context-specific implicit tag [n] — primitive. */
export function derContextImplicit(tagNum: number, value: Uint8Array): Uint8Array {
    return derWrap(0x80 | tagNum, value);
}

// ── Node helpers (operate on pdfnative's Asn1Node) ───────────────────

/** Raw DER bytes of a decoded child TLV, sliced from the original buffer. */
export function derRawBytes(buf: Uint8Array, node: Asn1Node): Uint8Array {
    return buf.subarray(node.offset, node.offset + node.totalLength);
}

/** INTEGER node → bigint (two's complement). */
export function asn1Integer(node: Asn1Node): bigint {
    if (node.tag !== ASN1_INTEGER) throw new Error(`Expected INTEGER, got tag 0x${node.tag.toString(16)}`);
    const bytes = node.value;
    if (bytes.length === 0) return 0n;
    const isNeg = (bytes[0] & 0x80) !== 0;
    let result = 0n;
    for (const byte of bytes) {
        result = (result << 8n) | BigInt(isNeg ? (~byte & 0xff) : byte);
    }
    return isNeg ? -(result + 1n) : result;
}
