/**
 * pdfnative-cli — fuzz target: the `--annotations` JSON parser
 * ============================================================
 * Coverage-guided fuzzing of `parseAnnotationsJson`: a bare array or
 * `{ annotations: [...] }`, nine annotation types, `page`, `rect`,
 * `quadPoints`, `start`/`end`, `url` through the URL check, and the
 * re-keying that lets only known fields through to the engine.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/annotations
 */

import { parseAnnotationsJson } from '#fuzz-surface';
import { assertPrototypeClean, isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    try {
        const specs = parseAnnotationsJson(text(new Uint8Array(data)));
        for (const spec of specs) {
            if (!Number.isInteger(spec.page) || spec.page < 1) throw new TypeError(`page ${String(spec.page)} passed validation`);
            if (typeof spec.annotation.type !== 'string') throw new TypeError('an annotation without a type passed validation');
        }
        assertPrototypeClean();
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
