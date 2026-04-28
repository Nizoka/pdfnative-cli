import { CliError } from './error.js';

export interface ParsedArgs {
    readonly flags: Record<string, string | boolean | readonly string[]>;
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
 *
 * When the same long flag is provided more than once with a string value
 * (e.g. `--cert-chain a.pem --cert-chain b.pem`), values are collected into
 * a `readonly string[]`. Use `getStringFlagAll()` to retrieve them.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
    const flags: Record<string, string | boolean | string[]> = {};
    const positionals: string[] = [];
    let i = 0;

    const setFlag = (key: string, value: string | boolean): void => {
        const existing = flags[key];
        if (existing === undefined || typeof existing === 'boolean') {
            flags[key] = value;
            return;
        }
        if (typeof value === 'boolean') {
            // `--flag value --flag` — keep the existing string array/value
            return;
        }
        // Both old and new are strings → collect into array
        if (typeof existing === 'string') {
            flags[key] = [existing, value];
        } else {
            existing.push(value);
        }
    };

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
                setFlag(key, value);
            } else {
                const key = token.slice(2);
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith('-')) {
                    // --flag value
                    setFlag(key, next);
                    i++;
                } else {
                    // --flag (boolean)
                    setFlag(key, true);
                }
            }
        } else if (token.startsWith('-') && token.length === 2) {
            // -f value
            const key = token.slice(1);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
                setFlag(key, next);
                i++;
            } else {
                setFlag(key, true);
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
 * If the flag was provided multiple times, returns the FIRST value; use {@link getStringFlagAll}
 * to retrieve every occurrence.
 */
export function getStringFlag(
    flags: ParsedArgs['flags'],
    ...names: string[]
): string | undefined {
    for (const name of names) {
        const value = flags[name];
        if (value === undefined) continue;
        if (typeof value === 'boolean') {
            throw new CliError(`Flag --${name} requires a value.`, 2);
        }
        if (typeof value === 'string') return value;
        return value[0];
    }
    return undefined;
}

/**
 * Return every string value provided for any of the named flags (in order).
 * Returns an empty array if no value was provided. Throws CliError if a name
 * is present as a boolean flag (i.e. `--flag` without a value).
 */
export function getStringFlagAll(
    flags: ParsedArgs['flags'],
    ...names: string[]
): readonly string[] {
    const out: string[] = [];
    for (const name of names) {
        const value = flags[name];
        if (value === undefined) continue;
        if (typeof value === 'boolean') {
            throw new CliError(`Flag --${name} requires a value.`, 2);
        }
        if (typeof value === 'string') {
            out.push(value);
        } else {
            out.push(...value);
        }
    }
    return out;
}

/** Return true if any of the given flag names is present (boolean or string value). */
export function hasFlag(flags: ParsedArgs['flags'], ...names: string[]): boolean {
    return names.some((n) => flags[n] !== undefined);
}
