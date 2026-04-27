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
