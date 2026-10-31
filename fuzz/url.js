/**
 * pdfnative-cli — fuzz target: the URL guard
 * ==========================================
 * Coverage-guided fuzzing of the admission half of the SSRF guard every
 * opt-in network call goes through: `parseFetchUrl` (a parseable URL on
 * http or https, or a `FetchGuardError`) and `isBlockedAddress` on the
 * host when it is an IP literal (loopback, private, link-local, CGNAT,
 * multicast, reserved and IPv4-mapped ranges). The DNS step stays out: a
 * fuzzer never opens a socket.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/url
 */

import { isBlockedAddress, parseFetchUrl } from '#fuzz-surface';
import { isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    try {
        const url = parseFetchUrl(text(new Uint8Array(data)));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError(`scheme ${url.protocol} passed the guard`);
        // `[::1]` → `::1`: the literal the resolver would be handed.
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (typeof isBlockedAddress(host) !== 'boolean') throw new TypeError('isBlockedAddress returned a non-boolean');
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
