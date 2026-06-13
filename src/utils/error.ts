/**
 * Stable, machine-readable error codes surfaced in the agent JSON envelope
 * (see {@link ../utils/agent.ts}). These are part of the CLI's public contract:
 * they let autonomous callers branch on a failure class without parsing the
 * human-readable message. Numeric exit codes (0/1/2) are unchanged.
 */
export const ErrorCode = {
    /** Usage error — missing/invalid flag or argument (exit 2). */
    USAGE: 'E_USAGE',
    /** Invalid input payload (wrong shape, failed validation). */
    INPUT: 'E_INPUT',
    /** Failed to parse JSON / PDF / DER input. */
    PARSE: 'E_PARSE',
    /** Filesystem or stream I/O failure. */
    IO: 'E_IO',
    /** Signing failed (message is always generic — never leaks key material). */
    SIGN: 'E_SIGN',
    /** `verify --strict` found one or more invalid signatures. */
    VERIFY_FAILED: 'E_VERIFY_FAILED',
    /** `inspect --check` assertion failed. */
    CHECK_FAILED: 'E_CHECK_FAILED',
    /** Requested capability is reserved / not yet available. */
    UNSUPPORTED: 'E_UNSUPPORTED',
    /** Catch-all runtime error (exit 1). */
    RUNTIME: 'E_RUNTIME',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * CLI Error — thrown by commands when a user-facing error occurs.
 *
 * Exit code conventions:
 *   1 = runtime error (invalid input, I/O failure)
 *   2 = usage error  (missing required argument)
 *
 * The optional `code` is a stable {@link ErrorCode} string used by the agent
 * JSON envelope. When omitted it defaults from the exit code (2 → `E_USAGE`,
 * otherwise `E_RUNTIME`), so existing call sites keep a sensible code for free.
 */
export class CliError extends Error {
    public readonly exitCode: number;
    public readonly code: ErrorCodeValue;

    constructor(message: string, exitCode = 1, code?: ErrorCodeValue) {
        super(message);
        this.name = 'CliError';
        this.exitCode = exitCode;
        this.code = code ?? (exitCode === 2 ? ErrorCode.USAGE : ErrorCode.RUNTIME);
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
