// `pdfnative batch` — render every JSON file in a directory to PDF.
//
// Reuses the full `render` pipeline per file (so every render flag — variant,
// layout, smart tables, PDF/A, compression … — is honoured) and runs files
// through a bounded-concurrency worker pool. Reports a per-file summary and
// exits non-zero when any render fails.

import { readdir, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { validatePath } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { isJsonMode, isDryRun } from '../utils/agent.js';
import { selectFields, serializeJson, parseFieldList } from '../utils/projection.js';
import { style } from '../utils/colors.js';
import { render } from './render.js';

// Flags consumed by `batch` itself and therefore NOT forwarded to `render`.
const BATCH_ONLY_FLAGS = new Set([
    'input-dir', 'output-dir', 'concurrency', 'fail-fast', 'format',
    'input', 'i', 'output', 'o', 'watch', 'stream', 'stream-page-by-page',
    'summary', 'fields', 'pretty',
]);

interface FileResult {
    readonly input: string;
    readonly output: string;
    readonly ok: boolean;
    readonly error: string | null;
}

function quiet(): boolean {
    return process.env['PDFNATIVE_QUIET'] === '1';
}

function progress(msg: string): void {
    if (!quiet()) process.stderr.write(msg + '\n');
}

/** Build the per-file ParsedArgs forwarded to `render` (batch flags stripped). */
function forwardedFlags(args: ParsedArgs, input: string, output: string): ParsedArgs {
    const flags: Record<string, string | boolean | readonly string[]> = {};
    for (const [key, value] of Object.entries(args.flags)) {
        if (BATCH_ONLY_FLAGS.has(key)) continue;
        flags[key] = value;
    }
    flags['input'] = input;
    flags['output'] = output;
    return { flags, positionals: [] };
}

async function runPool<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let next = 0;
    const runners: Promise<void>[] = [];
    const n = Math.min(concurrency, items.length);
    for (let i = 0; i < n; i++) {
        runners.push(
            (async () => {
                for (;;) {
                    const idx = next++;
                    if (idx >= items.length) return;
                    await worker(items[idx] as T);
                }
            })(),
        );
    }
    await Promise.all(runners);
}

export async function batch(args: ParsedArgs): Promise<void> {
    const inputDir = getStringFlag(args.flags, 'input-dir');
    const outputDir = getStringFlag(args.flags, 'output-dir');
    // Agent mode (global --json) forces a machine-readable summary on stdout.
    const format = isJsonMode() ? 'json' : (getStringFlag(args.flags, 'format') ?? 'text');
    const failFast = hasFlag(args.flags, 'fail-fast');
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (inputDir === undefined) {
        throw new CliError('batch requires --input-dir <dir>.', 2);
    }
    if (outputDir === undefined) {
        throw new CliError('batch requires --output-dir <dir>.', 2);
    }
    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }
    validatePath(inputDir);
    validatePath(outputDir);

    const concurrencyRaw = getStringFlag(args.flags, 'concurrency');
    let concurrency = 4;
    if (concurrencyRaw !== undefined) {
        const n = Number.parseInt(concurrencyRaw, 10);
        if (!Number.isInteger(n) || n < 1) {
            throw new CliError('--concurrency must be a positive integer.', 2);
        }
        concurrency = n;
    }

    let entries: string[];
    try {
        entries = await readdir(inputDir);
    } catch {
        throw new CliError(`Cannot read --input-dir: ${inputDir}`, 1, ErrorCode.IO);
    }
    const inputs = entries.filter((e) => extname(e).toLowerCase() === '.json').sort();
    if (inputs.length === 0) {
        throw new CliError(`No .json files found in ${inputDir}.`, 1, ErrorCode.INPUT);
    }

    // In dry-run we validate every input via render (which short-circuits before
    // writing); no output directory is created and no PDF is written.
    if (!dryRun) {
        await mkdir(outputDir, { recursive: true });
    }

    const results: FileResult[] = [];
    let aborted = false;

    await runPool(inputs, concurrency, async (file) => {
        if (aborted) return;
        const input = join(inputDir, file);
        const output = join(outputDir, `${basename(file, extname(file))}.pdf`);
        try {
            await render(forwardedFlags(args, input, output));
            results.push({ input, output, ok: true, error: null });
            progress(`${style('✓', 'green')} ${file} → ${basename(output)}`);
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            results.push({ input, output, ok: false, error });
            progress(`${style('✗', 'red')} ${file}: ${error}`);
            if (failFast) aborted = true;
        }
    });

    const failures = results.filter((r) => !r.ok).length;
    const succeeded = results.length - failures;

    if (format === 'json') {
        const summary = hasFlag(args.flags, 'summary');
        const fieldsRaw = getStringFlag(args.flags, 'fields');
        let out: unknown = summary
            ? { total: inputs.length, succeeded, failed: failures }
            : { total: inputs.length, succeeded, failed: failures, results };
        if (fieldsRaw !== undefined) {
            out = selectFields(out, parseFieldList(fieldsRaw));
        }
        // Compact for agents (--json), pretty for humans; --pretty forces pretty.
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        process.stdout.write(serializeJson(out, pretty) + '\n');
    } else {
        process.stdout.write(`Rendered ${succeeded}/${inputs.length} file(s), ${failures} failed.\n`);
    }

    if (failures > 0) {
        throw new CliError('', 1);
    }
}
