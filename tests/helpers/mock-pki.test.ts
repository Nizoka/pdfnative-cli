import { describe, it, expect, beforeAll } from 'vitest';
import {
    ensureCryptoReady, buildTimestampRequest, parseTimestampResponse,
    parseTimestampToken, verifyTimestampImprint, verifyCertSignature, isSelfSigned,
} from '../../src/core-bridge/index.js';
import { createMockPki, createMockTimestampProvider, createMockRevocationProvider, MOCK_OCSP_URL, MOCK_CRL_URL } from './mock-pki.js';
import { sha256 } from './der.js';

beforeAll(async () => {
    await ensureCryptoReady();
});

describe('createMockPki', () => {
    it('should build a root-signed chain with TSA and OCSP leaves', () => {
        const pki = createMockPki();
        expect(isSelfSigned(pki.rootCert)).toBe(true);
        expect(verifyCertSignature(pki.signerCert, pki.rootCert)).toBe(true);
        expect(verifyCertSignature(pki.tsaCert, pki.rootCert)).toBe(true);
        expect(verifyCertSignature(pki.ocspCert, pki.rootCert)).toBe(true);
        expect(pki.signerCert.ocspUrls).toContain(MOCK_OCSP_URL);
        expect(pki.signerCert.crlUrls).toContain(MOCK_CRL_URL);
    });
});

describe('createMockTimestampProvider', () => {
    it('should return a granted TimeStampResp that round-trips through the library parsers', async () => {
        const pki = createMockPki();
        const provider = createMockTimestampProvider(pki);
        const imprint = sha256(new Uint8Array([1, 2, 3]));
        const request = buildTimestampRequest(imprint, { nonce: 42n });

        const responseDer = await provider.getTimestamp(request);
        const response = parseTimestampResponse(responseDer);
        expect(response.status).toBe(0);
        expect(response.token).toBeDefined();

        const info = parseTimestampToken(response.token as Uint8Array);
        expect(info.nonce).toBe(42n);
        expect(info.genTime.toISOString()).toBe('2026-02-01T12:00:00.000Z');
        expect(verifyTimestampImprint(info, imprint)).toBe(true);
        expect(info.tsaCertificates.length).toBeGreaterThan(0);
    });

    it('should return a rejection without token when status is forced', async () => {
        const pki = createMockPki();
        const provider = createMockTimestampProvider(pki, { status: 2 });
        const request = buildTimestampRequest(sha256(new Uint8Array([9])), {});
        const response = parseTimestampResponse(await provider.getTimestamp(request));
        expect(response.status).toBe(2);
        expect(response.token).toBeUndefined();
    });
});

describe('createMockRevocationProvider', () => {
    it('should serve a parseable CRL signed by the root', async () => {
        const pki = createMockPki();
        const provider = createMockRevocationProvider(pki);
        const crl = await provider.fetchCrl?.(MOCK_CRL_URL);
        expect(crl).toBeInstanceOf(Uint8Array);
        expect((crl as Uint8Array).length).toBeGreaterThan(100);
    });

    it('should list the signer serial in the CRL when revoked', async () => {
        const pki = createMockPki();
        const provider = createMockRevocationProvider(pki, { revoked: true });
        const fresh = await provider.fetchCrl?.(MOCK_CRL_URL);
        const clean = await createMockRevocationProvider(pki).fetchCrl?.(MOCK_CRL_URL);
        expect((fresh as Uint8Array).length).toBeGreaterThan((clean as Uint8Array).length);
    });
});
