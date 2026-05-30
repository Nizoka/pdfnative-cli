import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ensureCryptoReady,
    parseCertificate,
    buildDocumentPDFBytes,
    openPdf,
} from '../../src/core-bridge/index.js';
import { pemToDer } from '../../src/utils/keys.js';
import { walkAbs } from '../../src/utils/asn1-walk.js';
import { buildOcspRequest, extractDss, checkRevocation } from '../../src/utils/revocation.js';
import type { X509Certificate } from '../../src/core-bridge/index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadCert(file: string): X509Certificate {
    const pem = fs.readFileSync(path.join(FIX, file), 'utf8');
    return parseCertificate(pemToDer(pem));
}

describe('buildOcspRequest', () => {
    beforeAll(async () => {
        await ensureCryptoReady();
    });

    it('produces a well-formed DER OCSPRequest SEQUENCE', () => {
        const cert = loadCert('rsa-cert.pem');
        const der = buildOcspRequest(cert, cert);
        const root = walkAbs(der);
        // OCSPRequest -> tbsRequest -> requestList -> Request -> CertID
        expect(root.tag).toBe(0x30);
        const tbsRequest = root.children[0];
        expect(tbsRequest?.tag).toBe(0x30);
        const requestList = tbsRequest?.children[0];
        expect(requestList?.tag).toBe(0x30);
        const request = requestList?.children[0];
        const certId = request?.children[0];
        expect(certId?.tag).toBe(0x30);
        // CertID: hashAlgorithm, issuerNameHash, issuerKeyHash, serialNumber
        expect(certId?.children.length).toBe(4);
        expect(certId?.children[1]?.tag).toBe(0x04); // OCTET STRING nameHash
        expect(certId?.children[3]?.tag).toBe(0x02); // INTEGER serial
    });
});

describe('extractDss', () => {
    it('returns empty arrays for a PDF without a /DSS dictionary', () => {
        const bytes = buildDocumentPDFBytes(
            { blocks: [{ type: 'paragraph', text: 'no dss here' }] },
            {},
        );
        const reader = openPdf(bytes);
        const dss = extractDss(reader);
        expect(dss.ocsps).toEqual([]);
        expect(dss.crls).toEqual([]);
    });
});

describe('checkRevocation', () => {
    beforeAll(async () => {
        await ensureCryptoReady();
    });

    function reader() {
        const bytes = buildDocumentPDFBytes({ blocks: [{ type: 'paragraph', text: 'x' }] }, {});
        return openPdf(bytes);
    }

    it('does not check when mode is disabled', async () => {
        const cert = loadCert('rsa-cert.pem');
        const r = await checkRevocation(reader(), cert, cert, [], 'disabled');
        expect(r.checked).toBe(false);
        expect(r.source).toBe('none');
    });

    it('does not check when the issuer is unknown (null)', async () => {
        const cert = loadCert('rsa-cert.pem');
        const r = await checkRevocation(reader(), cert, null, [], 'offline');
        expect(r.checked).toBe(false);
        expect(r.note).toContain('no revocation authority');
    });

    it('does not check a self-signed certificate', async () => {
        // The fixture cert is self-signed, so even with a non-null issuer it
        // has no revocation authority.
        const cert = loadCert('rsa-cert.pem');
        const r = await checkRevocation(reader(), cert, cert, [], 'offline');
        expect(r.checked).toBe(false);
        expect(r.status).toBe('unknown');
    });
});
