// RFC 3161 Time-Stamp Authority transport (opt-in network, SSRF-guarded).
//
// pdfnative's engine never opens a socket: `signPdfBytesWithTimestamp` and
// `addDocumentTimestamp` take an injected TimestampProvider. This module is
// the CLI-side transport — a single guarded HTTP(S) POST of the DER
// TimeStampReq (`application/timestamp-query`), returning the raw DER
// TimeStampResp for the engine to parse and verify.
//
// Network happens ONLY when the user passed an explicit TSA URL
// (`sign --timestamp <url>` / `doc-timestamp --url <url>`), and every
// request goes through the same SSRF guard as `verify --revocation online`.

import type { TimestampProvider } from '../core-bridge/index.js';
import { guardedFetch, FetchGuardError } from './fetch-guard.js';
import { CliError, ErrorCode } from './error.js';

export interface TsaProviderOptions {
    /** Request timeout in milliseconds. Default 10000 (fetch-guard default). */
    readonly timeoutMs?: number;
}

/**
 * Build a {@link TimestampProvider} that POSTs the TimeStampReq to `url`.
 *
 * Failures are deliberately generic (`E_NETWORK`) and never include response
 * bodies — a hostile TSA must not be able to inject text into CLI output.
 */
export function createTsaProvider(url: string, options: TsaProviderOptions = {}): TimestampProvider {
    return {
        async getTimestamp(request: Uint8Array): Promise<Uint8Array> {
            let result;
            try {
                result = await guardedFetch(url, {
                    method: 'POST',
                    body: request,
                    contentType: 'application/timestamp-query',
                    accept: 'application/timestamp-reply',
                    timeoutMs: options.timeoutMs,
                });
            } catch (err) {
                const reason = err instanceof FetchGuardError ? `: ${err.message}` : '';
                throw new CliError(`timestamp authority request failed${reason}`, 1, ErrorCode.NETWORK);
            }
            if (result.status !== 200) {
                throw new CliError(`timestamp authority returned HTTP ${result.status}`, 1, ErrorCode.NETWORK);
            }
            return result.body;
        },
    };
}
