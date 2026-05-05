import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { correctCertificateIssuerRaw } from '../../src/utils/cert-fix.js';
import { pemToDer } from '../../src/utils/keys.js';
import { parseCertificate, ensureCryptoReady } from '../../src/core-bridge/index.js';
import type { X509Certificate } from '../../src/core-bridge/index.js';
import { CliError } from '../../src/utils/error.js';

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

let realCert: X509Certificate;

beforeAll(async () => {
    await ensureCryptoReady();
    const pem = await fs.readFile(path.join(FIXTURES, 'rsa-cert.pem'), 'utf8');
    realCert = parseCertificate(pemToDer(pem));
});

describe('correctCertificateIssuerRaw', () => {
    it('returns a certificate with both DN slices starting with 0x30', () => {
        const out = correctCertificateIssuerRaw(realCert);
        expect(out.issuer.raw[0]).toBe(0x30);
        expect(out.subject.raw[0]).toBe(0x30);
    });

    it('returns the input unchanged when both DN slices are already correct (early return)', () => {
        // Synthesize a "good" cert by first running the fix, then feeding the result back.
        const good = correctCertificateIssuerRaw(realCert);
        const out = correctCertificateIssuerRaw(good);
        expect(out).toBe(good);
    });

    it('repairs a damaged issuer.raw slice by re-walking tbsCertificateBytes', () => {
        const broken: X509Certificate = {
            ...realCert,
            issuer: { ...realCert.issuer, raw: new Uint8Array([0xff, 0xff]) },
        };
        const fixed = correctCertificateIssuerRaw(broken);
        expect(fixed.issuer.raw[0]).toBe(0x30);
        expect(fixed.subject.raw[0]).toBe(0x30);
    });

    it('repairs a damaged subject.raw slice', () => {
        const broken: X509Certificate = {
            ...realCert,
            subject: { ...realCert.subject, raw: new Uint8Array([0xff, 0xff]) },
        };
        const fixed = correctCertificateIssuerRaw(broken);
        expect(fixed.subject.raw[0]).toBe(0x30);
    });

    it('repairs both issuer.raw and subject.raw simultaneously', () => {
        const broken: X509Certificate = {
            ...realCert,
            issuer: { ...realCert.issuer, raw: new Uint8Array([0xff, 0xff]) },
            subject: { ...realCert.subject, raw: new Uint8Array([0xff, 0xff]) },
        };
        const fixed = correctCertificateIssuerRaw(broken);
        expect(fixed.issuer.raw[0]).toBe(0x30);
        expect(fixed.subject.raw[0]).toBe(0x30);
    });

    it('throws CliError when tbsCertificateBytes is unparsable', () => {
        const broken: X509Certificate = {
            ...realCert,
            issuer: { ...realCert.issuer, raw: new Uint8Array([0xff]) },
            tbsCertificateBytes: new Uint8Array([0xff, 0xff, 0xff]),
        };
        const err = (() => {
            try { correctCertificateIssuerRaw(broken); return null; }
            catch (e) { return e; }
        })();
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });

    it('throws CliError when tbsCertificateBytes is not a SEQUENCE', () => {
        // Build a primitive INTEGER instead of SEQUENCE.
        const broken: X509Certificate = {
            ...realCert,
            issuer: { ...realCert.issuer, raw: new Uint8Array([0xff]) },
            tbsCertificateBytes: new Uint8Array([0x02, 0x01, 0x05]),
        };
        expect(() => correctCertificateIssuerRaw(broken)).toThrow(CliError);
    });
});
