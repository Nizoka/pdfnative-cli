// Command-name resolution for the dispatcher (src/index.ts), extracted so it
// can be unit-tested without spawning the binary.
//
// Global flags may appear before OR after the command name (v1.5.0). The
// boolean globals (--json, --dry-run, --quiet, --no-color, --no-config,
// --help, --version) never consume the following token, so
// `pdfnative --json render --input a.json` resolves `render` as the command
// instead of treating it as the value of --json (the pre-1.5.0 wart that
// llms.txt documented as "place --json after the sub-command").

import { GLOBAL_BOOLEAN_FLAGS, parseArgs } from './args.js';

export interface SplitArgv {
    /** The first positional token, or undefined when argv names no command. */
    readonly commandName: string | undefined;
    /** argv with the first occurrence of the command name removed. */
    readonly commandArgv: readonly string[];
}

/**
 * Identify the command in `argv` and return the argv the command itself
 * parses. Only the FIRST occurrence of the command name is stripped, so a
 * later token equal to the name (a file called `render`) is preserved.
 */
export function splitCommandArgv(argv: readonly string[]): SplitArgv {
    const parsed = parseArgs(argv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
    const commandName = parsed.positionals[0];
    if (commandName === undefined) return { commandName: undefined, commandArgv: argv };
    let stripped = false;
    const commandArgv = argv.filter((tok) => {
        if (!stripped && tok === commandName) {
            stripped = true;
            return false;
        }
        return true;
    });
    return { commandName, commandArgv };
}
