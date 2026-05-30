import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCryptoReady, parseCertificate } from '../../src/core-bridge/index.js';
import { pemToDer } from '../../src/utils/keys.js';
import { certEquals, findChainParent, buildChain, isTrustedRoot } from '../../src/utils/cert-chain.js';
import type { X509Certificate } from '../../src/core-bridge/index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadCert(file: string): X509Certificate {
    return parseCertificate(pemToDer(fs.readFileSync(path.join(FIX, file), 'utf8')));
}

describe('cert-chain', () => {
    let rsa: X509Certificate;
    let ec: X509Certificate;

    beforeAll(async () => {
        await ensureCryptoReady();
        rsa = loadCert('rsa-cert.pem');
        ec = loadCert('ec-cert.pem');
    });

    it('certEquals is true for the same certificate and false for different ones', () => {
        expect(certEquals(rsa, rsa)).toBe(true);
        expect(certEquals(rsa, ec)).toBe(false);
    });

    it('findChainParent returns undefined when no candidate signed the cert', () => {
        expect(findChainParent(rsa, [ec])).toBeUndefined();
    });

    it('buildChain on a self-signed cert yields a single-element valid chain', () => {
        const built = buildChain(rsa, [rsa]);
        expect(built.chain.length).toBe(1);
        expect(built.chainValid).toBe(true);
        expect(certEquals(built.root, rsa)).toBe(true);
    });

    it('isTrustedRoot accepts a self-signed root when no anchors are configured', () => {
        expect(isTrustedRoot(rsa, [])).toBe(true);
    });

    it('isTrustedRoot requires a byte-equal anchor when trust roots are configured', () => {
        expect(isTrustedRoot(rsa, [rsa])).toBe(true);
        expect(isTrustedRoot(rsa, [ec])).toBe(false);
    });
});
