// PEM key/certificate loading helpers shared by `sign` and `verify`.
//
// Security invariants:
//   - PEM bodies and DER bytes NEVER appear in any thrown error message.
//   - Path-traversal validated for every file path.
//   - Env-var precedence over file paths (avoids accidental disk persistence).

import { readFile } from 'node:fs/promises';
import {
    parseRsaPrivateKey,
    parseCertificate,
    derDecode,
} from '../core-bridge/index.js';
import type {
    RsaPrivateKey,
    EcPrivateKey,
    X509Certificate,
    Asn1Node,
} from '../core-bridge/index.js';
import { validatePath } from './io.js';
import { CliError } from './error.js';

/**
 * Decode a PEM-encoded block to DER bytes.
 * Strips -----BEGIN ...-----/-----END ...----- headers and base64-decodes.
 *
 * Accepts a single concatenated PEM string containing one OR more blocks
 * (returns the concatenation in DER form is NOT supported — call splitPemBlocks
 * first if you need multiple blocks).
 */
export function pemToDer(pem: string): Uint8Array {
    const body = pem
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s+/g, '');
    const binaryStr = atob(body);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}

/** Split a concatenated PEM string into individual blocks (preserving headers). */
export function splitPemBlocks(pem: string): string[] {
    const re = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
    const matches = pem.match(re);
    return matches ?? [];
}

/**
 * Load PEM content from an environment variable or a file path.
 * Environment variable wins (security best practice for CI/CD).
 *
 * @param envVar  Name of the env var that may contain the PEM string.
 * @param filePath Optional file path from a CLI flag.
 * @param label   Human-readable label used in error messages (e.g. "private key").
 * @param flagName CLI flag name used in error messages (e.g. "key").
 */
export async function loadPem(
    envVar: string,
    filePath: string | undefined,
    label: string,
    flagName: string,
): Promise<string> {
    const fromEnv = process.env[envVar];
    if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv;
    if (filePath !== undefined) {
        validatePath(filePath);
        return readFile(filePath, 'utf8');
    }
    throw new CliError(
        `Missing ${label}. Provide $${envVar} (env) or --${flagName} <path>.`,
        2,
    );
}

/** Load multiple PEM blocks from repeated `--cert-chain` flags or a single env var. */
export async function loadPemChain(
    envVar: string,
    filePaths: readonly string[],
): Promise<string[]> {
    const blocks: string[] = [];
    const fromEnv = process.env[envVar];
    if (fromEnv !== undefined && fromEnv.trim().length > 0) {
        blocks.push(...splitPemBlocks(fromEnv));
    }
    for (const filePath of filePaths) {
        validatePath(filePath);
        const content = await readFile(filePath, 'utf8');
        const split = splitPemBlocks(content);
        if (split.length === 0) {
            // File without standard PEM markers — treat as a single PEM block.
            blocks.push(content);
        } else {
            blocks.push(...split);
        }
    }
    return blocks;
}

/**
 * Load and parse an RSA private key from PEM (env or file).
 * Never includes raw key material in error messages.
 */
export async function loadRsaPrivateKey(
    envVar: string,
    filePath: string | undefined,
    flagName: string,
): Promise<RsaPrivateKey> {
    const pem = await loadPem(envVar, filePath, 'private key', flagName);
    try {
        return parseRsaPrivateKey(pemToDer(pem));
    } catch {
        throw new CliError(
            'Failed to parse RSA private key. Verify the file is a valid PEM-encoded PKCS#8 RSA key.',
            1,
        );
    }
}

// ── EC private key parsing (P-256 only) ─────────────────────────────────────
//
// pdfnative v1.1.0 does not (yet) ship `parseEcPrivateKey`. To deliver the
// v0.3.0 ECDSA-signing roadmap item we ship a small CLI-local PKCS#8 / SEC1
// parser that uses pdfnative's already-exported `derDecode` for all ASN.1
// work. Scope is intentionally minimal:
//   • SEC1 — RFC 5915 — ECPrivateKey ::= SEQUENCE { version INTEGER (1),
//                                                  privateKey OCTET STRING,
//                                                  [0] parameters? OID,
//                                                  [1] publicKey? BIT STRING }
//   • PKCS#8 — RFC 5208 — PrivateKeyInfo wraps SEC1 in an OCTET STRING.
// Curve is constrained to P-256 (secp256r1, OID 1.2.840.10045.3.1.7) — the
// only curve `ecdsa-sha256` accepts in pdfnative's CMS builder.

const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const OID_P256 = '1.2.840.10045.3.1.7';

/** Decode an ASN.1 OID node value to dotted-decimal string. Returns null when not OID-shaped. */
function oidToString(node: Asn1Node): string | null {
    if (node.tag !== 0x06) return null;
    const bytes = node.value;
    if (bytes.length === 0) return null;
    const first = bytes[0] as number;
    const parts: number[] = [Math.floor(first / 40), first % 40];
    let v = 0;
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i] as number;
        v = (v << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            parts.push(v);
            v = 0;
        }
    }
    return parts.join('.');
}

/** Find the first descendant OID node matching `oidStr`. */
function containsOid(node: Asn1Node, oidStr: string): boolean {
    if (oidToString(node) === oidStr) return true;
    for (const child of node.children) {
        if (containsOid(child, oidStr)) return true;
    }
    return false;
}

/** Big-endian byte array → BigInt. */
function bytesToBigInt(bytes: Uint8Array): bigint {
    let v = 0n;
    for (let i = 0; i < bytes.length; i++) {
        v = (v << 8n) | BigInt(bytes[i] as number);
    }
    return v;
}

/**
 * Parse a SEC1 / PKCS#8 EC private key DER blob into an `EcPrivateKey`.
 * Throws a generic CliError on any structural failure (no key bytes leak).
 *
 * @internal exported for unit tests.
 */
export function parseEcPrivateKeyDer(der: Uint8Array): EcPrivateKey {
    const root = derDecode(der);
    if (root.tag !== 0x30 || root.children.length < 2) {
        throw new CliError('Invalid EC private key: not an ASN.1 SEQUENCE.', 1);
    }

    // PKCS#8 wrapping detection: PrivateKeyInfo ::= SEQUENCE { version INTEGER,
    //   privateKeyAlgorithm AlgorithmIdentifier, privateKey OCTET STRING }.
    // SEC1 ECPrivateKey starts with version INTEGER (1) then OCTET STRING d.
    let sec1: Asn1Node;
    const second = root.children[1] as Asn1Node;
    if (second.tag === 0x30) {
        // PKCS#8: second child is AlgorithmIdentifier SEQUENCE.
        if (!containsOid(second, OID_EC_PUBLIC_KEY)) {
            throw new CliError('EC private key algorithm is not id-ecPublicKey.', 1);
        }
        if (!containsOid(second, OID_P256)) {
            throw new CliError(
                'Unsupported EC curve. Only P-256 (secp256r1) is supported in v0.3.0.',
                1,
            );
        }
        const inner = root.children[2] as Asn1Node | undefined;
        if (inner === undefined || inner.tag !== 0x04) {
            throw new CliError('Invalid PKCS#8 EC private key: missing inner OCTET STRING.', 1);
        }
        sec1 = derDecode(inner.value);
    } else if (second.tag === 0x04) {
        // SEC1 ECPrivateKey directly.
        sec1 = root;
        if (!containsOid(root, OID_P256)) {
            throw new CliError(
                'Unsupported EC curve. Only P-256 (secp256r1) is supported in v0.3.0.',
                1,
            );
        }
    } else {
        throw new CliError('Unrecognised EC private key DER structure.', 1);
    }

    if (sec1.tag !== 0x30 || sec1.children.length < 2) {
        throw new CliError('Invalid SEC1 EC private key.', 1);
    }
    const dOctet = sec1.children[1] as Asn1Node;
    if (dOctet.tag !== 0x04 || dOctet.value.length === 0 || dOctet.value.length > 32) {
        throw new CliError('Invalid SEC1 EC private key: bad scalar OCTET STRING.', 1);
    }
    const d = bytesToBigInt(dOctet.value);
    if (d === 0n) {
        throw new CliError('Invalid SEC1 EC private key: zero scalar.', 1);
    }
    return { d };
}

/**
 * Load and parse an EC P-256 private key from PEM (env or file).
 * Accepts both `-----BEGIN EC PRIVATE KEY-----` (SEC1) and
 * `-----BEGIN PRIVATE KEY-----` (PKCS#8) wrappings.
 * Never includes raw key material in error messages.
 */
export async function loadEcPrivateKey(
    envVar: string,
    filePath: string | undefined,
    flagName: string,
): Promise<EcPrivateKey> {
    const pem = await loadPem(envVar, filePath, 'private key', flagName);
    try {
        return parseEcPrivateKeyDer(pemToDer(pem));
    } catch (e) {
        if (e instanceof CliError) throw e; // preserve specific curve/wrapping messages
        throw new CliError(
            'Failed to parse EC private key. Verify the file is a valid PEM-encoded P-256 key (SEC1 or PKCS#8).',
            1,
        );
    }
}

/**
 * Load and parse an X.509 certificate from PEM (env or file).
 * Never includes raw certificate bytes in error messages.
 */
export async function loadCertificate(
    envVar: string,
    filePath: string | undefined,
    flagName: string,
): Promise<X509Certificate> {
    const pem = await loadPem(envVar, filePath, 'certificate', flagName);
    try {
        return parseCertificate(pemToDer(pem));
    } catch {
        throw new CliError(
            'Failed to parse X.509 certificate. Verify the file is valid PEM-encoded.',
            1,
        );
    }
}

/** Parse a concatenated certificate chain (PEM blocks) into X509Certificate[]. */
export function parseCertificateChain(pemBlocks: readonly string[]): X509Certificate[] {
    const out: X509Certificate[] = [];
    for (const pem of pemBlocks) {
        try {
            out.push(parseCertificate(pemToDer(pem)));
        } catch {
            throw new CliError('Failed to parse certificate in chain.', 1);
        }
    }
    return out;
}
