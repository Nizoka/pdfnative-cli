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
} from '../core-bridge/index.js';
import type {
    RsaPrivateKey,
    X509Certificate,
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
