import { CliError } from './error.js';

export interface ParsedArgs {
    readonly flags: Record<string, string | boolean>;
    readonly positionals: readonly string[];
}

/**
 * Zero-dependency argument parser.
 *
 * Supported forms:
 *   --flag value      flags.flag = 'value'
 *   --flag=value      flags.flag = 'value'
 *   -f value          flags.f   = 'value'
 *   --flag            flags.flag = true   (boolean)
 *   --                stop flag parsing; rest → positionals
 *   bare token        positionals[]
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
    const flags: Record<string, string | boolean> = {};
    const positionals: string[] = [];
    let i = 0;

    while (i < argv.length) {
        const token = argv[i] as string;

        if (token === '--') {
            // Everything after -- goes into positionals
            i++;
            while (i < argv.length) {
                positionals.push(argv[i] as string);
                i++;
            }
            break;
        }

        if (token.startsWith('--')) {
            const eqIdx = token.indexOf('=');
            if (eqIdx !== -1) {
                // --flag=value
                const key = token.slice(2, eqIdx);
                const value = token.slice(eqIdx + 1);
                flags[key] = value;
            } else {
                const key = token.slice(2);
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith('-')) {
                    // --flag value
                    flags[key] = next;
                    i++;
                } else {
                    // --flag (boolean)
                    flags[key] = true;
                }
            }
        } else if (token.startsWith('-') && token.length === 2) {
            // -f value
            const key = token.slice(1);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positionals.push(token);
        }

        i++;
    }

    return { flags, positionals };
}

/**
 * Return the string value of the first matching flag name, or undefined.
 * Throws CliError if the flag is present but its value is a boolean (i.e. no value provided).
 */
export function getStringFlag(
    flags: Record<string, string | boolean>,
    ...names: string[]
): string | undefined {
    for (const name of names) {
        const value = flags[name];
        if (value !== undefined) {
            if (typeof value !== 'string') {
                throw new CliError(`Flag --${name} requires a value.`, 2);
            }
            return value;
        }
    }
    return undefined;
}

/** Return true if any of the given flag names is present (boolean or string value). */
export function hasFlag(flags: Record<string, string | boolean>, ...names: string[]): boolean {
    return names.some((n) => flags[n] !== undefined);
}
