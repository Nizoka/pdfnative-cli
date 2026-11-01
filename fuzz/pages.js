/**
 * pdfnative-cli — fuzz target: page selectors
 * ===========================================
 * Coverage-guided fuzzing of `parsePageList` (extract semantics: order
 * kept, duplicates kept) and `parsePageRanges` (split semantics) over the
 * 1-based `1,3,5-7` grammar, against a page count the first byte chooses.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/pages
 */

import { parsePageList, parsePageRanges } from '#fuzz-surface';
import { isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    const bytes = new Uint8Array(data);
    const pageCount = bytes.length > 0 ? (bytes[0] % 64) + 1 : 1;
    const spec = text(bytes.subarray(1));
    try {
        for (const index of parsePageList(spec, pageCount)) {
            if (!Number.isInteger(index) || index < 0 || index >= pageCount) throw new RangeError(`index ${index} outside 0..${pageCount - 1}`);
        }
        for (const { start, end } of parsePageRanges(spec, pageCount)) {
            if (start < 0 || end < start || end >= pageCount) throw new RangeError(`range ${start}-${end} outside 0..${pageCount - 1}`);
        }
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
