// `pdfnative batch` — batch orchestration.
//
// Two mutually exclusive modes:
//   • Directory mode (--input-dir/--output-dir): render every JSON file in a
//     directory through the full `render` pipeline (every render flag —
//     variant, layout, smart tables, PDF/A, compression … — is honoured) with
//     a bounded-concurrency worker pool.
//   • Manifest mode (--manifest tasks.json): run an ordered multi-command
//     pipeline (render → sign → encrypt → …) with "@id" output references,
//     strict pre-validation and an offline-by-default network policy. See
//     src/utils/manifest.ts.

import { readdir, mkdir, readFile } from 'node:fs/promises';
import { join, basename, dirname, extname, resolve } from 'node:path';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { validatePath, assertJsonSizeLimit } from '../utils/io.js';
import { CliError, ErrorCode, type ErrorCodeValue } from '../utils/error.js';
import { isJsonMode, isDryRun } from '../utils/agent.js';
import { selectFields, serializeJson, parseFieldList } from '../utils/projection.js';
import { style } from '../utils/colors.js';
import {
    parseManifest,
    assertOfflinePolicy,
    type ManifestPlan,
    type ManifestTaskPlan,
} from '../utils/manifest.js';
import { render } from './render.js';

// Flags consumed by `batch` itself and therefore NOT forwarded to `render`.
const BATCH_ONLY_FLAGS = new Set([
    'input-dir', 'output-dir', 'concurrency', 'fail-fast', 'format',
    'input', 'i', 'output', 'o', 'watch', 'stream', 'stream-page-by-page',
    'summary', 'fields', 'pretty',
    'manifest', 'allow-network', 'continue-on-error',
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

type CommandFn = (args: ParsedArgs) => Promise<void>;

/**
 * Dynamically import a manifest task's command function — mirroring
 * `loadCommand()` in src/index.ts, but local so `batch` never imports the
 * dispatcher. Commands from parallel v1.4.0 tranches that are not present in
 * this build fall through to a computed import and fail with E_UNSUPPORTED.
 */
async function loadTaskCommand(name: string): Promise<CommandFn> {
    switch (name) {
        case 'render': return (await import('./render.js')).render;
        case 'sign': return (await import('./sign.js')).sign;
        case 'verify': return (await import('./verify.js')).verify;
        case 'inspect': return (await import('./inspect.js')).inspect;
        case 'merge': return (await import('./merge.js')).merge;
        case 'split': return (await import('./split.js')).split;
        case 'extract': return (await import('./extract.js')).extract;
        case 'extract-text': return (await import('./extract-text.js')).extractTextCmd;
        case 'fill': return (await import('./fill.js')).fill;
        case 'encrypt': return (await import('./encrypt.js')).encrypt;
        case 'decrypt': return (await import('./decrypt.js')).decrypt;
        case 'annotate': return (await import('./annotate.js')).annotate;
        case 'ltv': return (await import('./ltv.js')).ltv;
        case 'doc-timestamp': return (await import('./docTimestamp.js')).docTimestamp;
        case 'metadata': return (await import('./metadata.js')).metadata;
        case 'compare': return (await import('./compare.js')).compare;
        default: {
            // Safety net for whitelisted commands whose module is missing from
            // this build (e.g. a parallel-tranche module not merged yet). A
            // computed specifier keeps this file free of static references to
            // files that may not exist; add a literal case above when a module
            // lands so the bundler inlines it into dist/cli.cjs.
            const specifier = `./${name}.js`;
            let mod: Record<string, unknown>;
            try {
                mod = (await import(specifier)) as Record<string, unknown>;
            } catch {
                throw new CliError(
                    `Manifest command "${name}" is not available in this build.`,
                    1,
                    ErrorCode.UNSUPPORTED,
                );
            }
            const camel = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
            const fn = mod[camel] ?? mod[`${camel}Cmd`];
            if (typeof fn !== 'function') {
                throw new CliError(
                    `Manifest command "${name}" is not available in this build.`,
                    1,
                    ErrorCode.UNSUPPORTED,
                );
            }
            return fn as CommandFn;
        }
    }
}

interface ManifestTaskResult {
    readonly id: string;
    readonly command: string;
    readonly ok: boolean;
    readonly output?: string;
    readonly error?: { readonly code: ErrorCodeValue; readonly message: string };
    readonly skipped?: true;
}

/** Write the final manifest summary (stdout) honouring the projection flags. */
function emitManifestSummary(
    args: ParsedArgs,
    format: 'json' | 'text',
    counts: { total: number; succeeded: number; failed: number; skipped: number },
    tasks: readonly ManifestTaskResult[],
    dryRun: boolean,
): void {
    if (format === 'json') {
        const base: Record<string, unknown> = {
            ok: counts.failed === 0,
            command: 'batch',
            mode: 'manifest',
            ...(dryRun ? { dryRun: true } : {}),
            total: counts.total,
            succeeded: counts.succeeded,
            failed: counts.failed,
            skipped: counts.skipped,
        };
        let out: unknown = hasFlag(args.flags, 'summary') ? base : { ...base, tasks };
        const fieldsRaw = getStringFlag(args.flags, 'fields');
        if (fieldsRaw !== undefined) {
            out = selectFields(out, parseFieldList(fieldsRaw));
        }
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        process.stdout.write(serializeJson(out, pretty) + '\n');
    } else if (dryRun) {
        process.stdout.write(
            `Dry run: ${counts.total} task(s) validated, nothing executed.\n`,
        );
    } else {
        process.stdout.write(
            `Manifest: ${counts.succeeded}/${counts.total} task(s) succeeded, `
            + `${counts.failed} failed, ${counts.skipped} skipped.\n`,
        );
    }
}

/** Execute (or dry-run) a validated manifest plan sequentially. */
async function runManifest(manifestPath: string, args: ParsedArgs): Promise<void> {
    const format = isJsonMode() ? 'json' : (getStringFlag(args.flags, 'format') ?? 'text');
    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid: json, text.`, 2);
    }
    const allowNetwork = hasFlag(args.flags, 'allow-network');
    const continueOnError = hasFlag(args.flags, 'continue-on-error');
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    validatePath(manifestPath);
    let rawBuf: Buffer;
    try {
        rawBuf = await readFile(manifestPath);
    } catch {
        throw new CliError(`Cannot read --manifest: ${manifestPath}`, 1, ErrorCode.IO);
    }
    assertJsonSizeLimit(rawBuf);
    const raw = rawBuf.toString('utf8');

    const plan: ManifestPlan = parseManifest(raw, dirname(resolve(manifestPath)));
    assertOfflinePolicy(plan, allowNetwork);
    const total = plan.tasks.length;

    if (dryRun) {
        // Everything is validated (structure, whitelist, @ref graph, network
        // policy). Print the plan and stop — nothing is created or executed.
        if (format === 'text') {
            plan.tasks.forEach((task: ManifestTaskPlan, i: number) => {
                const target = task.output !== undefined ? ` → ${task.output}` : '';
                process.stdout.write(`plan [${i + 1}/${total}] ${task.command} ${task.id}${target}\n`);
            });
        }
        const planned = plan.tasks.map((t): ManifestTaskResult => ({
            id: t.id,
            command: t.command,
            ok: true,
            ...(t.output !== undefined ? { output: t.output } : {}),
        }));
        emitManifestSummary(args, format, { total, succeeded: 0, failed: 0, skipped: 0 }, planned, true);
        return;
    }

    const results: ManifestTaskResult[] = [];
    const status = new Map<string, 'ok' | 'failed' | 'skipped'>();
    let aborted = false;
    let firstErrorCode: ErrorCodeValue | undefined;

    for (const [i, task] of plan.tasks.entries()) {
        const label = `→ [${i + 1}/${total}] ${task.command} ${task.id}`;
        const brokenDep = task.dependsOn.find((dep) => status.get(dep) !== 'ok');
        if (aborted || brokenDep !== undefined) {
            status.set(task.id, 'skipped');
            results.push({
                id: task.id,
                command: task.command,
                ok: false,
                skipped: true,
                ...(task.output !== undefined ? { output: task.output } : {}),
            });
            progress(`${label} … ${style('skipped', 'yellow')}`);
            continue;
        }
        try {
            if (task.outputDir !== undefined) {
                await mkdir(task.outputDir, { recursive: true });
            }
            const fn = await loadTaskCommand(task.command);
            await fn({ flags: { ...task.flags }, positionals: [] });
            status.set(task.id, 'ok');
            results.push({
                id: task.id,
                command: task.command,
                ok: true,
                ...(task.output !== undefined ? { output: task.output } : {}),
            });
            progress(`${label} … ${style('ok', 'green')}`);
        } catch (e) {
            const code: ErrorCodeValue = e instanceof CliError ? e.code : ErrorCode.RUNTIME;
            const message = e instanceof Error ? e.message : String(e);
            firstErrorCode ??= code;
            status.set(task.id, 'failed');
            results.push({
                id: task.id,
                command: task.command,
                ok: false,
                error: { code, message },
            });
            progress(`${label} … ${style('failed', 'red')} (${message})`);
            if (!continueOnError) aborted = true;
        }
    }

    const failed = results.filter((r) => r.error !== undefined).length;
    const skipped = results.filter((r) => r.skipped === true).length;
    const succeeded = total - failed - skipped;

    emitManifestSummary(args, format, { total, succeeded, failed, skipped }, results, false);

    if (failed > 0) {
        throw new CliError('', 1, firstErrorCode);
    }
}

export async function batch(args: ParsedArgs): Promise<void> {
    const inputDir = getStringFlag(args.flags, 'input-dir');
    const outputDir = getStringFlag(args.flags, 'output-dir');

    // Manifest mode — mutually exclusive with the directory-render mode.
    const manifestPath = getStringFlag(args.flags, 'manifest');
    if (manifestPath !== undefined) {
        if (inputDir !== undefined || outputDir !== undefined) {
            throw new CliError(
                '--manifest is mutually exclusive with --input-dir/--output-dir.',
                2,
            );
        }
        await runManifest(manifestPath, args);
        return;
    }
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
