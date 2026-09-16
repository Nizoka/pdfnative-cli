/**
 * I/O helpers shared by the sample generator, the corpus generator and the
 * verifiers. Ported from pdfnative's scripts/helpers/io.ts; the generator
 * here drives the built CLI (`node dist/cli.cjs`) instead of the library, so
 * files are written by the child process and read back for the report.
 */

import { statSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
/** Every generated artefact lives under here; git-ignored. */
export const TEST_OUTPUT_DIR = resolve(REPO_ROOT, 'test-output');
/** The reproducible sample corpus (`npm run test:generate`). */
export const OUTPUT_DIR = resolve(TEST_OUTPUT_DIR, 'samples');

/**
 * The instant every sample is stamped with.
 *
 * Unencrypted pdfnative output is a pure function of its inputs plus this one
 * date — the trailer `/ID` is an MD5 of title + creation date + object count —
 * so pinning it makes the whole sample suite byte-reproducible and lets
 * `npm run verify:samples` detect regressions by hash. Changing this value
 * invalidates every baseline hash.
 *
 * Reproducibility also requires the process timezone to be UTC, because PDF
 * dates carry a local offset — see `scripts/helpers/tz.ts`. The CLI is told
 * the instant twice, on purpose: `--creation-date` (the flag, which also
 * pins the `{date}` header/footer placeholder) and `SOURCE_DATE_EPOCH` in the
 * child environment (the reproducible-builds.org convention the CLI honours
 * when the flag is absent), so a generator that forgets one still produces
 * the baseline bytes.
 */
export const SAMPLE_CREATION_DATE = new Date('2026-01-01T00:00:00Z');
export const SAMPLE_CREATION_ISO = SAMPLE_CREATION_DATE.toISOString();
export const SOURCE_DATE_EPOCH = String(Math.floor(SAMPLE_CREATION_DATE.getTime() / 1000));

/**
 * Environment for every CLI child: UTC, the pinned instant, no colour (the
 * output is captured, never shown at a terminal), and nothing inherited
 * that could change bytes (`PDFNATIVE_*` overrides from the parent shell).
 */
export function cliEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('PDFNATIVE_')) delete env[key];
    }
    return {
        ...env,
        TZ: 'UTC',
        SOURCE_DATE_EPOCH,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        ...extra,
    };
}

export interface SampleResult {
    file: string;
    size: number;
    pages: number;
}

export interface GenerateContext {
    outputDir: string;
    results: SampleResult[];
    /** Files the CLI reported as failed — collected, then fatal at the end. */
    failed: string[];
    /** Record a PDF the CLI wrote (size + page count read back from disk). */
    record: (filepath: string, filename: string) => void;
}

export function createContext(outputDir: string = OUTPUT_DIR): GenerateContext {
    mkdirSync(outputDir, { recursive: true });
    const results: SampleResult[] = [];
    const failed: string[] = [];

    function record(filepath: string, filename: string): void {
        const size = statSync(filepath).size;
        const pdfStr = readFileSync(filepath, 'latin1');
        const pageCount = (pdfStr.match(/\/Type \/Page[^s]/g) || []).length;
        results.push({ file: filename, size, pages: pageCount });
    }

    return { outputDir, results, failed, record };
}

export interface OutputMode {
    /** Summary lines only. Implied when stdout is not a terminal, unless --verbose. */
    readonly quiet: boolean;
    /** Machine-readable output on stdout. Implies quiet for everything else. */
    readonly json: boolean;
}

/**
 * Parse the `--quiet` / `--verbose` / `--json` trio shared by the sample
 * scripts. A pipe (CI log, an agent's captured output, `scripts/gate.ts`)
 * gets the quiet form by default so a human at a terminal sees the full
 * table and everyone else sees a few lines; `--verbose` forces the table
 * through a pipe, `--quiet` forces the summary at a terminal.
 *
 * Returns an error message for anything else, so callers can exit 2.
 */
export function parseOutputMode(argv: readonly string[], isTTY: boolean = process.stdout.isTTY === true): OutputMode | { readonly error: string } {
    let quiet = false;
    let verbose = false;
    let json = false;
    for (const a of argv) {
        if (a === '--quiet') quiet = true;
        else if (a === '--verbose') verbose = true;
        else if (a === '--json') json = true;
        else return { error: `Unknown argument "${a}". Expected --quiet, --verbose and/or --json.` };
    }
    if (quiet && verbose) return { error: '--quiet and --verbose are mutually exclusive.' };
    return { quiet: json || quiet || (!isTTY && !verbose), json };
}

export interface SummaryOptions {
    /** One line instead of the table — for logs, CI and agents. */
    quiet?: boolean;
    /** Machine-readable summary on stdout, nothing else. */
    json?: boolean;
    /** Wall-clock duration of the run, for the quiet line and the JSON. */
    seconds?: number;
    /** Samples the CLI failed to produce. */
    failed?: readonly string[];
}

export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function printSummary(results: SampleResult[], outputDir: string, options: SummaryOptions = {}): void {
    const totalBytes = results.reduce((sum, r) => sum + r.size, 0);
    const failed = options.failed ?? [];

    if (options.json) {
        process.stdout.write(`${JSON.stringify({
            generated: results.length,
            bytes: totalBytes,
            seconds: options.seconds ?? null,
            outputDir,
            failed,
            files: results,
        }, null, 2)}\n`);
        return;
    }

    if (options.quiet) {
        const clock = options.seconds === undefined ? '' : `, ${options.seconds.toFixed(1)} s`;
        const rel = outputDir.replace(/\\/g, '/').replace(/\/?$/, '/');
        process.stdout.write(`${results.length} PDFs, ${formatBytes(totalBytes)}${clock} → ${rel}\n`);
        if (failed.length > 0) {
            process.stdout.write(`${failed.length} failed: ${failed.join(', ')}\n`);
        }
        return;
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('┌──────────────────────────────────────────────────────────────┐');
    lines.push('│  pdfnative-cli – Sample PDF Generation Report                │');
    lines.push('├──────────────────────────────────────────────────────────────┤');
    lines.push(`│  Output: ${outputDir}`);
    lines.push('├──────────────────────────────────┬────────┬─────────────────┤');
    lines.push('│ File                             │ Pages  │ Size            │');
    lines.push('├──────────────────────────────────┼────────┼─────────────────┤');
    for (const r of results) {
        const f = r.file.length > 32 ? `…${r.file.slice(-31)}` : r.file.padEnd(32);
        const p = String(r.pages).padStart(4);
        const s = formatBytes(r.size).padStart(13);
        lines.push(`│ ${f} │ ${p}   │ ${s}   │`);
    }
    lines.push('├──────────────────────────────────┴────────┴─────────────────┤');
    lines.push(`│  Total: ${String(results.length).padEnd(4)} PDFs generated                                   │`);
    if (failed.length > 0) lines.push(`│  Failed: ${failed.join(', ')}`);
    lines.push('└──────────────────────────────────────────────────────────────┘');
    lines.push('');
    process.stdout.write(`${lines.join('\n')}\n`);
}
