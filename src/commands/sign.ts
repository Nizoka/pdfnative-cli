import { readFile } from 'node:fs/promises';
import {
    signPdfBytes,
    parseCertificate,
    parseRsaPrivateKey,
} from '../core-bridge/index.js';
import type { PdfSignOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, validatePath } from '../utils/io.js';
import { CliError } from '../utils/error.js';

/**
 * Decode a PEM-encoded block to DER bytes.
 * Strips -----BEGIN ...-----/-----END ...----- headers and base64-decodes.
 */
function pemToDer(pem: string): Uint8Array {
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

/**
 * Load a PEM string from an environment variable or a file path.
 * Environment variable takes precedence over the file flag (security best practice).
 *
 * @param envVar  - Name of the env var containing the PEM string.
 * @param filePath - File path from a CLI flag.
 * @param label   - Human-readable label for error messages (e.g. "private key").
 */
async function loadPem(
    envVar: string,
    filePath: string | undefined,
    label: string,
): Promise<string> {
    const fromEnv = process.env[envVar];
    if (fromEnv !== undefined && fromEnv.trim().length > 0) {
        return fromEnv;
    }
    if (filePath !== undefined) {
        validatePath(filePath);
        const buf = await readFile(filePath, 'utf8');
        return buf;
    }
    throw new CliError(
        `Missing ${label}. Provide $${envVar} (env) or --${label.replace(/ /g, '-')} <path>.`,
        2,
    );
}

export async function sign(args: ParsedArgs): Promise<void> {
    // --input is required for sign (no stdin for PDF to avoid accidental pipe issues)
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const keyPath = getStringFlag(args.flags, 'key');
    const certPath = getStringFlag(args.flags, 'cert');

    const pdfBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(pdfBuf);

    // Load secrets — env vars take precedence over file flags (OWASP: avoid key exposure)
    const privateKeyPem = await loadPem('PDFNATIVE_SIGN_KEY', keyPath, 'private key');
    const certPem = await loadPem('PDFNATIVE_SIGN_CERT', certPath, 'certificate');

    // Parse keys — never include raw key material in error messages
    let options: PdfSignOptions;
    try {
        const keyDer = pemToDer(privateKeyPem);
        const certDer = pemToDer(certPem);
        const rsaKey = parseRsaPrivateKey(keyDer);
        const signerCert = parseCertificate(certDer);
        options = { rsaKey, signerCert, algorithm: 'rsa-sha256' };
    } catch {
        // Do NOT include key material or PEM content in the error message
        throw new CliError('Failed to parse signing credentials. Verify key and certificate are valid PEM-encoded files.', 1);
    }

    const signedBytes = signPdfBytes(pdfBytes, options);
    await writeOutput(signedBytes, outputPath);
}
