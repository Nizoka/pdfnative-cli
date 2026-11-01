/**
 * pdfnative-cli — fuzz target: the `.pdfnativerc.json` parser
 * ===========================================================
 * Coverage-guided fuzzing of `parseConfigText`, the pure half of
 * `loadConfig`: JSON that must be an object, global keys coerced to flag
 * values, a section per known command, `__proto__`/`constructor`/`prototype`
 * keys dropped at both levels. The section selected is `render`, the
 * command with the most flags.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/config
 */

import { parseConfigText } from '#fuzz-surface';
import { assertPrototypeClean, isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    try {
        const defaults = parseConfigText(text(new Uint8Array(data)), 'render', '.pdfnativerc.json');
        for (const [key, value] of Object.entries(defaults)) {
            if (!Object.hasOwn(defaults, key)) throw new TypeError(`default "${key}" is not an own key`);
            const ok = typeof value === 'string' || typeof value === 'boolean' || Array.isArray(value);
            if (!ok) throw new TypeError(`default "${key}" has type ${typeof value}`);
        }
        assertPrototypeClean();
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
