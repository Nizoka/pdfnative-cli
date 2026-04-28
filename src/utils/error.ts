/**
 * CLI Error — thrown by commands when a user-facing error occurs.
 *
 * Exit code conventions:
 *   1 = runtime error (invalid input, I/O failure)
 *   2 = usage error  (missing required argument)
 */
export class CliError extends Error {
    public readonly exitCode: number;

    constructor(message: string, exitCode = 1) {
        super(message);
        this.name = 'CliError';
        this.exitCode = exitCode;
    }
}

/**
 * Print a message to stderr and terminate the process.
 * Never returns — declared as `never` for type narrowing.
 */
export function die(message: string, exitCode = 1): never {
    process.stderr.write(message + '\n');
    process.exit(exitCode);
}

/**
 * Emit a single deprecation warning to stderr.
 * Idempotent per (name) within a process — repeated calls produce one line.
 *
 * @param name        - Deprecated flag/feature name (without leading dashes).
 * @param replacement - Suggested replacement (e.g. another flag name).
 */
const _deprecateSeen = new Set<string>();
export function deprecate(name: string, replacement: string): void {
    if (_deprecateSeen.has(name)) return;
    _deprecateSeen.add(name);
    process.stderr.write(`warning: --${name} is deprecated; use ${replacement} instead.\n`);
}
