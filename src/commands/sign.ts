import { signPdfBytes, ensureCryptoReady } from '../core-bridge/index.js';
import type { PdfSignOptions, SignatureAlgorithm } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll } from '../utils/args.js';
import { readFileOrStdin, writeOutput } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import {
    loadRsaPrivateKey,
    loadEcPrivateKey,
    loadCertificate,
    loadPemChain,
    parseCertificateChain,
} from '../utils/keys.js';
import {
    hasSignaturePlaceholder,
    injectSignaturePlaceholder,
} from '../utils/sign-placeholder.js';

const VALID_ALGORITHMS = new Set<SignatureAlgorithm>(['rsa-sha256', 'ecdsa-sha256']);

function parseSigningTime(raw: string): Date {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) {
        throw new CliError(`Invalid --signing-time "${raw}". Expected ISO 8601 (e.g. 2026-04-28T12:00:00Z).`, 2);
    }
    return t;
}

export async function sign(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const keyPath = getStringFlag(args.flags, 'key');
    const certPath = getStringFlag(args.flags, 'cert');
    const algorithm = (getStringFlag(args.flags, 'algorithm') ?? 'rsa-sha256') as SignatureAlgorithm;
    const reason = getStringFlag(args.flags, 'reason');
    const name = getStringFlag(args.flags, 'name');
    const location = getStringFlag(args.flags, 'location');
    const contactInfo = getStringFlag(args.flags, 'contact');
    const signingTimeRaw = getStringFlag(args.flags, 'signing-time');
    const chainPaths = getStringFlagAll(args.flags, 'cert-chain');

    if (!VALID_ALGORITHMS.has(algorithm)) {
        throw new CliError(
            `Invalid --algorithm "${algorithm}". Valid: rsa-sha256, ecdsa-sha256.`,
            2,
        );
    }

    // Validate scalar flags up-front so usage errors (exit 2) are reported
    // before any I/O or expensive PEM parsing.
    const signingTime = signingTimeRaw !== undefined ? parseSigningTime(signingTimeRaw) : undefined;

    // Pre-flight: assert credentials are reachable BEFORE doing any expensive parsing.
    // This guarantees a usage error (exit 2) is reported when a flag/env var is missing,
    // even if a partial set of credentials would parse successfully.
    if (process.env['PDFNATIVE_SIGN_KEY'] === undefined && keyPath === undefined) {
        throw new CliError('Missing private key. Provide $PDFNATIVE_SIGN_KEY (env) or --key <path>.', 2);
    }
    if (process.env['PDFNATIVE_SIGN_CERT'] === undefined && certPath === undefined) {
        throw new CliError('Missing certificate. Provide $PDFNATIVE_SIGN_CERT (env) or --cert <path>.', 2);
    }

    // Async crypto bootstrap MUST run before any RSA/ECDSA key parsing.
    // pdfnative throws "ASN.1 module must be imported" otherwise.
    await ensureCryptoReady();

    const pdfBuf = await readFileOrStdin(inputPath);
    let pdfBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(pdfBuf);

    // Load credentials. Env vars beat file flags (OWASP best practice).
    const signerCert = await loadCertificate('PDFNATIVE_SIGN_CERT', certPath, 'cert');

    // Optional intermediate-CA chain
    const chainPemBlocks = await loadPemChain('PDFNATIVE_SIGN_CHAIN', chainPaths);
    const certChain = chainPemBlocks.length > 0 ? parseCertificateChain(chainPemBlocks) : undefined;

    const options: { -readonly [K in keyof PdfSignOptions]: PdfSignOptions[K] } = {
        signerCert,
        algorithm,
    };
    if (algorithm === 'ecdsa-sha256') {
        options.ecKey = await loadEcPrivateKey('PDFNATIVE_SIGN_KEY', keyPath, 'key');
    } else {
        options.rsaKey = await loadRsaPrivateKey('PDFNATIVE_SIGN_KEY', keyPath, 'key');
    }
    if (certChain !== undefined) options.certChain = certChain;
    if (reason !== undefined) options.reason = reason;
    if (name !== undefined) options.name = name;
    if (location !== undefined) options.location = location;
    if (contactInfo !== undefined) options.contactInfo = contactInfo;
    if (signingTime !== undefined) options.signingTime = signingTime;

    // Auto-inject a signature placeholder when the input PDF doesn't already
    // carry one (the common case for `pdfnative render`-produced PDFs, which
    // ship no AcroForm). Idempotent: a pre-prepared PDF is signed as-is.
    if (!hasSignaturePlaceholder(pdfBytes)) {
        try {
            const injected = injectSignaturePlaceholder(pdfBytes, options);
            pdfBytes = injected.bytes;
        } catch (e) {
            if (e instanceof CliError) throw e;
            throw new CliError('Failed to prepare PDF for signing.', 1);
        }
    }

    let signedBytes: Uint8Array;
    try {
        signedBytes = signPdfBytes(pdfBytes, options);
    } catch (e) {
        // Never include the underlying message — it may reference key bytes or hashes.
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to sign PDF.', 1);
    }
    await writeOutput(signedBytes, outputPath);
}
