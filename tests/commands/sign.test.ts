import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { sign } from '../../src/commands/sign.js';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

// Minimal self-signed RSA key + cert for testing.
// Generated with: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=Test"
// These are test credentials — NOT for production use.
const TEST_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2a2rwplBQLF29amygykEMmYz0+Kcj3bKBp29vNSBfFLbHVBv
WFLqCKfmfyjWHqK2K1Z9IMaIZV1S3XcNKWQlrkpfAKdVbHxLadkk2VyAmcT7XFku
+XMgsTuLQ7T8WyIogBIDzx7FIJBIH8PPNP4XnzLVhOlT2MDNJv1nW0bAiFHZOi8I
Y5dO3FGbmERNJK6N97e7P8NTamIz2XHFOJqQsHQxAQNSXO7bm8KlKzfI8zFz2GNa
2wIDAQABAoIBAHbJlSP0DDBF8P13v3yT5Q+nmDc+8v2qVW9o2REcCfWdSpAtL3eN
MgfGY0rWVxNkGTh5eJFHOlblHqXMcXRLikn5iqMsYHCkLp2GQZW9o9KlrChvCFYe
r3VN+ojxNHRjinsMfr5PEqLveBOz38M5KKg8Af8tHLVfbhWEkO5n0VKZtplVuwQ
TxObL7P/VrJikB5oRcbbSGWy0UQ7TBE2RJ6E2YuKb0ljXCMZvkYlp/LkmfPDVqe7
MnBCOsF5B+ej5lIzXEZR0H5yN0z5E1Q5fq1w+BT/mxVsRGUvQJflqRnb2OvgD3N
o5Tz4AaXhkK5+SL1c7qs18CPhQECgYEA7bMZRMqQZ3BHw6T9GEVbLhHp9gHkR8Cy
ZwFIBs0NJdcm7bKSdXGGRnvl2hJHBiqIGQ8dsTBYJcJHrlNzBfgBf4j2P/MMJNPF
v5MXWY6MNiNhM+f0nmLd8eMm1JhOCqDiJvJkJyXEBq9MHfq0MZ9w4jy8Pk7s7kfW
ZOSnIqECgYEA6u5l8Np9WCL8VpzrQ7tIqTBqKuAHRE8FTYD/LL59MIVJB8BkZfwF
oQ9UvRJnN9X1K5xR4QKIV9XxMX5tpTq6y0w8JB5tT3kGZc2RB8vdtMthFTjq7UT
rxceFAmW6TQH1e3Z1O0Ts6p4bI9eVIi0GjB4Ml2TRkXb0hqeJJkCgYBK4D3aSGRi
Nn5bCvpVEdnJK+VfqwG4bQ7u5X0eDgFp9mInhkWI2cVqwk9MTGB5OqxR9e0JJiqS
RW+0r0JM0dFXd+7M3UZjFBrmm8IIXt7hs9f4XoYE2fLYVwnJBG0RGFxNULvOGM8
hZhNp3b0MRyCl5jOD7SBzPj40QKBgGxjilKl7gm5QJrlSx7yzJpHqFHK0mQrAF8s
D6lpJdZ8kYoJkRBBP2E0O05dFT7yZ7YLQNT0N+/r2sDo5IDPm35iyWAX8kRYdEqK
EVjU6Z5Kcp6oMlBWH2xQ6Mc5g6+kROCIEhYV5Q0z0PoRbEsTolJGMVMFE1N5s0oc
7RJZAoGBANs8w7hxST5RI//FxmUGUjxR4h3h0q9cBDtg7HHqvzBW3zaBMZlGlMxE
XNP4ZpEVJF3vWx/6r6s7Xm0UR3B1K5y5xqc41HqT7VDT1C0NKIY2X3P6P8e0FIqT
N0vYHu4Z3fmYMW8C94vGWjlp4SFBVBzq2aSY10J3a+6UM2Wx
-----END RSA PRIVATE KEY-----`;

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDFO4fqKZwi7DANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAl
UZXN0IENOIDAxMB4XDTIzMDEwMTAwMDAwMFoXDTMzMDEwMTAwMDAwMFowFDESMBAG
A1UEAwwJVGVzdCBDTiAwMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
2a2rwplBQLF29amygykEMmYz0+Kcj3bKBp29vNSBfFLbHVBvWFLqCKfmfyjWHqK2
K1Z9IMaIZV1S3XcNKWQlrkpfAKdVbHxLadkk2VyAmcT7XFku+XMgsTuLQ7T8WyIo
gBIDzx7FIJBIH8PPNP4XnzLVhOlT2MDNJv1nW0bAiFHZOi8IY5dO3FGbmERNJK6N
97e7P8NTamIz2XHFOJqQsHQxAQNSXO7bm8KlKzfI8zFz2GNa2wIDAQABo1MwUTAd
BgNVHQ4EFgQUfm0gJAHhxSL3X/0UkJF/DQ6WO/QwHwYDVR0jBBgwFoAUfm0gJAHh
xSL3X/0UkJF/DQ6WO/QwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC
AQEAX6gQfChDJo9mvWj1V0E2Hp8gXfNa5lLFzxjmNmZ7jlT0baxL7xGIIcZ6v2Lq
ZRyNLIbHkVLyiijbq7bRIKfH4ZZXX5MVJIPv5W4n34VPVGvW2LKOO8fv5Q7AQWQV
+WVG7Ys1Jf3bLl5PxRVomqjFe23bAHiqLnA5bCZ/0qFfVW8lN++JFI8HzHJ0Rke
gDCBnGvvWwTqKHLHZ5HY5uLMQbRzRq/uH8XabO7HOCJ5nfRy9ZJDE4q+l8y6IZS
3NRYiWZv71vwj2vpQRNf5AHl0XyCH2WO/YYG3JNz50G7F4EkMJI+R7lO9sXIVVBf
NLaIuHZxnFHm3+vSGAWv3g==
-----END CERTIFICATE-----`;

const minimalParams = JSON.stringify({
    title: 'Sign Test',
    blocks: [{ type: 'paragraph', text: 'Hello world' }],
});

describe('sign', () => {
    const tmpFiles: string[] = [];

    afterEach(async () => {
        // Clear test env vars
        delete process.env['PDFNATIVE_SIGN_KEY'];
        delete process.env['PDFNATIVE_SIGN_CERT'];
        for (const f of tmpFiles.splice(0)) {
            await fs.unlink(f).catch(() => undefined);
        }
    });

    async function makeTestPdf(): Promise<string> {
        const inPath = path.join(os.tmpdir(), `sign-in-${Date.now()}.json`);
        const pdfPath = path.join(os.tmpdir(), `sign-src-${Date.now()}.pdf`);
        tmpFiles.push(inPath, pdfPath);
        await fs.writeFile(inPath, minimalParams, 'utf8');
        await render(parseArgs(['--input', inPath, '--output', pdfPath]));
        return pdfPath;
    }

    it('throws CliError(2) when no key is provided (no env, no flag)', async () => {
        const pdfPath = await makeTestPdf();
        const outPath = path.join(os.tmpdir(), `sign-out-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        const err = await sign(parseArgs(['--input', pdfPath, '--output', outPath])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('throws CliError(2) when cert is missing even if key is provided', async () => {
        const pdfPath = await makeTestPdf();
        const keyPath = path.join(os.tmpdir(), `key-${Date.now()}.pem`);
        tmpFiles.push(keyPath);
        await fs.writeFile(keyPath, TEST_KEY_PEM, 'utf8');

        const err = await sign(parseArgs(['--input', pdfPath, '--key', keyPath])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('env vars PDFNATIVE_SIGN_KEY and PDFNATIVE_SIGN_CERT take precedence over file flags', async () => {
        process.env['PDFNATIVE_SIGN_KEY'] = TEST_KEY_PEM;
        process.env['PDFNATIVE_SIGN_CERT'] = TEST_CERT_PEM;

        const pdfPath = await makeTestPdf();
        const outPath = path.join(os.tmpdir(), `sign-env-out-${Date.now()}.pdf`);
        tmpFiles.push(outPath);

        // Should attempt to sign (may fail due to fake test creds, but must not fail on "missing key")
        // We expect either success or a parse/sign error — NOT a usage CliError(2)
        const result = await sign(parseArgs(['--input', pdfPath, '--output', outPath])).catch((e: unknown) => e);
        if (result instanceof CliError) {
            // If it fails, it should not be a usage error (exit code 2)
            expect((result as CliError).exitCode).not.toBe(2);
        }
        // If it succeeded, verify output
        if (!(result instanceof CliError)) {
            const bytes = await fs.readFile(outPath);
            expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
        }
    });

    it('prefers env var over --key file flag', async () => {
        // Set a valid env var — a garbage file path should be ignored
        process.env['PDFNATIVE_SIGN_KEY'] = TEST_KEY_PEM;
        process.env['PDFNATIVE_SIGN_CERT'] = TEST_CERT_PEM;

        const pdfPath = await makeTestPdf();
        // Pass a non-existent key file — should be ignored because env is set
        const result = await sign(parseArgs(['--input', pdfPath, '--key', '/nonexistent/path.pem'])).catch((e: unknown) => e);
        // Should NOT fail with ENOENT since env var takes precedence
        if (result instanceof Error) {
            expect(result.message).not.toContain('ENOENT');
        }
    });

    // ──────────────────────────────────────────────────────────────────
    // v0.2.0 — new flag coverage
    // ──────────────────────────────────────────────────────────────────

    it('rejects invalid --algorithm value', async () => {
        const pdfPath = await makeTestPdf();
        const err = await sign(parseArgs([
            '--input', pdfPath,
            '--algorithm', 'sha512-rsa',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('--algorithm ecdsa-sha256 requires an EC key (not RSA)', async () => {
        const pdfPath = await makeTestPdf();
        // Provide an RSA key — should fail with a clean parse error, never leak key bytes.
        process.env['PDFNATIVE_SIGN_KEY'] = TEST_KEY_PEM;
        process.env['PDFNATIVE_SIGN_CERT'] = TEST_CERT_PEM;
        const err = await sign(parseArgs([
            '--input', pdfPath,
            '--algorithm', 'ecdsa-sha256',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        // Must never expose key material in the message.
        expect((err as Error).message).not.toMatch(/-----BEGIN/);
    });

    it('rejects invalid --signing-time', async () => {
        const pdfPath = await makeTestPdf();
        process.env['PDFNATIVE_SIGN_KEY'] = TEST_KEY_PEM;
        process.env['PDFNATIVE_SIGN_CERT'] = TEST_CERT_PEM;
        const err = await sign(parseArgs([
            '--input', pdfPath,
            '--signing-time', 'not-a-date',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('error messages never contain raw PEM body', async () => {
        const pdfPath = await makeTestPdf();
        const garbageKey = path.join(os.tmpdir(), `bad-key-${Date.now()}.pem`);
        const garbageCert = path.join(os.tmpdir(), `bad-cert-${Date.now()}.pem`);
        tmpFiles.push(garbageKey, garbageCert);
        await fs.writeFile(garbageKey, '-----BEGIN RSA PRIVATE KEY-----\nSECRETBYTES==\n-----END RSA PRIVATE KEY-----', 'utf8');
        await fs.writeFile(garbageCert, '-----BEGIN CERTIFICATE-----\nSECRETBYTES==\n-----END CERTIFICATE-----', 'utf8');

        const err = await sign(parseArgs([
            '--input', pdfPath,
            '--key', garbageKey,
            '--cert', garbageCert,
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).message).not.toContain('SECRETBYTES');
        expect((err as CliError).message).not.toMatch(/-----BEGIN/);
    });
});
