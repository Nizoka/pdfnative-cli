/**
 * pdfnative-cli — what every fuzz target in this directory shares
 * ===============================================================
 * Not a target (the underscore keeps it out of build.sh and of
 * tests/fuzz/targets.test.ts): the refusal rule, the prototype check and
 * the byte-to-text step.
 *
 * The contract, and the only thing a crash in a target ever means: **a
 * `CliError` (or a `FetchGuardError`) is a result; anything else is a
 * bug.** The CLI promises its callers one of twelve stable error codes on
 * every refusal — a `TypeError` from a field that was not there, a
 * `RangeError` from recursion, a `SyntaxError` that escaped a `JSON.parse`,
 * an `Error` without a code — each is the parser failing to refuse rather
 * than refusing, and each is what the fuzzer is looking for. Swallowing
 * them would make the targets decorative.
 *
 * @module fuzz/_contract
 */

import { CliError, FetchGuardError } from '#fuzz-surface';

/**
 * A refusal the CLI wrote: a `CliError` carrying an exit code and an
 * `E_*` code, or the URL guard's own error class.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRefusal(error) {
    return error instanceof CliError || error instanceof FetchGuardError;
}

/**
 * The engine's refusal rule, for the one engine parser the CLI hands user
 * bytes to (`parseFontData`): an `Error` the library throws on purpose is a
 * result; the five engine error classes are bugs.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isLibraryRefusal(error) {
    return error instanceof Error
        && !(error instanceof TypeError) && !(error instanceof RangeError)
        && !(error instanceof ReferenceError) && !(error instanceof SyntaxError)
        && !(error instanceof URIError);
}

const PROTOTYPE_KEYS_AT_LOAD = Object.getOwnPropertyNames(Object.prototype).sort().join(',');

/**
 * `Object.prototype` carries exactly the own properties it had when the
 * target loaded: a JSON parser that let `__proto__` through is a finding
 * even when it threw nothing.
 * @returns {void}
 */
export function assertPrototypeClean() {
    if (Object.getOwnPropertyNames(Object.prototype).sort().join(',') !== PROTOTYPE_KEYS_AT_LOAD) {
        throw new TypeError('Object.prototype was polluted');
    }
    const probe = /** @type {Record<string, unknown>} */ ({});
    if (probe['polluted'] !== undefined || probe['fuzz'] !== undefined) {
        throw new TypeError('Object.prototype carries a polluted value');
    }
}

const decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * The fuzzer's bytes as text — every CLI grammar but the font sniffer is a
 * string grammar. Lossy on purpose: an invalid sequence becomes U+FFFD,
 * which is what Node gives a command reading a file or argv.
 * @param {Uint8Array} data
 * @returns {string}
 */
export function text(data) {
    return decoder.decode(data);
}
