// Classification of the errors pdfnative's builders throw (v1.5.0).
//
// pdfnative validates its options at build time and throws plain Errors whose
// messages start with a stable prefix (`print.`, `chart:`, `outputIntent.`,
// `PDF/X`, `layout.pdfx`, …). The CLI maps those to the stable code E_INPUT —
// "the input JSON / layout asked for something invalid" — so an agent can
// branch on the failure class; anything unrecognised stays E_RUNTIME. Strict
// mode escalations (`pdfnative: ` prefix, from createDiagnosticEmitter) are
// E_CHECK_FAILED: a conformance check failed, by request.
//
// The prefix list is maintained by hand: pdfnative serves every build error
// verbatim in docs/data/errors.json → buildErrors, but that file is not part
// of the npm tarball, so it cannot be read at runtime. A committed copy
// (tests/fixtures/pdfnative-build-errors.json) drives a test asserting every
// known message classifies as E_INPUT, which is what catches a new prefix at
// the next engine bump.

import { ErrorCode, type ErrorCodeValue } from './error.js';

/** Message prefixes of pdfnative's option-validation errors (→ E_INPUT). */
export const INPUT_ERROR_PREFIXES: readonly string[] = [
    // pdfnative 1.7.0
    'print.',
    'chart:',
    'outputIntent.',
    'PDF/A and encryption',
    'File attachments require',
    'Watermark transparency',
    // pdfnative 1.8.0 — PDF/X coherence
    'layout.pdfx',
    'PDF/X',
];

/** Prefix of a strict-mode diagnostic escalation (→ E_CHECK_FAILED under --strict). */
export const STRICT_ESCALATION_PREFIX = 'pdfnative:';

/**
 * Classify a build-error message. Returns the stable code, or null when the
 * message matches no known family (the caller rethrows it unchanged).
 */
export function classifyBuildError(message: string, strict: boolean): ErrorCodeValue | null {
    if (strict && message.startsWith(STRICT_ESCALATION_PREFIX)) return ErrorCode.CHECK_FAILED;
    for (const prefix of INPUT_ERROR_PREFIXES) {
        if (message.startsWith(prefix)) return ErrorCode.INPUT;
    }
    return null;
}
