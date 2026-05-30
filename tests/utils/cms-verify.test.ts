import { describe, it, expect, beforeAll } from 'vitest';
import { createSign, createPrivateKey } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCryptoReady } from '../../src/core-bridge/index.js';
import { loadCertificate } from '../../src/utils/keys.js';
import { verifySignedStructure } from '../../src/utils/cms-verify.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const OID_RSA_SHA256 = '1.2.840.113549.1.1.11';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const TBS = new Uint8Array([0x30, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05]);

describe('verifySignedStructure', () => {
    beforeAll(async () => {
        await ensureCryptoReady();
    });

    it('verifies a valid RSA-SHA256 signature', async () => {
        const cert = await loadCertificate('UNSET_ENV_RSA', path.join(FIX, 'rsa-cert.pem'), 'cert');
        const key = createPrivateKey(fs.readFileSync(path.join(FIX, 'rsa-key.pem')));
        const sig = new Uint8Array(createSign('RSA-SHA256').update(TBS).sign(key));
        expect(verifySignedStructure(TBS, OID_RSA_SHA256, sig, cert)).toBe(true);
    });

    it('rejects a tampered RSA signature', async () => {
        const cert = await loadCertificate('UNSET_ENV_RSA', path.join(FIX, 'rsa-cert.pem'), 'cert');
        const key = createPrivateKey(fs.readFileSync(path.join(FIX, 'rsa-key.pem')));
        const sig = new Uint8Array(createSign('RSA-SHA256').update(TBS).sign(key));
        sig[0] = sig[0] ^ 0xff;
        expect(verifySignedStructure(TBS, OID_RSA_SHA256, sig, cert)).toBe(false);
    });

    it('verifies a valid ECDSA-SHA256 signature', async () => {
        const cert = await loadCertificate('UNSET_ENV_EC', path.join(FIX, 'ec-cert.pem'), 'cert');
        const key = createPrivateKey(fs.readFileSync(path.join(FIX, 'ec-key.pem')));
        const sig = new Uint8Array(createSign('SHA256').update(TBS).sign(key));
        expect(verifySignedStructure(TBS, OID_ECDSA_SHA256, sig, cert)).toBe(true);
    });

    it('returns false for a null algorithm OID', async () => {
        const cert = await loadCertificate('UNSET_ENV_RSA', path.join(FIX, 'rsa-cert.pem'), 'cert');
        expect(verifySignedStructure(TBS, null, new Uint8Array([1, 2, 3]), cert)).toBe(false);
    });

    it('returns false for an unsupported algorithm OID', async () => {
        const cert = await loadCertificate('UNSET_ENV_RSA', path.join(FIX, 'rsa-cert.pem'), 'cert');
        expect(verifySignedStructure(TBS, '1.2.3.4.5', new Uint8Array([1, 2, 3]), cert)).toBe(false);
    });
});
