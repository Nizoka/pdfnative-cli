/**
 * Spawn the built CLI from a maintenance script.
 *
 * Every generator and corpus builder goes through here so that all of them
 * run the SAME binary the release ships (`dist/cli.cjs`), with the same
 * Node (`process.execPath`), and never through a shell: a sample name or a
 * password is passed as an argv element, not interpolated into a command
 * line. Set `PDFNATIVE_CLI=/path/to/cli.cjs` to point the scripts at another
 * build (a globally installed release, for instance) — the default is the
 * tree's own `dist/`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT, cliEnv } from './io.js';

export const DEFAULT_CLI_ENTRY = resolve(REPO_ROOT, 'dist', 'cli.cjs');

/** The CLI entry point the scripts drive (env override, else dist/cli.cjs). */
export function resolveCliEntry(env: NodeJS.ProcessEnv = process.env): string {
    const override = env.PDFNATIVE_CLI;
    return override !== undefined && override.trim().length > 0 ? resolve(override) : DEFAULT_CLI_ENTRY;
}

/**
 * Exit 2 with a hint when the binary is missing — the generator must never
 * silently run against a stale or absent build.
 */
export function requireDist(entry: string = resolveCliEntry()): string {
    if (!existsSync(entry)) {
        process.stderr.write(`CLI not found at ${entry}\nRun \`npm run build\` first (or set PDFNATIVE_CLI).\n`);
        process.exit(2);
    }
    return entry;
}

export interface CliRun {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}

export interface RunCliOptions {
    /** Extra environment on top of `cliEnv()` (TZ=UTC, SOURCE_DATE_EPOCH, NO_COLOR). */
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
    /** Bytes written to the child's stdin (for `--input -`). */
    readonly input?: Uint8Array | string;
    /** Milliseconds before the child is killed; a render never needs more than this. */
    readonly timeoutMs?: number;
}

/** Run one CLI invocation synchronously and capture its channels. */
export function runCli(args: readonly string[], options: RunCliOptions = {}, entry: string = resolveCliEntry()): CliRun {
    const res = spawnSync(process.execPath, [entry, ...args], {
        cwd: options.cwd ?? REPO_ROOT,
        env: cliEnv(options.env),
        input: options.input,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: options.timeoutMs ?? 120_000,
        windowsHide: true,
    });
    if (res.error) {
        return { status: 1, stdout: res.stdout ?? '', stderr: `${res.stderr ?? ''}${res.error.message}\n` };
    }
    return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}
