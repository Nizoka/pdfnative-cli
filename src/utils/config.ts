// `.pdfnativerc.json` configuration file support.
//
// Provides default flag values, discovered by walking up from the current
// working directory. Precedence (highest first):
//
//     explicit CLI flag  >  environment variable  >  config file  >  built-in
//
// Config only fills flags the user did NOT pass on the command line, so an
// explicit flag always wins. Environment variables are read inside each
// command independently, so they continue to take precedence over a value a
// command would otherwise read from an injected flag.
//
// File shape — flag names map to values; a top-level key whose name matches a
// command and whose value is an object is treated as a command-scoped section:
//
//     {
//       "no-color": true,
//       "render": { "page-size": "letter", "compress": true },
//       "verify": { "revocation": "online", "revocation-policy": "strict" }
//     }

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ParsedArgs } from './args.js';
import { validatePath } from './io.js';
import { CliError } from './error.js';

const CONFIG_FILENAME = '.pdfnativerc.json';
const CONFIG_SIZE_LIMIT = 1024 * 1024; // 1 MB — config files are small.
const KNOWN_COMMANDS = ['render', 'sign', 'verify', 'inspect', 'batch'];

type ConfigValue = string | boolean | number | readonly (string | number)[];
type ConfigDefaults = Record<string, string | boolean | string[]>;

/** Locate the nearest `.pdfnativerc.json` by walking up from `startDir`. */
function findConfigFile(startDir: string): string | null {
    let dir = resolve(startDir);
    // Bounded walk to the filesystem root.
    for (;;) {
        const candidate = join(dir, CONFIG_FILENAME);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function coerce(value: ConfigValue): string | boolean | string[] | null {
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        return value.map((v) => (typeof v === 'number' ? String(v) : v)) as string[];
    }
    return null;
}

/**
 * Load configuration defaults for `commandName`.
 *
 * @param commandName  The command being run (selects its scoped section).
 * @param explicitPath Optional `--config` override; when set, discovery is skipped.
 * @param cwd          Directory to start discovery from (default: process cwd).
 * @returns A flat map of flag defaults (global section merged under the
 *          command section, command wins), or an empty object when no config
 *          is found.
 */
export function loadConfig(
    commandName: string,
    explicitPath: string | undefined,
    cwd: string = process.cwd(),
): ConfigDefaults {
    let path: string | null;
    if (explicitPath !== undefined) {
        validatePath(explicitPath);
        path = resolve(explicitPath);
        if (!existsSync(path)) {
            throw new CliError(`Config file not found: ${explicitPath}`, 2);
        }
    } else {
        path = findConfigFile(cwd);
    }
    if (path === null) return {};

    let parsed: unknown;
    try {
        const raw = readFileSync(path);
        if (raw.length > CONFIG_SIZE_LIMIT) {
            throw new CliError(`Config file exceeds the 1 MB limit: ${path}`, 2);
        }
        parsed = JSON.parse(raw.toString('utf8'));
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(`Failed to parse config file ${path}: invalid JSON.`, 2);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new CliError(`Config file ${path} must contain a JSON object.`, 2);
    }

    const global: ConfigDefaults = {};
    const scoped: ConfigDefaults = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (
            KNOWN_COMMANDS.includes(key)
            && value !== null
            && typeof value === 'object'
            && !Array.isArray(value)
        ) {
            if (key !== commandName) continue;
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                const c = coerce(v as ConfigValue);
                if (c !== null) scoped[k] = c;
            }
            continue;
        }
        const c = coerce(value as ConfigValue);
        if (c !== null) global[key] = c;
    }
    // Command-scoped values win over global ones.
    return { ...global, ...scoped };
}

/**
 * Fill flags absent from `args` with config defaults. CLI flags always win;
 * a flag the user passed (even as a boolean) is never overwritten.
 */
export function applyConfigDefaults(args: ParsedArgs, defaults: ConfigDefaults): ParsedArgs {
    const merged: Record<string, string | boolean | readonly string[]> = { ...args.flags };
    for (const [key, value] of Object.entries(defaults)) {
        if (merged[key] === undefined) merged[key] = value;
    }
    return { flags: merged, positionals: args.positionals };
}
