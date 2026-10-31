/**
 * pdfnative-cli — fuzz target: the argument parser
 * ================================================
 * Coverage-guided fuzzing of `parseArgs` and `splitCommandArgv`, the first
 * code every invocation runs. The bytes are split on newlines into argv
 * tokens, so a mutation can produce `--flag=value`, a repeated flag, a
 * `--` terminator, a global flag before the command name, a command name
 * swallowed as a flag value, `--__proto__` — every shape the CLI's own
 * tests/fuzz/argv.test.ts enumerates by hand, and the ones it does not.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/argv
 */

import { GLOBAL_BOOLEAN_FLAGS, KNOWN_COMMANDS, parseArgs, splitCommandArgv } from '#fuzz-surface';
import { assertPrototypeClean, isRefusal, text } from './_contract.js';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    const argv = text(new Uint8Array(data)).split('\n');
    try {
        const parsed = parseArgs(argv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
        // The flags object must be a plain own-keys map: an inherited value
        // read back as a flag is the finding of tests/fuzz/argv.test.ts.
        for (const key of Object.keys(parsed.flags)) {
            if (!Object.hasOwn(parsed.flags, key)) throw new TypeError(`flag "${key}" is not an own key`);
        }
        const split = splitCommandArgv(argv, KNOWN_COMMANDS);
        if (split.commandName !== undefined) parseArgs(split.commandArgv);
        assertPrototypeClean();
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
