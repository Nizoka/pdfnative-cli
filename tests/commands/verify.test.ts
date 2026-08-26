import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { verify } from '../../src/commands/verify.js';
import { render } from '../../src/commands/render.js';
import { sign } from '../../src/commands/sign.js';
import { docTimestamp } from '../../src/commands/docTimestamp.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import {
    setTimestampProvider,
    derSequence,
    derInteger,
} from '../../src/core-bridge/index.js';
import type { RsaPrivateKey } from '../../src/core-bridge/index.js';
import { createMockPki, createMockTimestampProvider, toPem } from '../helpers/mock-pki.js';

const minimalParams = JSON.stringify({
    title: 'Verify Test',
    blocks: [{ type: 'paragraph', text: 'unsigned' }],
});

interface VerifyOutput {
    signatures: unknown[];
    allValid: boolean;
}

const tmpFiles: string[] = [];

afterEach(async () => {
    for (const f of tmpFiles.splice(0)) await fs.unlink(f).catch(() => undefined);
});

async function makeUnsignedPdf(): Promise<string> {
    const inPath = path.join(os.tmpdir(), `verify-in-${Date.now()}.json`);
    const pdfPath = path.join(os.tmpdir(), `verify-src-${Date.now()}.pdf`);
    tmpFiles.push(inPath, pdfPath);
    await fs.writeFile(inPath, minimalParams, 'utf8');
    await render(parseArgs(['--input', inPath, '--output', pdfPath]));
    return pdfPath;
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

describe('verify', () => {
    it('reports zero signatures for an unsigned PDF', async () => {
        const pdf = await makeUnsignedPdf();
        const out = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--format', 'json'])),
        );
        const result = JSON.parse(out) as VerifyOutput;
        expect(result.signatures).toEqual([]);
        expect(result.allValid).toBe(false); // empty list ≠ valid
    });

    it('produces text format output', async () => {
        const pdf = await makeUnsignedPdf();
        const out = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--format', 'text'])),
        );
        expect(out).toContain('Signatures: 0');
        expect(out).toContain('Result:');
    });

    it('throws CliError(2) for invalid --format', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await verify(parseArgs(['--input', pdf, '--format', 'xml']))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('throws CliError(1) for non-PDF input', async () => {
        const bad = path.join(os.tmpdir(), `verify-bad-${Date.now()}.pdf`);
        tmpFiles.push(bad);
        await fs.writeFile(bad, 'not a pdf', 'utf8');
        const err = await verify(parseArgs(['--input', bad])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });

    it('--strict on unsigned PDF exits 1', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--strict'])),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
    });

    it('tags an unreadable PDF with E_PARSE', async () => {
        const bad = path.join(os.tmpdir(), `verify-badcode-${Date.now()}.pdf`);
        tmpFiles.push(bad);
        await fs.writeFile(bad, 'not a pdf', 'utf8');
        const err = await verify(parseArgs(['--input', bad])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(ErrorCode.PARSE);
    });

    it('tags a --strict failure with E_VERIFY_FAILED', async () => {
        const pdf = await makeUnsignedPdf();
        const err = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--strict'])),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(ErrorCode.VERIFY_FAILED);
    });

    describe('agent output projection', () => {
        const origJson = process.env['PDFNATIVE_JSON'];

        afterEach(() => {
            if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
            else process.env['PDFNATIVE_JSON'] = origJson;
        });

        it('--summary emits the canonical minimal verdict', async () => {
            const pdf = await makeUnsignedPdf();
            const out = await captureStdout(() =>
                verify(parseArgs(['--input', pdf, '--summary'])),
            );
            expect(JSON.parse(out)).toEqual({ valid: false, signatures: 0, invalid: 0 });
        });

        it('--json compacts the output (no indentation)', async () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const pdf = await makeUnsignedPdf();
            const out = await captureStdout(() => verify(parseArgs(['--input', pdf])));
            expect(out.trimEnd()).not.toContain('\n');
            expect(out).not.toContain('  ');
        });

        it('--fields projects only the requested paths', async () => {
            const pdf = await makeUnsignedPdf();
            const out = await captureStdout(() =>
                verify(parseArgs(['--input', pdf, '--fields', 'allValid'])),
            );
            expect(JSON.parse(out)).toEqual({ allValid: false });
        });
    });
});

// ── v1.4.0 — enriched verify: digests, PAdES, fieldName, /DocTimeStamp ──
//
// Fixtures are generated in-process with the mock PKI (real DER, real RSA
// signatures, ZERO network): the mock TSA is injected via
// setTimestampProvider so the .invalid URL is never contacted.

interface EnrichedSignature {
    readonly fieldName: string | null;
    readonly subFilter: string | null;
    readonly isDocTimestamp: boolean;
    readonly integrity: boolean;
    readonly chainValid: boolean;
    readonly trustedRoot: boolean;
    readonly signatureValid: boolean;
    readonly signatureAlgorithm: string | null;
    readonly timestampPresent: boolean;
    readonly timestampValid: boolean;
    readonly timestampTime: string | null;
    readonly notes: readonly string[];
}

interface EnrichedVerifyOutput {
    readonly signatures: readonly EnrichedSignature[];
    readonly allValid: boolean;
}

/** PKCS#1 RSAPrivateKey DER (RFC 8017 A.1.2) for the mock signer key. */
function rsaPrivateKeyPkcs1Der(key: RsaPrivateKey): Uint8Array {
    return derSequence(
        derInteger(0n),
        derInteger(key.n),
        derInteger(65537n),
        derInteger(key.d),
        derInteger(key.p),
        derInteger(key.q),
        derInteger(key.dp),
        derInteger(key.dq),
        derInteger(key.qi),
    );
}

describe('verify — enriched (v1.4.0)', () => {
    let dir: string;
    let basePdf: string;
    let keyPath: string;
    let certPath: string;
    let rootPath: string;

    beforeAll(async () => {
        const pki = createMockPki();
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-enriched-'));
        keyPath = path.join(dir, 'signer-key.pem');
        certPath = path.join(dir, 'signer-cert.pem');
        rootPath = path.join(dir, 'root-cert.pem');
        await fs.writeFile(keyPath, toPem('RSA PRIVATE KEY', rsaPrivateKeyPkcs1Der(pki.signerKey)), 'utf8');
        await fs.writeFile(certPath, toPem('CERTIFICATE', pki.signerCert.raw), 'utf8');
        await fs.writeFile(rootPath, toPem('CERTIFICATE', pki.rootCert.raw), 'utf8');

        const paramsPath = path.join(dir, 'doc.json');
        basePdf = path.join(dir, 'doc.pdf');
        await fs.writeFile(paramsPath, minimalParams, 'utf8');
        await render(parseArgs(['--input', paramsPath, '--output', basePdf]));
    }, 60000);

    afterAll(async () => {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    });

    beforeEach(() => {
        setTimestampProvider(createMockTimestampProvider(createMockPki()));
    });

    afterEach(() => {
        setTimestampProvider(null);
    });

    function out(name: string): string {
        return path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    }

    async function signBase(extra: readonly string[] = []): Promise<string> {
        const signed = out('signed.pdf');
        await sign(parseArgs([
            '--input', basePdf, '--output', signed,
            '--key', keyPath, '--cert', certPath, '--cert-chain', rootPath,
            ...extra,
        ]));
        return signed;
    }

    async function verifyJson(pdf: string): Promise<EnrichedVerifyOutput> {
        const stdout = await captureStdout(() =>
            verify(parseArgs(['--input', pdf, '--format', 'json'])),
        );
        return JSON.parse(stdout) as EnrichedVerifyOutput;
    }

    async function addDocTimestamp(signed: string, extra: readonly string[] = []): Promise<string> {
        const stamped = out('lta.pdf');
        await docTimestamp(parseArgs([
            '--input', signed, '--output', stamped, '--url', 'http://tsa.mock.invalid/tsr',
            ...extra,
        ]));
        return stamped;
    }

    it('sign --digest sha384 → signatureValid with algorithm rsa-sha384', async () => {
        const result = await verifyJson(await signBase(['--digest', 'sha384']));
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('rsa-sha384');
        expect(result.allValid).toBe(true);
    });

    it('sign --digest sha512 → signatureValid with algorithm rsa-sha512', async () => {
        const result = await verifyJson(await signBase(['--digest', 'sha512']));
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.signatureAlgorithm).toBe('rsa-sha512');
        expect(result.allValid).toBe(true);
    });

    it('sign --profile pades (ETSI.CAdES.detached) verifies as fully valid', async () => {
        const result = await verifyJson(await signBase(['--profile', 'pades']));
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.subFilter).toBe('ETSI.CAdES.detached');
        expect(sig.integrity).toBe(true);
        expect(sig.signatureValid).toBe(true);
        expect(sig.isDocTimestamp).toBe(false);
        expect(result.allValid).toBe(true);
    });

    it('reports the signature fieldName (sign --field-name MonChamp)', async () => {
        const result = await verifyJson(await signBase(['--field-name', 'MonChamp']));
        expect(result.signatures).toHaveLength(1);
        expect(result.signatures[0]!.fieldName).toBe('MonChamp');
        expect(result.signatures[0]!.isDocTimestamp).toBe(false);
        expect(result.allValid).toBe(true);
    });

    it('sign --timestamp (mock TSA) → timestampPresent + timestampValid', async () => {
        const result = await verifyJson(await signBase(['--timestamp', 'http://tsa.mock.invalid/tsr']));
        expect(result.signatures).toHaveLength(1);
        const sig = result.signatures[0]!;
        expect(sig.signatureValid).toBe(true);
        expect(sig.timestampPresent).toBe(true);
        expect(sig.timestampValid).toBe(true);
        expect(sig.timestampTime).toBe('2026-02-01T12:00:00.000Z');
        expect(result.allValid).toBe(true);
    });

    it('doc-timestamp on a signed PDF → two entries, valid /DocTimeStamp, --strict exit 0', async () => {
        const stamped = await addDocTimestamp(await signBase());
        const result = await verifyJson(stamped);
        expect(result.signatures).toHaveLength(2);

        const [docSig, dts] = [result.signatures[0]!, result.signatures[1]!];
        expect(docSig.isDocTimestamp).toBe(false);
        expect(docSig.signatureValid).toBe(true);
        expect(docSig.integrity).toBe(true);

        expect(dts.isDocTimestamp).toBe(true);
        expect(dts.subFilter).toBe('ETSI.RFC3161');
        expect(dts.integrity).toBe(true); // messageImprint == hash(/ByteRange)
        expect(dts.signatureValid).toBe(true); // TSA token signature
        expect(dts.timestampPresent).toBe(true);
        expect(dts.timestampValid).toBe(true);
        expect(dts.timestampTime).toBe('2026-02-01T12:00:00.000Z');
        expect(result.allValid).toBe(true);

        // A valid B-LTA document must pass --strict (exit 0 = no throw).
        await captureStdout(() => verify(parseArgs(['--input', stamped, '--strict'])));
    });

    it('corrupted /DocTimeStamp byte range → imprint mismatch fails --strict with E_VERIFY_FAILED', async () => {
        const stamped = await addDocTimestamp(await signBase(), ['--field-name', 'TsField1']);

        // Flip one byte INSIDE the timestamped revision but OUTSIDE any
        // /Contents hex window: the last character of the /T (TsField1)
        // field-name literal, which only the /DocTimeStamp byte range covers
        // (the first signature's range ends before the appended revision).
        const bytes = await fs.readFile(stamped);
        const idx = bytes.indexOf(Buffer.from('TsField1', 'latin1'));
        expect(idx).toBeGreaterThan(0);
        bytes[idx + 7] = bytes[idx + 7]! ^ 0x01; // 'TsField1' → 'TsField0'
        const corrupted = out('lta-corrupted.pdf');
        await fs.writeFile(corrupted, bytes);

        const result = await verifyJson(corrupted);
        expect(result.signatures).toHaveLength(2);
        const dts = result.signatures.find((s) => s.isDocTimestamp)!;
        expect(dts.integrity).toBe(false);
        expect(result.allValid).toBe(false);
        // The original signature is untouched (its range predates the flip).
        const docSig = result.signatures.find((s) => !s.isDocTimestamp)!;
        expect(docSig.integrity).toBe(true);
        expect(docSig.signatureValid).toBe(true);

        const err = await captureStdout(() =>
            verify(parseArgs(['--input', corrupted, '--strict'])),
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).code).toBe(ErrorCode.VERIFY_FAILED);
    });
});
