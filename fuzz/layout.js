/**
 * pdfnative-cli — fuzz target: the `--layout` JSON path
 * =====================================================
 * Coverage-guided fuzzing of what a layout file goes through after the
 * disk read: `reviveLayoutJson` (attachment data stripped, an ICC profile
 * given as a number array capped and revived, `creationDate` parsed),
 * `mergeNestedLayout` (the one-level merge of `typography` and
 * `outputIntent`) and `deepMerge` with its depth and forbidden-key guards.
 *
 * `JSON.parse` is called here, as `loadLayoutFile` does, and its
 * `SyntaxError` is the one engine-class error that is a refusal in this
 * target: the command wraps it in a `CliError` on the same line.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/layout
 */

import { deepMerge, isPlainObject, mergeNestedLayout, reviveLayoutJson } from '#fuzz-surface';
import { assertPrototypeClean, isRefusal, text } from './_contract.js';

const BASE = Object.freeze({ pageSize: 'a4', typography: { kerning: true }, outputIntent: { identifier: 'base' } });

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    let parsed;
    try {
        parsed = JSON.parse(text(new Uint8Array(data)));
    } catch {
        return; // not JSON: `--layout` refuses it with a CliError before any of this runs
    }
    try {
        if (!isPlainObject(parsed)) return;
        const revived = reviveLayoutJson(parsed);
        const merged = mergeNestedLayout(BASE, revived);
        if (!isPlainObject(merged)) throw new TypeError('mergeNestedLayout returned a non-object');
        deepMerge(BASE, revived);
        deepMerge(revived, BASE);
        assertPrototypeClean();
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
