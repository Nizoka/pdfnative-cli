// SSRF-guarded HTTP(S) client for opt-in online revocation checking.
//
// The CLI is offline by default. When a user explicitly opts into online
// OCSP / CRL fetching (`verify --revocation online`), every request passes
// through this guard, which enforces:
//   - scheme allow-list (http, https only);
//   - DNS resolution + private/loopback/link-local/reserved address blocking
//     (defends against SSRF to internal infrastructure);
//   - a hard request timeout (default 10 s);
//   - a hard response-size cap (default 5 MiB);
//   - NO automatic redirect following (a redirect to an internal host would
//     otherwise bypass the address check).
//
// Only the subset needed for RFC 6960 OCSP (POST) and RFC 5280 CRL (GET) is
// implemented. No cookies, no auth, no keep-alive pooling.

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface FetchOptions {
    /** Request timeout in milliseconds. Default 10000. */
    readonly timeoutMs?: number;
    /** Maximum response size in bytes. Default 5 MiB. */
    readonly maxBytes?: number;
    /** HTTP method. Default 'GET'. */
    readonly method?: 'GET' | 'POST';
    /** Request body (for OCSP POST). */
    readonly body?: Uint8Array;
    /** Content-Type header (for OCSP POST). */
    readonly contentType?: string;
    /** Accept header. */
    readonly accept?: string;
}

export interface FetchResult {
    readonly status: number;
    readonly contentType: string | null;
    readonly body: Uint8Array;
}

export class FetchGuardError extends Error {}

/**
 * Returns true when an IP address is private, loopback, link-local,
 * unique-local, or otherwise not a public unicast address. Both IPv4 and
 * IPv6 (incl. IPv4-mapped) are covered.
 */
export function isBlockedAddress(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return isBlockedIPv4(ip);
    if (family === 6) return isBlockedIPv6(ip.toLowerCase());
    // Not a literal IP — caller must resolve first.
    return true;
}

function isBlockedIPv4(ip: string): boolean {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // "this" network
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
}

function isBlockedIPv6(ip: string): boolean {
    if (ip === '::1' || ip === '::') return true; // loopback / unspecified
    if (ip.startsWith('fe80')) return true; // link-local
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique-local
    if (ip.startsWith('ff')) return true; // multicast
    // IPv4-mapped (::ffff:a.b.c.d) — extract and re-check.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped !== null) return isBlockedIPv4(mapped[1] as string);
    return false;
}

/**
 * Resolve `hostname` and assert every resolved address is a public unicast
 * address. Returns one safe address to pin the connection to (defeats
 * DNS-rebinding between the check and the connect).
 */
async function resolveSafeAddress(hostname: string): Promise<string> {
    const literal = isIP(hostname);
    if (literal !== 0) {
        if (isBlockedAddress(hostname)) {
            throw new FetchGuardError('refusing to connect to a non-public address');
        }
        return hostname;
    }
    let records: { address: string }[];
    try {
        records = await lookup(hostname, { all: true });
    } catch {
        throw new FetchGuardError('DNS resolution failed');
    }
    if (records.length === 0) throw new FetchGuardError('DNS resolution returned no records');
    for (const r of records) {
        if (isBlockedAddress(r.address)) {
            throw new FetchGuardError('hostname resolves to a non-public address');
        }
    }
    return (records[0] as { address: string }).address;
}

/**
 * Perform a single guarded HTTP(S) request. Rejects with {@link FetchGuardError}
 * on any policy violation. Never follows redirects.
 */
export async function guardedFetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new FetchGuardError('invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new FetchGuardError(`unsupported URL scheme "${parsed.protocol}"`);
    }

    const safeAddress = await resolveSafeAddress(parsed.hostname);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const method = options.method ?? 'GET';
    const isHttps = parsed.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const defaultPort = isHttps ? 443 : 80;

    const headers: Record<string, string> = {
        // Connect to the pinned, vetted address but present the real Host so
        // virtual hosting + TLS SNI still work.
        Host: parsed.host,
    };
    if (options.accept !== undefined) headers['Accept'] = options.accept;
    if (method === 'POST' && options.body !== undefined) {
        headers['Content-Length'] = String(options.body.length);
        if (options.contentType !== undefined) headers['Content-Type'] = options.contentType;
    }

    return new Promise<FetchResult>((resolve, reject) => {
        const req = requestFn(
            {
                protocol: parsed.protocol,
                host: safeAddress,
                servername: isHttps ? parsed.hostname : undefined,
                port: parsed.port !== '' ? Number(parsed.port) : defaultPort,
                method,
                path: parsed.pathname + parsed.search,
                headers,
                timeout: timeoutMs,
            },
            (res: IncomingMessage) => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400) {
                    res.destroy();
                    reject(new FetchGuardError('refusing to follow redirect'));
                    return;
                }
                const chunks: Buffer[] = [];
                let total = 0;
                res.on('data', (chunk: Buffer) => {
                    total += chunk.length;
                    if (total > maxBytes) {
                        res.destroy();
                        reject(new FetchGuardError('response exceeds size cap'));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    resolve({
                        status,
                        contentType: res.headers['content-type'] ?? null,
                        body: new Uint8Array(Buffer.concat(chunks)),
                    });
                });
                res.on('error', () => reject(new FetchGuardError('response stream error')));
            },
        );
        req.on('timeout', () => {
            req.destroy();
            reject(new FetchGuardError('request timed out'));
        });
        req.on('error', () => reject(new FetchGuardError('request failed')));
        if (method === 'POST' && options.body !== undefined) {
            req.write(options.body);
        }
        req.end();
    });
}
