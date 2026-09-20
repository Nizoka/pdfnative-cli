// Command-name resolution for the dispatcher (src/index.ts), extracted so it
// can be unit-tested without spawning the binary.
//
// Global flags may appear before OR after the command name (v1.5.0). The
// boolean globals (--json, --dry-run, --quiet, --no-color, --no-config,
// --help, --version) never consume the following token, so
// `pdfnative --json render --input a.json` resolves `render` as the command
// instead of treating it as the value of --json (the pre-1.5.0 wart that
// llms.txt documented as "place --json after the sub-command").
//
// A COMMAND flag placed before the command (`pdfnative --strict render …`)
// is a different case: the parser cannot know `--strict` is boolean, so it
// takes `render` as its value and no positional is left. When the caller
// passes the known command names, the first argv token that IS a command
// name is recovered as the command, so the invocation behaves as written
// instead of printing the usage text and exiting 0.

import { GLOBAL_BOOLEAN_FLAGS, parseArgs } from './args.js';

export interface SplitArgv {
    /** The command token, or undefined when argv names no command. */
    readonly commandName: string | undefined;
    /** argv with the first occurrence of the command name removed. */
    readonly commandArgv: readonly string[];
}

function without(argv: readonly string[], index: number): readonly string[] {
    return argv.filter((_, i) => i !== index);
}

/**
 * Identify the command in `argv` and return the argv the command itself
 * parses. Only the FIRST occurrence of the command name is stripped, so a
 * later token equal to the name (a file called `render`) is preserved.
 *
 * @param knownCommands When given and the first positional is not one of
 *   them (or there is none), the first token equal to a known command name —
 *   before any `--` terminator — is taken as the command.
 */
export function splitCommandArgv(argv: readonly string[], knownCommands?: readonly string[]): SplitArgv {
    const parsed = parseArgs([...argv], { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
    const first = parsed.positionals[0];
    if (first !== undefined && (knownCommands === undefined || knownCommands.includes(first))) {
        return { commandName: first, commandArgv: without(argv, argv.indexOf(first)) };
    }
    if (knownCommands !== undefined) {
        const terminator = argv.indexOf('--');
        const limit = terminator === -1 ? argv.length : terminator;
        for (let i = 0; i < limit; i++) {
            if (knownCommands.includes(argv[i])) {
                return { commandName: argv[i], commandArgv: without(argv, i) };
            }
        }
    }
    if (first === undefined) return { commandName: undefined, commandArgv: argv };
    // An unknown first positional: report it as the (unknown) command.
    return { commandName: first, commandArgv: without(argv, argv.indexOf(first)) };
}
