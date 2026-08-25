import {
    signPdfBytes,
    signPdfBytesWithTimestamp,
    addSignaturePlaceholder,
    estimateContentsSize,
    getTimestampProvider,
    ensureCryptoReady,
} from '../core-bridge/index.js';
import type {
    PdfSignOptions,
    PdfSignTimestampOptions,
    SignatureAlgorithm,
    AddSignaturePlaceholderOptions,
    CmsDigestAlgorithm,
    CmsProfile,
    X509Certificate,
} from '../core-bridge/index.js';
import { randomBytes } from 'node:crypto';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { createTsaProvider } from '../utils/tsa.js';
import {
    loadRsaPrivateKey,
    loadEcPrivateKey,
    loadCertificate,
    loadPem,
    loadPemChain,
    parseCertificateChain,
    createNativeCryptoProvider,
} from '../utils/keys.js';

const VALID_ALGORITHMS = new Set<SignatureAlgorithm>(['rsa-sha256', 'ecdsa-sha256']);

function parseSigningTime(raw: string): Date {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) {
        throw new CliError(`Invalid --signing-time "${raw}". Expected ISO 8601 (e.g. 2026-04-28T12:00:00Z).`, 2);
    }
    return t;
}

/** Validate that a flag value is a well-formed http(s) URL. */
function assertHttpUrl(value: string, flag: string): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new CliError(`Invalid --${flag} URL "${value}".`, 2);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new CliError(`--${flag} must be an http(s) URL, got "${url.protocol}".`, 2);
    }
}

/** Validate a CMS digest flag value (sha256 | sha384 | sha512). */
function parseCmsDigest(raw: string, flag: string): CmsDigestAlgorithm {
    if (raw === 'sha256' || raw === 'sha384' || raw === 'sha512') return raw;
    throw new CliError(`Invalid --${flag} "${raw}". Valid: sha256, sha384, sha512.`, 2);
}

/** Parse an RFC 3161 nonce from a hex string (optional 0x prefix). */
function parseNonceHex(raw: string): bigint {
    const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
    if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) {
        throw new CliError(
            `Invalid --timestamp-nonce "${raw}". Expected a hex string of at most 32 bytes (64 hex chars).`,
            2,
        );
    }
    return BigInt('0x' + hex);
}

/** Parse `--signature-rect "x1,y1,x2,y2"` into a 4-number tuple. */
function parseSignatureRect(raw: string): readonly [number, number, number, number] {
    const parts = raw.split(',').map((p) => p.trim());
    const nums = parts.map((p) => (p.length === 0 ? Number.NaN : Number(p)));
    const [x1, y1, x2, y2] = nums;
    if (nums.length !== 4 || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined
        || nums.some((n) => !Number.isFinite(n))) {
        throw new CliError(
            `Invalid --signature-rect "${raw}". Expected four comma-separated numbers "x1,y1,x2,y2".`,
            2,
        );
    }
    return [x1, y1, x2, y2];
}

/** Parse a strictly positive integer flag value. */
function parsePositiveInt(raw: string, flag: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
        throw new CliError(`Invalid --${flag} "${raw}". Expected a positive integer.`, 2);
    }
    return n;
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
    const timestampUrl = getStringFlag(args.flags, 'timestamp');
    const pureCrypto = hasFlag(args.flags, 'pure-crypto');
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (!VALID_ALGORITHMS.has(algorithm)) {
        throw new CliError(
            `Invalid --algorithm "${algorithm}". Valid: rsa-sha256, ecdsa-sha256.`,
            2,
        );
    }

    // ── Validate scalar flags up-front so usage errors (exit 2) are
    // reported before any I/O or expensive PEM parsing. ─────────────────

    // Sign-side RFC 3161 timestamping (PAdES B-T, pdfnative ≥ 1.7.0).
    if (timestampUrl !== undefined) {
        assertHttpUrl(timestampUrl, 'timestamp');
    }
    const timestampDigestRaw = getStringFlag(args.flags, 'timestamp-digest');
    const timestampDigest: CmsDigestAlgorithm = timestampDigestRaw !== undefined
        ? parseCmsDigest(timestampDigestRaw, 'timestamp-digest')
        : 'sha256';
    const timestampNonceRaw = getStringFlag(args.flags, 'timestamp-nonce');
    const explicitNonce = timestampNonceRaw !== undefined ? parseNonceHex(timestampNonceRaw) : undefined;

    // CMS message digest. pdfnative requires digestAlgorithm to match the
    // algorithm's implied digest, so sha384/sha512 promote rsa-sha256 to the
    // corresponding rsa-sha384/rsa-sha512 SignatureAlgorithm. ECDSA is
    // P-256/SHA-256 only.
    const digestRaw = getStringFlag(args.flags, 'digest');
    const digest = digestRaw !== undefined ? parseCmsDigest(digestRaw, 'digest') : undefined;
    let effectiveAlgorithm: SignatureAlgorithm = algorithm;
    if (digest !== undefined && digest !== 'sha256') {
        if (algorithm === 'ecdsa-sha256') {
            throw new CliError(
                `--digest ${digest} is not supported with ecdsa-sha256 (P-256 signatures are SHA-256 only).`,
                2,
            );
        }
        effectiveAlgorithm = digest === 'sha384' ? 'rsa-sha384' : 'rsa-sha512';
    }

    // CMS profile: classic PKCS#7 (default) or PAdES baseline (ETSI EN 319 142-1).
    const profileRaw = getStringFlag(args.flags, 'profile');
    let profile: CmsProfile | undefined;
    if (profileRaw !== undefined) {
        if (profileRaw !== 'pkcs7' && profileRaw !== 'pades') {
            throw new CliError(`Invalid --profile "${profileRaw}". Valid: pkcs7, pades.`, 2);
        }
        profile = profileRaw;
    }

    // Multi-signature / visible-signature placeholder flags (pdfnative 1.7.0).
    const allowMultiple = hasFlag(args.flags, 'allow-multiple');
    const fieldName = getStringFlag(args.flags, 'field-name');
    const signatureRectRaw = getStringFlag(args.flags, 'signature-rect');
    const signatureRect = signatureRectRaw !== undefined ? parseSignatureRect(signatureRectRaw) : undefined;
    const signaturePageRaw = getStringFlag(args.flags, 'signature-page');
    // CLI pages are 1-based; AddSignaturePlaceholderOptions.pageIndex is 0-based.
    const pageIndex = signaturePageRaw !== undefined
        ? parsePositiveInt(signaturePageRaw, 'signature-page') - 1
        : undefined;
    const placeholderBytesRaw = getStringFlag(args.flags, 'placeholder-bytes');
    const explicitPlaceholderBytes = placeholderBytesRaw !== undefined
        ? parsePositiveInt(placeholderBytesRaw, 'placeholder-bytes')
        : undefined;

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
        algorithm: effectiveAlgorithm,
    };
    // Signing engine. By default the CLI routes CMS signing through a native,
    // constant-time (side-channel-resistant) OpenSSL signer via node:crypto.
    // `--pure-crypto` forces pdfnative's pure-JS RSA/ECDSA math (useful for
    // reproducibility or environments without node:crypto).
    if (pureCrypto) {
        if (algorithm === 'ecdsa-sha256') {
            options.ecKey = await loadEcPrivateKey('PDFNATIVE_SIGN_KEY', keyPath, 'key');
        } else {
            options.rsaKey = await loadRsaPrivateKey('PDFNATIVE_SIGN_KEY', keyPath, 'key');
        }
    } else {
        const keyPem = await loadPem('PDFNATIVE_SIGN_KEY', keyPath, 'private key', 'key');
        options.provider = createNativeCryptoProvider(keyPem);
    }
    if (certChain !== undefined) options.certChain = certChain;
    if (reason !== undefined) options.reason = reason;
    if (name !== undefined) options.name = name;
    if (location !== undefined) options.location = location;
    if (contactInfo !== undefined) options.contactInfo = contactInfo;
    if (signingTime !== undefined) options.signingTime = signingTime;
    if (digest !== undefined) options.digestAlgorithm = digest;
    if (profile !== undefined) options.profile = profile;
    if (fieldName !== undefined) options.fieldName = fieldName;
    // PAdES pairing (ETSI EN 319 142-1): the CMS `pades` profile goes with the
    // /SubFilter ETSI.CAdES.detached declared in the /Sig dictionary.
    if (profile === 'pades') options.subFilter = 'ETSI.CAdES.detached';

    // ── Placeholder options (only passed when a 1.7.0 feature is used, so
    // the legacy no-flag path stays byte-identical). ─────────────────────
    const placeholderOptions: {
        -readonly [K in keyof AddSignaturePlaceholderOptions]: AddSignaturePlaceholderOptions[K];
    } = {};
    let usePlaceholderOptions = false;
    if (allowMultiple) {
        placeholderOptions.allowMultiple = true;
        usePlaceholderOptions = true;
    }
    if (fieldName !== undefined) {
        placeholderOptions.fieldName = fieldName;
        usePlaceholderOptions = true;
    }
    if (pageIndex !== undefined) {
        placeholderOptions.pageIndex = pageIndex;
        usePlaceholderOptions = true;
    }
    if (signatureRect !== undefined) {
        placeholderOptions.rect = signatureRect;
        usePlaceholderOptions = true;
    }
    if (profile === 'pades') {
        placeholderOptions.metadata = { subFilter: 'ETSI.CAdES.detached' };
        usePlaceholderOptions = true;
    }
    // /Contents sizing: an explicit --placeholder-bytes wins; otherwise a
    // timestamped signature reserves room for the RFC 3161 token (the TSA's
    // certificate chain rides inside the CMS unsigned attributes).
    if (explicitPlaceholderBytes !== undefined) {
        placeholderOptions.placeholderBytes = explicitPlaceholderBytes;
        usePlaceholderOptions = true;
    } else if (timestampUrl !== undefined) {
        const certSizes = [signerCert, ...(certChain ?? [])].map((c: X509Certificate) => c.raw.length);
        placeholderOptions.placeholderBytes = estimateContentsSize(certSizes, effectiveAlgorithm, { timestamp: true });
        usePlaceholderOptions = true;
    }

    // Auto-inject a signature placeholder when the input PDF doesn't already
    // carry one (the common case for `pdfnative render`-produced PDFs, which
    // ship no AcroForm). pdfnative's addSignaturePlaceholder is idempotent:
    // a PDF that already carries a /FT /Sig widget is returned unchanged
    // (unless --allow-multiple opts into the multi-signature flow).
    try {
        pdfBytes = usePlaceholderOptions
            ? addSignaturePlaceholder(pdfBytes, placeholderOptions)
            : addSignaturePlaceholder(pdfBytes);
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to prepare PDF for signing.', 1, ErrorCode.SIGN);
    }

    // Dry-run: credentials parsed, PDF read and placeholder-prepared. Stop
    // before producing (or writing) a signature — and before ANY network
    // byte moves: with --timestamp the TSA is never contacted on a dry-run
    // (the URL is only validated above). No key material is touched beyond
    // the validation already performed.
    if (dryRun) {
        const envelope: Record<string, unknown> = {
            command: 'sign',
            dryRun: true,
            algorithm,
            output: outputPath ?? '-',
        };
        if (timestampUrl !== undefined) {
            envelope['timestamp'] = { url: timestampUrl, digest: timestampDigest };
        }
        emitStatus(envelope);
        return;
    }

    let signedBytes: Uint8Array;
    if (timestampUrl !== undefined) {
        // PAdES B-T path: sign, then obtain an RFC 3161 timestamp over the CMS
        // signature value and embed it as an unsigned attribute. A globally
        // injected provider (setTimestampProvider — the tests' seam) beats the
        // CLI's SSRF-guarded HTTP transport. NEVER falls back to an
        // untimestamped signature: any TSA failure aborts the command.
        const timestampProvider = getTimestampProvider() ?? createTsaProvider(timestampUrl);
        const timestampNonce = explicitNonce ?? BigInt('0x' + randomBytes(8).toString('hex'));
        const tsOptions: PdfSignTimestampOptions = {
            ...options,
            timestampProvider,
            timestampDigestAlgorithm: timestampDigest,
            timestampNonce,
        };
        try {
            signedBytes = await signPdfBytesWithTimestamp(pdfBytes, tsOptions);
        } catch (e) {
            // CliError = transport failure from the TSA provider (E_NETWORK).
            if (e instanceof CliError) throw e;
            // Anything else is a rejected/malformed TSA response (or a signing
            // failure). Generic message — never echo TSA bytes or key material.
            throw new CliError(
                'Failed to produce a timestamped signature: the TSA response was rejected or could not be parsed.',
                1,
                ErrorCode.PARSE,
            );
        }
    } else {
        try {
            signedBytes = signPdfBytes(pdfBytes, options);
        } catch (e) {
            // Never include the underlying message — it may reference key bytes or hashes.
            if (e instanceof CliError) throw e;
            throw new CliError('Failed to sign PDF.', 1, ErrorCode.SIGN);
        }
    }
    await writeOutput(signedBytes, outputPath);
    const envelope: Record<string, unknown> = {
        command: 'sign',
        dryRun: false,
        algorithm,
        output: outputPath ?? '-',
        bytes: signedBytes.length,
    };
    if (timestampUrl !== undefined) {
        envelope['timestamp'] = { url: timestampUrl, digest: timestampDigest };
    }
    emitStatus(envelope);
}
