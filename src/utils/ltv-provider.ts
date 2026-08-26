// OCSP / CRL revocation transport for LTV collection (opt-in network,
// SSRF-guarded).
//
// pdfnative's LTV collector (`collectValidationInfo` / `addValidationInfo`)
// never touches the network: it extracts OCSP responder and CRL distribution
// point URLs from certificate extensions and hands them to an injected
// {@link RevocationProvider}. This module is the CLI-side transport — every
// round-trip goes through the same SSRF guard as `verify --revocation online`
// and the TSA transport (src/utils/tsa.ts).
//
// Network happens ONLY when the user passed the explicit `--online` flag
// (`ltv collect --online` / `ltv add --online`).

import type { RevocationProvider } from '../core-bridge/index.js';
import { guardedFetch, FetchGuardError } from './fetch-guard.js';
import { CliError, ErrorCode } from './error.js';

export interface RevocationProviderOptions {
    /** Request timeout in milliseconds. Default 10000 (fetch-guard default). */
    readonly timeoutMs?: number;
}

/**
 * Build a {@link RevocationProvider} that POSTs OCSPRequest DERs and GETs
 * CRLs through the SSRF-guarded fetch.
 *
 * Failures are deliberately generic (`E_NETWORK`) and never include response
 * bodies — a hostile responder must not be able to inject text into CLI
 * output.
 */
export function createRevocationProvider(options: RevocationProviderOptions = {}): RevocationProvider {
    return {
        async fetchOcsp(url: string, request: Uint8Array): Promise<Uint8Array> {
            let result;
            try {
                result = await guardedFetch(url, {
                    method: 'POST',
                    body: request,
                    contentType: 'application/ocsp-request',
                    accept: 'application/ocsp-response',
                    timeoutMs: options.timeoutMs,
                });
            } catch (err) {
                const reason = err instanceof FetchGuardError ? `: ${err.message}` : '';
                throw new CliError(`OCSP responder request failed${reason}`, 1, ErrorCode.NETWORK);
            }
            if (result.status !== 200) {
                throw new CliError(`OCSP responder returned HTTP ${result.status}`, 1, ErrorCode.NETWORK);
            }
            return result.body;
        },

        async fetchCrl(url: string): Promise<Uint8Array> {
            let result;
            try {
                result = await guardedFetch(url, {
                    method: 'GET',
                    accept: 'application/pkix-crl',
                    timeoutMs: options.timeoutMs,
                });
            } catch (err) {
                const reason = err instanceof FetchGuardError ? `: ${err.message}` : '';
                throw new CliError(`CRL distribution point request failed${reason}`, 1, ErrorCode.NETWORK);
            }
            if (result.status !== 200) {
                throw new CliError(`CRL distribution point returned HTTP ${result.status}`, 1, ErrorCode.NETWORK);
            }
            return result.body;
        },
    };
}
