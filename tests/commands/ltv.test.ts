// `ltv` (PAdES B-LT) + `doc-timestamp` (PAdES B-LTA) — offline tests.
//
// A PDF is rendered and signed with the mock-PKI signer certificate (its
// AIA/CRL-DP extensions point at http://mock.invalid/... — the committed PEM
// fixtures carry none, and the LTV collector only queries certificates that
// advertise a revocation source). All OCSP/CRL/TSA round-trips are served by
// the in-process mock providers — ZERO network.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { sign } from '../../src/commands/sign.js';
import { ltv } from '../../src/commands/ltv.js';
import { docTimestamp } from '../../src/commands/docTimestamp.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import {
    setRevocationProvider,
    setTimestampProvider,
    listSignatures,
    openPdf,
    derSequence,
    derInteger,
} from '../../src/core-bridge/index.js';
import type { RsaPrivateKey } from '../../src/core-bridge/index.js';
import {
    createMockPki,
    createMockRevocationProvider,
    createMockTimestampProvider,
    toPem,
} from '../helpers/mock-pki.js';

// ── Fixtures ─────────────────────────────────────────────────────────

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

let dir: string;
let signedPdf: string;

beforeAll(async () => {
    const pki = createMockPki();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ltv-test-'));

    // PEM credentials from the mock signer (AIA/CRL URLs included).
    const keyPath = path.join(dir, 'signer-key.pem');
    const certPath = path.join(dir, 'signer-cert.pem');
    const rootPath = path.join(dir, 'root-cert.pem');
    await fs.writeFile(keyPath, toPem('RSA PRIVATE KEY', rsaPrivateKeyPkcs1Der(pki.signerKey)), 'utf8');
    await fs.writeFile(certPath, toPem('CERTIFICATE', pki.signerCert.raw), 'utf8');
    await fs.writeFile(rootPath, toPem('CERTIFICATE', pki.rootCert.raw), 'utf8');

    // Render → sign (the CMS embeds signer + root so the collector can build
    // the chain and the OCSP CertID).
    const paramsPath = path.join(dir, 'doc.json');
    const docPath = path.join(dir, 'doc.pdf');
    signedPdf = path.join(dir, 'signed.pdf');
    await fs.writeFile(
        paramsPath,
        JSON.stringify({ title: 'LTV Test', blocks: [{ type: 'paragraph', text: 'long-term validation' }] }),
        'utf8',
    );
    await render(parseArgs(['--input', paramsPath, '--output', docPath]));
    await sign(parseArgs([
        '--input', docPath, '--output', signedPdf,
        '--key', keyPath, '--cert', certPath, '--cert-chain', rootPath,
    ]));
}, 60000);

afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(() => {
    setRevocationProvider(createMockRevocationProvider(createMockPki()));
});

afterEach(() => {
    setRevocationProvider(null);
    setTimestampProvider(null);
    vi.restoreAllMocks();
});

function out(name: string): string {
    return path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
}

async function fileExists(p: string): Promise<boolean> {
    return fs.access(p).then(() => true, () => false);
}

interface LtvDataJson {
    readonly version: number;
    readonly certificates: readonly string[];
    readonly ocspResponses: readonly string[];
    readonly crls: readonly string[];
    readonly vri: readonly { readonly key: string; readonly certs: readonly number[]; readonly ocsps: readonly number[]; readonly crls: readonly number[] }[];
}

async function collectToFile(extra: readonly string[] = []): Promise<{ readonly jsonPath: string; readonly data: LtvDataJson }> {
    const jsonPath = out('ltv.json');
    await ltv(parseArgs(['collect', '--online', '--input', signedPdf, '--output', jsonPath, ...extra]));
    const data = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as LtvDataJson;
    return { jsonPath, data };
}

// ── ltv collect ──────────────────────────────────────────────────────

describe('ltv collect', () => {
    it('collects a version-1 ltv-data document with certificates and OCSP responses (prefer ocsp)', async () => {
        const { data } = await collectToFile(['--prefer', 'ocsp']);
        expect(data.version).toBe(1);
        expect(data.certificates.length).toBeGreaterThanOrEqual(1);
        expect(data.ocspResponses.length).toBeGreaterThanOrEqual(1);
        expect(data.vri.length).toBeGreaterThanOrEqual(1);
        // Every payload is valid base64 and the /VRI key is uppercase-hex SHA-1.
        for (const b64 of [...data.certificates, ...data.ocspResponses, ...data.crls]) {
            expect(Buffer.from(b64, 'base64').length).toBeGreaterThan(0);
        }
        expect(data.vri[0]?.key).toMatch(/^[0-9A-F]{40}$/);
    });

    it('refuses to run without --online and points at the offline `ltv embed` path', async () => {
        const err = await ltv(parseArgs(['collect', '--input', signedPdf, '--output', out('x.json')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
        expect((err as CliError).message).toContain('ltv embed');
    });

    it('still collects (and archives) responses for a REVOKED certificate — LTV records state, it does not judge it', async () => {
        // B-LT archives the revocation evidence as returned: a "revoked"
        // OCSP response is exactly what a later validator needs to prove the
        // certificate's status at archival time.
        setRevocationProvider(createMockRevocationProvider(createMockPki(), { revoked: true }));
        const { data } = await collectToFile();
        expect(data.version).toBe(1);
        expect(data.ocspResponses.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects an invalid --prefer value', async () => {
        await expect(
            ltv(parseArgs(['collect', '--online', '--input', signedPdf, '--prefer', 'dns'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('rejects an unknown subcommand and a missing subcommand', async () => {
        await expect(ltv(parseArgs(['harvest']))).rejects.toMatchObject({ exitCode: 2 });
        await expect(ltv(parseArgs([]))).rejects.toMatchObject({ exitCode: 2 });
    });
});

// ── ltv embed ────────────────────────────────────────────────────────

describe('ltv embed', () => {
    it('round-trips: collect → embed writes a /DSS dictionary into the PDF (fully offline)', async () => {
        const { jsonPath } = await collectToFile();
        // The embed phase must not need any provider — prove it.
        setRevocationProvider(null);

        const outPdf = out('ltv.pdf');
        await ltv(parseArgs(['embed', '--input', signedPdf, '--data', jsonPath, '--output', outPdf]));

        const bytes = await fs.readFile(outPdf);
        expect(bytes.toString('latin1')).toContain('/DSS');
        // Structural check through the library's own reader.
        const reader = openPdf(new Uint8Array(bytes));
        expect(reader.getCatalog().has('DSS')).toBe(true);
    });

    it('requires --data', async () => {
        await expect(
            ltv(parseArgs(['embed', '--input', signedPdf, '--output', out('x.pdf')])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('rejects an unsupported ltv-data version with E_INPUT', async () => {
        const { jsonPath, data } = await collectToFile();
        await fs.writeFile(jsonPath, JSON.stringify({ ...data, version: 2 }), 'utf8');
        await expect(
            ltv(parseArgs(['embed', '--input', signedPdf, '--data', jsonPath, '--output', out('x.pdf')])),
        ).rejects.toMatchObject({ code: ErrorCode.INPUT });
    });

    it('rejects invalid base64 payloads with E_PARSE', async () => {
        const { jsonPath, data } = await collectToFile();
        await fs.writeFile(jsonPath, JSON.stringify({ ...data, certificates: ['%%not-base64%%'] }), 'utf8');
        await expect(
            ltv(parseArgs(['embed', '--input', signedPdf, '--data', jsonPath, '--output', out('x.pdf')])),
        ).rejects.toMatchObject({ code: ErrorCode.PARSE });
    });

    it('rejects a non-JSON data file with E_PARSE', async () => {
        const jsonPath = out('bad.json');
        await fs.writeFile(jsonPath, 'not json at all {', 'utf8');
        await expect(
            ltv(parseArgs(['embed', '--input', signedPdf, '--data', jsonPath, '--output', out('x.pdf')])),
        ).rejects.toMatchObject({ code: ErrorCode.PARSE });
    });

    it('--dry-run validates the data but writes nothing', async () => {
        const { jsonPath } = await collectToFile();
        const outPdf = out('never.pdf');
        await ltv(parseArgs(['embed', '--input', signedPdf, '--data', jsonPath, '--output', outPdf, '--dry-run']));
        expect(await fileExists(outPdf)).toBe(false);
    });
});

// ── ltv add ──────────────────────────────────────────────────────────

describe('ltv add', () => {
    it('one-pass collect+embed produces a /DSS-equipped PDF', async () => {
        const outPdf = out('added.pdf');
        await ltv(parseArgs(['add', '--online', '--input', signedPdf, '--output', outPdf]));
        const bytes = await fs.readFile(outPdf);
        expect(bytes.toString('latin1')).toContain('/DSS');
        expect(openPdf(new Uint8Array(bytes)).getCatalog().has('DSS')).toBe(true);
    });

    it('refuses to run without --online and points at the offline `ltv embed` path', async () => {
        const err = await ltv(parseArgs(['add', '--input', signedPdf, '--output', out('x.pdf')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
        expect((err as CliError).message).toContain('ltv embed');
    });
});

// ── doc-timestamp ────────────────────────────────────────────────────

describe('doc-timestamp', () => {
    it('appends a /DocTimeStamp signature entry (mock TSA, zero network)', async () => {
        setTimestampProvider(createMockTimestampProvider(createMockPki()));
        const outPdf = out('lta.pdf');
        await docTimestamp(parseArgs([
            '--input', signedPdf, '--output', outPdf, '--url', 'http://tsa.mock.invalid/tsr',
        ]));
        const sigs = listSignatures(new Uint8Array(await fs.readFile(outPdf)));
        expect(sigs.some((s) => s.isDocTimestamp)).toBe(true);
        // The original signature is still listed alongside the timestamp.
        expect(sigs.some((s) => !s.isDocTimestamp)).toBe(true);
    });

    it('requires --url (explicit network opt-in)', async () => {
        const err = await docTimestamp(parseArgs(['--input', signedPdf, '--output', out('x.pdf')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('--dry-run never calls the provider and writes nothing', async () => {
        const getTimestamp = vi.fn(() => Promise.reject(new Error('network attempted')));
        setTimestampProvider({ getTimestamp });
        const outPdf = out('never.pdf');
        await docTimestamp(parseArgs([
            '--input', signedPdf, '--output', outPdf, '--url', 'http://tsa.mock.invalid/tsr', '--dry-run',
        ]));
        expect(getTimestamp).not.toHaveBeenCalled();
        expect(await fileExists(outPdf)).toBe(false);
    });

    it('rejects an invalid --digest and a non-http(s) --url', async () => {
        await expect(
            docTimestamp(parseArgs(['--input', signedPdf, '--url', 'http://tsa.mock.invalid/tsr', '--digest', 'md5'])),
        ).rejects.toMatchObject({ exitCode: 2 });
        await expect(
            docTimestamp(parseArgs(['--input', signedPdf, '--url', 'ftp://tsa.mock.invalid/tsr'])),
        ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('surfaces a malformed TSA response as E_PARSE (generic message)', async () => {
        setTimestampProvider({ getTimestamp: () => Promise.resolve(new Uint8Array([0x00, 0x01, 0x02])) });
        await expect(
            docTimestamp(parseArgs(['--input', signedPdf, '--output', out('x.pdf'), '--url', 'http://tsa.mock.invalid/tsr'])),
        ).rejects.toMatchObject({ code: ErrorCode.PARSE });
    });
});
