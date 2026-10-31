/**
 * pdfnative-cli — fuzz target: the date grammars
 * ==============================================
 * Coverage-guided fuzzing of the three date parsers a user string reaches:
 * `pdfDateToIso` (`D:YYYYMMDDHHmmSSOHH'mm'`, ISO 32000-1 §7.9.4 — never
 * refuses, returns the raw string when it cannot convert), `parseIsoDate`
 * (`--creation-date`, `--signing-time`, `--mod-date`) and
 * `parseSourceDateEpoch` (`SOURCE_DATE_EPOCH`).
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/pdfdate
 */

import { parseIsoDate, parseSourceDateEpoch, pdfDateToIso } from '#fuzz-surface';
import { isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    const raw = text(new Uint8Array(data));
    try {
        const iso = pdfDateToIso(raw);
        if (typeof iso !== 'string') throw new TypeError('pdfDateToIso returned a non-string');
        // ISO 8601 shape, not a JS instant: a leap second (:60) is legal ISO and
        // `Date` refuses it — the conversion is lossless, the consumer decides.
        if (iso !== raw && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(iso)) throw new TypeError(`pdfDateToIso produced a non-ISO value: ${iso}`);
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
    try {
        const date = parseIsoDate(raw, 'creation-date');
        if (Number.isNaN(date.getTime())) throw new TypeError('parseIsoDate accepted an invalid instant');
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
    try {
        const date = parseSourceDateEpoch(raw);
        if (Number.isNaN(date.getTime())) throw new TypeError('parseSourceDateEpoch accepted an invalid epoch');
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
