import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
    pemToDer,
    splitPemBlocks,
    loadPem,
    loadPemChain,
    parseEcPrivateKeyDer,
    parseCertificateChain,
} from '../../src/utils/keys.js';
import { CliError } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    for (const f of tmp.splice(0)) await fs.unlink(f).catch(() => undefined);
    delete process.env['TEST_PEM_ENV'];
    delete process.env['TEST_CHAIN_ENV'];
});

const FAKE_PEM = `-----BEGIN CERTIFICATE-----
SGVsbG8gV29ybGQ=
-----END CERTIFICATE-----`;

const FAKE_PEM_2 = `-----BEGIN CERTIFICATE-----
QW5vdGhlciBibG9jaw==
-----END CERTIFICATE-----`;

describe('pemToDer', () => {
    it('decodes a single PEM block to DER bytes', () => {
        const der = pemToDer(FAKE_PEM);
        // base64 "SGVsbG8gV29ybGQ=" → "Hello World"
        expect(new TextDecoder().decode(der)).toBe('Hello World');
    });

    it('handles whitespace and CR/LF inside body', () => {
        const messy = '-----BEGIN X-----\r\nSGVs\r\nbG8g\r\nV29ybGQ=\r\n-----END X-----';
        expect(new TextDecoder().decode(pemToDer(messy))).toBe('Hello World');
    });
});

describe('splitPemBlocks', () => {
    it('returns single block', () => {
        expect(splitPemBlocks(FAKE_PEM)).toHaveLength(1);
    });

    it('returns multiple concatenated blocks', () => {
        const concat = `${FAKE_PEM}\n${FAKE_PEM_2}`;
        expect(splitPemBlocks(concat)).toHaveLength(2);
    });

    it('returns empty array when no markers found', () => {
        expect(splitPemBlocks('garbage')).toEqual([]);
    });
});

describe('loadPem — env precedence', () => {
    it('throws CliError(2) when neither env nor file given', async () => {
        const err = await loadPem('TEST_PEM_ENV', undefined, 'private key', 'key').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });

    it('reads PEM from env when set', async () => {
        process.env['TEST_PEM_ENV'] = FAKE_PEM;
        const pem = await loadPem('TEST_PEM_ENV', undefined, 'private key', 'key');
        expect(pem).toBe(FAKE_PEM);
    });

    it('env wins over file path', async () => {
        process.env['TEST_PEM_ENV'] = FAKE_PEM;
        // Pass a non-existent path — env must be used so no ENOENT
        const pem = await loadPem('TEST_PEM_ENV', '/nonexistent.pem', 'private key', 'key');
        expect(pem).toBe(FAKE_PEM);
    });

    it('reads from file when env is unset', async () => {
        const p = path.join(os.tmpdir(), `key-${Date.now()}.pem`);
        tmp.push(p);
        await fs.writeFile(p, FAKE_PEM, 'utf8');
        const pem = await loadPem('TEST_PEM_ENV', p, 'cert', 'cert');
        expect(pem).toBe(FAKE_PEM);
    });

    it('error message never contains key body', async () => {
        const err = await loadPem('TEST_PEM_ENV', undefined, 'private key', 'key').catch((e: unknown) => e);
        expect((err as Error).message).not.toContain('SGVsbG8');
    });
});

describe('loadPemChain', () => {
    it('returns empty when no env and no paths', async () => {
        const blocks = await loadPemChain('TEST_CHAIN_ENV', []);
        expect(blocks).toEqual([]);
    });

    it('splits env var with multiple PEM blocks', async () => {
        process.env['TEST_CHAIN_ENV'] = `${FAKE_PEM}\n${FAKE_PEM_2}`;
        const blocks = await loadPemChain('TEST_CHAIN_ENV', []);
        expect(blocks).toHaveLength(2);
    });

    it('reads multiple files', async () => {
        const p1 = path.join(os.tmpdir(), `c1-${Date.now()}.pem`);
        const p2 = path.join(os.tmpdir(), `c2-${Date.now()}.pem`);
        tmp.push(p1, p2);
        await fs.writeFile(p1, FAKE_PEM, 'utf8');
        await fs.writeFile(p2, FAKE_PEM_2, 'utf8');
        const blocks = await loadPemChain('TEST_CHAIN_ENV', [p1, p2]);
        expect(blocks).toHaveLength(2);
    });

    it('combines env + files', async () => {
        process.env['TEST_CHAIN_ENV'] = FAKE_PEM;
        const p = path.join(os.tmpdir(), `c-${Date.now()}.pem`);
        tmp.push(p);
        await fs.writeFile(p, FAKE_PEM_2, 'utf8');
        const blocks = await loadPemChain('TEST_CHAIN_ENV', [p]);
        expect(blocks).toHaveLength(2);
    });
});

describe('parseEcPrivateKeyDer — error paths', () => {
    it('throws when DER is not a SEQUENCE', () => {
        // INTEGER 0x05
        expect(() => parseEcPrivateKeyDer(new Uint8Array([0x02, 0x01, 0x05])))
            .toThrow(CliError);
    });

    it('throws when SEQUENCE has fewer than 2 children', () => {
        // SEQUENCE { INTEGER 1 }
        expect(() => parseEcPrivateKeyDer(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01])))
            .toThrow(CliError);
    });

    it('throws on an unrecognised second-child tag (not SEQUENCE/OCTET-STRING)', () => {
        // SEQUENCE { INTEGER 1, INTEGER 2 } — second child INTEGER (not 0x30 / 0x04)
        const der = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
        expect(() => parseEcPrivateKeyDer(der)).toThrow(/Unrecognised|EC private key/);
    });

    it('throws on PKCS#8 wrapping with non-EC algorithm OID', () => {
        // SEQUENCE { INTEGER 0,
        //           SEQUENCE { OID 1.2.840.113549.1.1.1 (rsaEncryption), NULL },
        //           OCTET STRING (empty) }
        const oidRsa = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
        const algId = [0x30, oidRsa.length + 2, ...oidRsa, 0x05, 0x00];
        const inner = [0x04, 0x00];
        const seq = [0x02, 0x01, 0x00, ...algId, ...inner];
        const der = new Uint8Array([0x30, seq.length, ...seq]);
        const err = (() => { try { parseEcPrivateKeyDer(der); return null; } catch (e) { return e; } })();
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).message).toMatch(/id-ecPublicKey|EC private key/);
    });
});

describe('parseCertificateChain', () => {
    it('returns empty array for empty input', () => {
        expect(parseCertificateChain([])).toEqual([]);
    });

    it('throws CliError when a chain block is not a valid certificate', () => {
        const garbage = '-----BEGIN CERTIFICATE-----\nSGVsbG8=\n-----END CERTIFICATE-----';
        expect(() => parseCertificateChain([garbage])).toThrow(CliError);
    });

    it('error message never echoes the PEM body', () => {
        const garbage = '-----BEGIN CERTIFICATE-----\nU0VDUkVUU0VDUkVU\n-----END CERTIFICATE-----';
        try {
            parseCertificateChain([garbage]);
        } catch (e) {
            expect((e as Error).message).not.toContain('SECRETSECRET');
            expect((e as Error).message).not.toContain('U0VDUkVU');
        }
    });
});
