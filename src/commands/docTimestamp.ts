// `pdfnative doc-timestamp` — append a PAdES B-LTA document timestamp
// (ISO 32000-2 §12.8.5): a `/Type /DocTimeStamp` signature field whose
// `/Contents` is a bare RFC 3161 TimeStampToken covering every byte of the
// current document, added as an incremental update (all earlier revisions
// stay byte-identical). On top of a B-LT document (signature + /DSS) this
// completes the B-LTA archival profile; re-timestamping before the TSA
// certificate expires extends the chain indefinitely.
//
// `--url <tsa>` is the explicit network opt-in (offline-by-default doctrine);
// the request goes through the SSRF-guarded TSA transport (src/utils/tsa.ts).

import { addDocumentTimestamp, getTimestampProvider, ensureCryptoReady } from '../core-bridge/index.js';
import type { AddDocumentTimestampOptions, CmsDigestAlgorithm } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { createTsaProvider } from '../utils/tsa.js';

const VALID_DIGESTS = new Set<CmsDigestAlgorithm>(['sha256', 'sha384', 'sha512']);

const DEFAULT_TIMEOUT_MS = 10_000;

function parseDigest(raw: string | undefined): CmsDigestAlgorithm {
    const digest = (raw ?? 'sha256') as CmsDigestAlgorithm;
    if (!VALID_DIGESTS.has(digest)) {
        throw new CliError(`Invalid --digest "${raw ?? ''}". Valid: sha256, sha384, sha512.`, 2);
    }
    return digest;
}

function parseTimeout(raw: string | undefined): number {
    if (raw === undefined) return DEFAULT_TIMEOUT_MS;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new CliError(`Invalid --timeout "${raw}". Expected a positive integer (milliseconds).`, 2);
    }
    return n;
}

function parsePlaceholderBytes(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new CliError(`Invalid --placeholder-bytes "${raw}". Expected a positive integer.`, 2);
    }
    return n;
}

function parseNonce(raw: string | undefined): bigint | undefined {
    if (raw === undefined) return undefined;
    const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
    if (hex.length === 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        throw new CliError(`Invalid --nonce "${raw}". Expected a hexadecimal value.`, 2);
    }
    return BigInt(`0x${hex}`);
}

/** Validate that the TSA URL is a well-formed http(s) URL. */
function assertHttpUrl(value: string): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new CliError(`Invalid --url "${value}".`, 2);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new CliError(`--url must be an http(s) URL, got "${url.protocol}".`, 2);
    }
}

export async function docTimestamp(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const url = getStringFlag(args.flags, 'url');
    const digest = parseDigest(getStringFlag(args.flags, 'digest'));
    const fieldName = getStringFlag(args.flags, 'field-name');
    const placeholderBytes = parsePlaceholderBytes(getStringFlag(args.flags, 'placeholder-bytes'));
    const nonce = parseNonce(getStringFlag(args.flags, 'nonce'));
    const timeoutMs = parseTimeout(getStringFlag(args.flags, 'timeout'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    // `--url` is the explicit network opt-in: the CLI is offline by default,
    // and a document timestamp requires an RFC 3161 round-trip to a TSA.
    if (url === undefined) {
        throw new CliError(
            'doc-timestamp requires --url <tsa>: appending a document timestamp contacts an '
            + 'RFC 3161 Time-Stamp Authority, and the CLI is offline by default. The explicit '
            + 'URL is the network opt-in.',
            2,
        );
    }
    assertHttpUrl(url);

    await ensureCryptoReady();
    const pdfBytes = new Uint8Array(await readFileOrStdin(inputPath));

    // Dry-run: URL and flags validated, PDF read. Stop before any network.
    if (dryRun) {
        emitStatus({ command: 'doc-timestamp', dryRun: true, digest, output: outputPath ?? '-' });
        return;
    }

    const options: { -readonly [K in keyof AddDocumentTimestampOptions]: AddDocumentTimestampOptions[K] } = {
        timestampProvider: getTimestampProvider() ?? createTsaProvider(url, { timeoutMs }),
        digestAlgorithm: digest,
    };
    if (fieldName !== undefined) options.fieldName = fieldName;
    if (placeholderBytes !== undefined) options.placeholderBytes = placeholderBytes;
    if (nonce !== undefined) options.timestampNonce = nonce;

    let out: Uint8Array;
    try {
        out = await addDocumentTimestamp(pdfBytes, options);
    } catch (e) {
        // Network failures surface as CliError E_NETWORK from the transport;
        // anything else is a malformed TSA response or PDF — keep it generic
        // (a hostile TSA must not inject text into CLI output).
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to add document timestamp: invalid TSA response or PDF.', 1, ErrorCode.PARSE);
    }

    await writeOutput(out, outputPath);
    emitStatus({
        command: 'doc-timestamp',
        dryRun: false,
        digest,
        output: outputPath ?? '-',
        bytes: out.length,
    });
}
