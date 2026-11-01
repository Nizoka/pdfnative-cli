/**
 * pdfnative-cli — fuzz target: `--font-file`
 * ==========================================
 * Coverage-guided fuzzing of the path a user font takes: `parseFontFileSpec`
 * (`<path>[:name]`, a Windows drive letter honoured) and `defaultFontName`
 * on the bytes as text, then `sniffFontFormat` on the bytes and — only for
 * the two formats the CLI admits, as `loadCustomFonts` does — the engine's
 * `parseFontData` (CWE-125: a truncated table directory must be refused,
 * never read past the buffer).
 *
 * The engine parser follows the library's rule (an `Error` it throws is a
 * refusal); the CLI parsers follow the CLI's (a `CliError` is). See
 * `_contract.js`.
 *
 * @module fuzz/font-file
 */

import { defaultFontName, parseFontData, parseFontFileSpec, sniffFontFormat } from '#fuzz-surface';
import { isLibraryRefusal, isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    const bytes = new Uint8Array(data);
    try {
        const spec = parseFontFileSpec(text(bytes));
        if (!/^[a-z0-9-]+$/.test(spec.name)) throw new TypeError(`registry name "${spec.name}" passed validation`);
        if (defaultFontName(spec.path).length === 0) throw new TypeError('defaultFontName returned an empty name');
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
    const format = sniffFontFormat(bytes);
    if (format !== 'ttf' && format !== 'otf') return;
    try {
        parseFontData(bytes);
    } catch (error) {
        if (!isLibraryRefusal(error)) throw error;
    }
}
