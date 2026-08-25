/**
 * Sign → Verify round-trip integration test (v0.3.0).
 *
 * Exercises the full pipeline:
 *   1. render minimal PDF
 *   2. sign with RSA-SHA256 (and ECDSA-SHA256)
 *   3. verify produces { allValid: true, signatureValid: true }
 *   4. tamper with PDF → verify reports integrity FAIL
 *
 * Uses fixtures committed under `tests/fixtures/` (test-only self-signed keys).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { render } from '../../src/commands/render.js';
import { sign } from '../../src/commands/sign.js';
import { verify } from '../../src/commands/verify.js';
import { parseArgs } from '../../src/utils/args.js';
import { setTimestampProvider } from '../../src/core-bridge/index.js';
import { createMockPki, createMockTimestampProvider } from '../helpers/mock-pki.js';

const FIXTURES = path.dirname(fileURLToPath(import.meta.url));
const RSA_KEY = path.join(FIXTURES, '..', 'fixtures', 'rsa-key.pem');
const RSA_CERT = path.join(FIXTURES, '..', 'fixtures', 'rsa-cert.pem');
const EC_KEY = path.join(FIXTURES, '..', 'fixtures', 'ec-key.pem');
const EC_CERT = path.join(FIXTURES, '..', 'fixtures', 'ec-cert.pem');

const minimalParams = JSON.stringify({
    title: 'Round-trip Test',
    blocks: [{ type: 'paragraph', text: 'sign-then-verify' }],
});

interface VerifyOutput {
    readonly signatures: ReadonlyArray<{
        readonly fieldName: string | null;
        readonly subFilter: string | null;
        readonly isDocTimestamp: boolean;
        readonly integrity: boolean;
        readonly chainValid: boolean;
        readonly trustedRoot: boolean;
        readonly signatureValid: boolean;
        readonly signatureAlgorithm: string | null;
        readonly timestampPresent: boolean;
    }>;
    readonly allValid: boolean;
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        const orig = process.stdout.write.bind(process.stdout);
        process.stdout.write = (c: unknown) => {
            chunks.push(String(c));
            return true;
        };
        fn().then(
            () => {
                process.stdout.write = orig;
                resolve(chunks.join(''));
            },
            (e: unknown) => {
                process.stdout.write = orig;
                reject(e as Error);
            },
        );
    });
}

describe('sign → verify round-trip', () => {
    const tmpFiles: string[] = [];

    afterEach(async () => {
        for (const f of tmpFiles.splice(0)) {
            await fs.unlink(f).catch(() => undefined);
        }
    });

    async function renderUnsigned(): Promise<string> {
        const inPath = path.join(os.tmpdir(), `rt-in-${Date.now()}-${Math.random()}.json`);
        const pdfPath = path.join(os.tmpdir(), `rt-src-${Date.now()}-${Math.random()}.pdf`);
        tmpFiles.push(inPath, pdfPath);
        await fs.writeFile(inPath, minimalParams, 'utf8');
        await render(parseArgs(['--input', inPath, '--output', pdfPath]));
        return pdfPath;
    }

    async function signWith(
        algorithm: 'rsa-sha256' | 'ecdsa-sha256',
        pureCrypto = false,
        extraFlags: readonly string[] = [],
    ): Promise<string> {
        const src = await renderUnsigned();
        const out = path.join(os.tmpdir(), `rt-signed-${Date.now()}-${Math.random()}.pdf`);
        tmpFiles.push(out);
        const key = algorithm === 'rsa-sha256' ? RSA_KEY : EC_KEY;
        const cert = algorithm === 'rsa-sha256' ? RSA_CERT : EC_CERT;
        const argv = [
            '--input', src,
            '--output', out,
            '--key', key,
            '--cert', cert,
            '--algorithm', algorithm,
            ...extraFlags,
        ];
        if (pureCrypto) argv.push('--pure-crypto');
        await sign(parseArgs(argv));
        return out;
    }

    async function verifyJson(pdfPath: string): Promise<VerifyOutput> {
        const stdout = await captureStdout(() => verify(parseArgs([
            '--input', pdfPath,
            '--format', 'json',
        ])));
        return JSON.parse(stdout) as VerifyOutput;
    }

    it('RSA-SHA256: signs and verifies as fully valid', async () => {
        const signed = await signWith('rsa-sha256');
        const result = await verifyJson(signed);
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.chainValid).toBe(true);
        expect(sig.trustedRoot).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('rsa-sha256');
        expect(sig.timestampPresent).toBe(false);
        expect(result.allValid).toBe(true);
    });

    it('ECDSA-SHA256: signs and verifies as fully valid', async () => {
        const signed = await signWith('ecdsa-sha256');
        const result = await verifyJson(signed);
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.chainValid).toBe(true);
        expect(sig.trustedRoot).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('ecdsa-sha256');
        expect(result.allValid).toBe(true);
    });

    it('native crypto (default) and --pure-crypto both verify as valid (RSA)', async () => {
        const native = await verifyJson(await signWith('rsa-sha256', false));
        expect(native.allValid).toBe(true);
        expect(native.signatures[0]!.signatureValid).toBe(true);

        const pure = await verifyJson(await signWith('rsa-sha256', true));
        expect(pure.allValid).toBe(true);
        expect(pure.signatures[0]!.signatureValid).toBe(true);
    });

    it('--pure-crypto verifies as valid (ECDSA)', async () => {
        const pure = await verifyJson(await signWith('ecdsa-sha256', true));
        expect(pure.allValid).toBe(true);
        expect(pure.signatures[0]!.signatureValid).toBe(true);
    });

    it('RSA + --timestamp (mock TSA): signs PAdES B-T style and verify reports the timestamp', async () => {
        // Offline RFC 3161: the injected global provider beats the CLI's HTTP
        // transport, so the .invalid URL is never contacted.
        setTimestampProvider(createMockTimestampProvider(createMockPki()));
        try {
            const src = await renderUnsigned();
            const out = path.join(os.tmpdir(), `rt-ts-signed-${Date.now()}-${Math.random()}.pdf`);
            tmpFiles.push(out);
            await sign(parseArgs([
                '--input', src,
                '--output', out,
                '--key', RSA_KEY,
                '--cert', RSA_CERT,
                '--timestamp', 'http://tsa.mock.invalid/tsr',
            ]));

            const result = await verifyJson(out);
            expect(result.signatures).toHaveLength(1);
            const sig = result.signatures[0]!;
            expect(sig.integrity).toBe(true);
            expect(sig.signatureValid).toBe(true);
            expect(sig.timestampPresent).toBe(true);
            expect(result.allValid).toBe(true);
        } finally {
            setTimestampProvider(null);
        }
    });

    it('RSA + --digest sha384: signs and verifies as rsa-sha384 (v1.4.0)', async () => {
        const signed = await signWith('rsa-sha256', false, ['--digest', 'sha384']);
        const result = await verifyJson(signed);
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('rsa-sha384');
        expect(result.allValid).toBe(true);
    });

    it('RSA + --digest sha512: signs and verifies as rsa-sha512 (v1.4.0)', async () => {
        const signed = await signWith('rsa-sha256', false, ['--digest', 'sha512']);
        const result = await verifyJson(signed);
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('rsa-sha512');
        expect(result.allValid).toBe(true);
    });

    it('--pure-crypto + --digest sha384 also round-trips (pure-JS RSA path)', async () => {
        const signed = await signWith('rsa-sha256', true, ['--digest', 'sha384']);
        const result = await verifyJson(signed);
        expect(result.signatures[0]!.signatureAlgorithm).toBe('rsa-sha384');
        expect(result.signatures[0]!.signatureValid).toBe(true);
        expect(result.allValid).toBe(true);
    });

    it('--profile pades: ETSI.CAdES.detached signature verifies as fully valid (v1.4.0)', async () => {
        const signed = await signWith('rsa-sha256', false, ['--profile', 'pades']);
        const result = await verifyJson(signed);
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.subFilter).toBe('ETSI.CAdES.detached');
        expect(sig.isDocTimestamp).toBe(false);
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(result.allValid).toBe(true);
    });

    it('detects tampering (RSA): integrity FAIL after byte mutation', async () => {
        const signed = await signWith('rsa-sha256');
        const bytes = await fs.readFile(signed);
        // Flip a byte well outside /ByteRange windows (in the visible content stream).
        // Find the first occurrence of "sign-then-verify" and mutate one byte.
        const marker = Buffer.from('sign-then-verify', 'utf8');
        const idx = bytes.indexOf(marker);
        expect(idx).toBeGreaterThan(0);
        bytes[idx] = bytes[idx]! ^ 0x01;
        await fs.writeFile(signed, bytes);

        const result = await verifyJson(signed);
        expect(result.allValid).toBe(false);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(false);
    });
});
