// RFC 3161 weak-digest detection (v1.5.0, ROADMAP "verify — weak-digest note").
//
// The CLI's `sign --timestamp-digest` never emits SHA-1, so a token with a
// SHA-1 messageImprint is crafted here: a TimeStampReq with the SHA-1 OID is
// sent to the in-process mock TSA (which echoes the imprint verbatim), and
// the resulting token is fed to both verifiers. The `verify` command turns
// `imprintAlgorithm === 'sha1'` into a note and, under --strict, a failure.

import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { verifyTimestamp, verifyDocTimestamp } from '../../src/utils/timestamp-verify.js';
import { derSequence, derSetOf, derOid, derInteger, derOctetString, derDecode, ensureCryptoReady } from '../../src/core-bridge/index.js';
import { createMockPki, createMockTimestampProvider } from '../helpers/mock-pki.js';
import { derNull, derBoolean, derSet, derRawBytes } from '../helpers/der.js';

/** 1.3.14.3.2.26 (SHA-1) as raw OID content bytes. */
const OID_SHA1 = new Uint8Array([0x2b, 0x0e, 0x03, 0x02, 0x1a]);
/** 2.16.840.1.101.3.4.2.1 (SHA-256). */
const OID_SHA256 = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
/** id-aa-signatureTimeStampToken 1.2.840.113549.1.9.16.2.14. */
const OID_TIMESTAMP_TOKEN = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x02, 0x0e]);

const sha1 = (b: Uint8Array): Uint8Array => new Uint8Array(createHash('sha1').update(b).digest());
const sha256 = (b: Uint8Array): Uint8Array => new Uint8Array(createHash('sha256').update(b).digest());

async function tokenFor(imprintOid: Uint8Array, hashed: Uint8Array): Promise<Uint8Array> {
    const provider = createMockTimestampProvider(createMockPki());
    const request = derSequence(
        derInteger(1n),
        derSequence(derSequence(derOid(imprintOid), derNull()), derOctetString(hashed)),
        derBoolean(true), // certReq: embed the TSA certificate
    );
    const response = await provider.getTimestamp(request);
    const parsed = derDecode(response);
    return derRawBytes(response, parsed.children[1]);
}

/** `[1] IMPLICIT SET OF Attribute` holding the token, as a document SignerInfo carries it. */
function unsignedAttrsWith(token: Uint8Array): Uint8Array {
    const attrs = new Uint8Array(derSetOf(derSequence(derOid(OID_TIMESTAMP_TOKEN), derSet(token))));
    attrs[0] = 0xa1;
    return attrs;
}

describe('verifyTimestamp: imprintAlgorithm', () => {
    beforeAll(() => ensureCryptoReady());

    it('reports sha1 for a SHA-1 messageImprint (and still verifies the binding)', async () => {
        const sigValue = new TextEncoder().encode('document signature value');
        const token = await tokenFor(OID_SHA1, sha1(sigValue));
        const result = verifyTimestamp(unsignedAttrsWith(token), sigValue, []);
        expect(result.present).toBe(true);
        expect(result.imprintAlgorithm).toBe('sha1');
        expect(result.valid).toBe(true);
    });

    it('reports sha256 for the CLI\'s default imprint', async () => {
        const sigValue = new TextEncoder().encode('document signature value');
        const token = await tokenFor(OID_SHA256, sha256(sigValue));
        const result = verifyTimestamp(unsignedAttrsWith(token), sigValue, []);
        expect(result.imprintAlgorithm).toBe('sha256');
        expect(result.valid).toBe(true);
    });

    it('is null when no token is present', () => {
        expect(verifyTimestamp(null, null, []).imprintAlgorithm).toBeNull();
    });
});

describe('verifyDocTimestamp: imprintAlgorithm', () => {
    beforeAll(() => ensureCryptoReady());

    it('reports sha1 for a /DocTimeStamp token whose imprint is SHA-1 over the byte range', async () => {
        const pdf = new TextEncoder().encode('%PDF-1.7 fake body <<CONTENTS>> trailer');
        const byteRange: readonly [number, number, number, number] = [0, 17, 29, pdf.length - 29];
        const covered = new Uint8Array([...pdf.subarray(0, 17), ...pdf.subarray(29)]);
        const token = await tokenFor(OID_SHA1, sha1(covered));
        const result = verifyDocTimestamp(token, pdf, byteRange, []);
        expect(result.imprintAlgorithm).toBe('sha1');
        expect(result.imprintValid).toBe(true);
        expect(result.valid).toBe(true);
    });
});
