#!/usr/bin/env tsx
/**
 * pdfnative-cli — Quality gate (v1.5.0)
 * =======================================
 * The single definition of what "green" means. CI, the contributor docs and
 * the agent instructions all point here instead of each carrying its own
 * list of commands, so the list cannot drift between them. Ported from
 * pdfnative's scripts/gate.ts (1.8.0) with the CLI's own step table.
 *
 * Every step is an existing npm script, plus five inline checks: that
 * `dist/` is complete, that the BUILT binary answers (`smoke` — the bundle
 * gotcha: tsup flattens src/ into one file, so a path that resolves in
 * source can fail in dist/), that the bundle stays under its byte budget,
 * that it keeps the engine external and carries nothing it should not
 * (`bundle-check`), and nothing else. The gate runs them in order, captures each one's full
 * output to `test-output/.gate/<id>.log`, and prints ONE line per step — a
 * passing run is under twenty lines, which is what makes it usable from an
 * agent loop where every line of output costs tokens. On the first failure
 * it prints the tail of that step's log and stops.
 *
 * Usage:
 *   npm run gate                     # --ci: everything except validate:pdfa
 *   npm run gate:fast                # typecheck:all, lint, test, verify:docs
 *   npx tsx scripts/gate.ts --publish   # everything, including validate:pdfa
 *   npx tsx scripts/gate.ts --only lint
 *   npx tsx scripts/gate.ts --from build
 *   npx tsx scripts/gate.ts --ci --json
 *   npx tsx scripts/gate.ts --publish --require-all   # what publish.yml runs
 *
 * (PowerShell swallows a bare `--`, so call the script directly when passing
 * flags rather than `npm run gate -- --fast`; `npm run gate:fast` exists for
 * the common case.)
 *
 * Profiles:
 *   --fast     typecheck:all, lint, test, verify:docs
 *   --ci       every step except validate:pdfa (default)
 *   --publish  every step; validate:pdfa SKIPs with a reason when veraPDF is
 *              absent, like the script it wraps
 *
 * Flags:
 *   --require-all  a step that would SKIP fails instead, with
 *                  `required by --require-all: <reason>`. CI and the release
 *                  workflow pass it: a runner without veraPDF must go red,
 *                  never quietly skip a check.
 *
 * Exit codes:
 *   0 — every selected step passed or was skipped with a reason
 *   1 — a step failed (its log tail is printed; the full log is on disk),
 *       or a step would have skipped under --require-all
 *   2 — bad usage
 */

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from '../src/commands/completion.js';
import { SUBJECTS } from '../src/commands/schema.js';
import { locateVeraPdf } from './lib/verapdf.js';
import { probeBundle, REQUIRED_EXTERNALS } from './lib/bundle-probe.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(REPO_ROOT, 'test-output', '.gate');
const VITEST_JSON = join(LOG_DIR, 'vitest.json');
const COVERAGE_SUMMARY = join(REPO_ROOT, 'coverage', 'coverage-summary.json');
const MANIFEST = join(REPO_ROOT, 'docs', 'assets', 'ecosystem.json');
const CLI = join(REPO_ROOT, 'dist', 'cli.cjs');

export type Profile = 'fast' | 'ci' | 'publish';

export interface Step {
    readonly id: string;
    /** The npm script this step runs. Absent for the inline checks. */
    readonly npmScript?: string;
    readonly profiles: readonly Profile[];
    /** Returns a reason to skip the step, or null to run it. */
    readonly skipWhen?: () => string | null;
    /** Extra environment for the child process. */
    readonly env?: Readonly<Record<string, string>>;
    /** In-process check; returns the failure lines, empty when it passes. */
    readonly inline?: () => readonly string[];
    /** A short figure to show next to PASS, read after the step succeeds. */
    readonly note?: () => string | null;
}

// ── Skip conditions ─────────────────────────────────────────────────

function veraPdfInstalled(): boolean {
    return locateVeraPdf() !== null;
}

// ── Notes (figures shown next to PASS) ──────────────────────────────

function testCount(): string | null {
    if (!existsSync(VITEST_JSON)) return null;
    // The whole suite, skipped tests included — the figure `declared.tests`
    // in docs/assets/ecosystem.json is held to it.
    const report = JSON.parse(readFileSync(VITEST_JSON, 'utf8')) as { numTotalTests?: number; numPassedTests?: number; numPendingTests?: number };
    const total = report.numTotalTests ?? report.numPassedTests;
    if (typeof total !== 'number') return null;
    // A skipped suite is visible in the summary line, never silent (audit A-08).
    const pending = report.numPendingTests ?? 0;
    return pending > 0 ? `${total} tests, ${pending} skipped` : `${total} tests`;
}

function coverageFigure(): string | null {
    if (!existsSync(COVERAGE_SUMMARY)) return null;
    const summary = JSON.parse(readFileSync(COVERAGE_SUMMARY, 'utf8')) as {
        total?: { statements?: { pct?: number } };
    };
    const pct = summary.total?.statements?.pct;
    return typeof pct === 'number' ? `${pct.toFixed(1)}% stmts` : null;
}

function joinNotes(...parts: Array<string | null>): string | null {
    const kept = parts.filter((p): p is string => p !== null);
    return kept.length > 0 ? kept.join(', ') : null;
}

function bundleSize(): string | null {
    if (!existsSync(CLI)) return null;
    return `${(statSync(CLI).size / 1024).toFixed(0)} KiB`;
}

function samplePdfCount(): string | null {
    const dir = join(REPO_ROOT, 'test-output', 'samples');
    if (!existsSync(dir)) return null;
    let n = 0;
    const walk = (d: string): void => {
        for (const entry of readdirSync(d)) {
            const p = join(d, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (entry.endsWith('.pdf')) n++;
        }
    };
    walk(dir);
    return `${n} PDFs`;
}

// ── Inline checks ───────────────────────────────────────────────────

/** Files `npm run build` must leave behind for the package to be complete. */
const DIST_FILES = ['dist/cli.cjs', 'dist/cli.js', 'dist/cli.d.ts'] as const;

function distCheck(): readonly string[] {
    const failures = DIST_FILES.filter(f => !existsSync(join(REPO_ROOT, f))).map(f => `missing: ${f}`);
    if (existsSync(CLI)) {
        const firstLine = readFileSync(CLI, 'utf8').split('\n', 1)[0] ?? '';
        if (!firstLine.startsWith('#!/usr/bin/env node')) failures.push('dist/cli.cjs does not start with the node shebang');
    }
    return failures;
}

/**
 * Drive the BUILT binary the way a user would. Source tests import the
 * command functions directly, so this is the only place the bundle itself
 * is exercised before publish.
 */
function smoke(): readonly string[] {
    const failures: string[] = [];
    if (!existsSync(CLI)) return ['dist/cli.cjs is missing (run build first)'];
    const run = (args: readonly string[]): { status: number; stdout: string; stderr: string } => {
        const r = spawnSync(process.execPath, [CLI, ...args], {
            cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true,
            env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        });
        return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };

    const help = run(['--help']);
    if (help.status !== 0) failures.push(`--help exited ${help.status}`);
    for (const c of COMMANDS) {
        if (!help.stdout.includes(c.name)) failures.push(`--help does not list the "${c.name}" command`);
    }

    const pkgVersion = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
    const version = run(['--version']);
    if (version.stdout.trim() !== pkgVersion) {
        failures.push(`--version printed "${version.stdout.trim()}" but package.json says ${pkgVersion} (version.ts bundle resolution)`);
    }

    const doctor = run(['doctor', '--format', 'json']);
    try {
        const report = JSON.parse(doctor.stdout) as { ok?: boolean; checks?: unknown[] };
        if (report.ok !== true) failures.push(`doctor --format json reports ok: ${String(report.ok)}\n${doctor.stdout}`);
    } catch {
        failures.push(`doctor --format json is not JSON:\n${doctor.stdout}${doctor.stderr}`);
    }

    const list = run(['schema', 'list']);
    try {
        const report = JSON.parse(list.stdout) as { subjects?: unknown[] };
        const n = Array.isArray(report.subjects) ? report.subjects.length : -1;
        if (n !== SUBJECTS.length) failures.push(`schema list returned ${n} subjects, source declares ${SUBJECTS.length}`);
    } catch {
        failures.push(`schema list is not JSON:\n${list.stdout}${list.stderr}`);
    }

    return failures;
}

/**
 * The bundle budget lives in docs/assets/ecosystem.json so the figure is
 * quoted once. A release that grows the binary past it must raise the
 * budget deliberately, in the same commit, and say why.
 */
function bundleBudget(): readonly string[] {
    if (!existsSync(CLI)) return ['dist/cli.cjs is missing (run build first)'];
    if (!existsSync(MANIFEST)) return ['docs/assets/ecosystem.json is missing'];
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { declared?: { bundleBudgetBytes?: number } };
    const budget = manifest.declared?.bundleBudgetBytes;
    if (typeof budget !== 'number') return ['declared.bundleBudgetBytes is not set in docs/assets/ecosystem.json'];
    const size = statSync(CLI).size;
    return size <= budget ? [] : [`dist/cli.cjs is ${size} bytes, over the ${budget}-byte budget (declared.bundleBudgetBytes)`];
}

/**
 * The bundle keeps the engine external and carries nothing it should not
 * (engine markers, font data, PEM blocks, console.log, undeclared requires,
 * a stray shebang) — scripts/lib/bundle-probe.ts (v1.5.0).
 */
function bundleCheck(): readonly string[] {
    if (!existsSync(CLI)) return ['dist/cli.cjs is missing (run build first)'];
    return probeBundle(readFileSync(CLI, 'utf8'));
}

// ── The gate ────────────────────────────────────────────────────────

// Order matters in the ci / publish profiles: `build` and `test:generate`
// run BEFORE `test:coverage`, because two suites need what they produce —
// tests/integration/reproducible-build (spawns dist/cli.cjs) and
// tests/regression/samples (reads test-output/samples/). Before v1.5.0 the
// tests ran first and both suites skipped silently on every CI runner
// (audit A-08); now `GATE_REQUIRE_ARTIFACTS=1` makes them fail loudly when
// their input is missing. The fast profile keeps `test` first (no build).
export const STEPS: readonly Step[] = [
    { id: 'typecheck:all', npmScript: 'typecheck:all', profiles: ['fast', 'ci', 'publish'] },
    { id: 'lint', npmScript: 'lint', profiles: ['fast', 'ci', 'publish'] },
    {
        id: 'test', npmScript: 'test', profiles: ['fast'],
        env: { GATE: '1' }, note: testCount,
    },
    { id: 'build', npmScript: 'build', profiles: ['ci', 'publish'] },
    { id: 'dist-check', profiles: ['ci', 'publish'], inline: distCheck },
    { id: 'smoke', profiles: ['ci', 'publish'], inline: smoke, note: () => `${COMMANDS.length} commands` },
    { id: 'bundle-size', profiles: ['ci', 'publish'], inline: bundleBudget, note: bundleSize },
    { id: 'bundle-check', profiles: ['ci', 'publish'], inline: bundleCheck, note: () => `${REQUIRED_EXTERNALS.length} externals` },
    { id: 'test:generate', npmScript: 'test:generate', profiles: ['ci', 'publish'], note: samplePdfCount },
    {
        id: 'test:coverage', npmScript: 'test:coverage', profiles: ['ci', 'publish'],
        env: { GATE: '1', GATE_REQUIRE_ARTIFACTS: '1' }, note: () => joinNotes(testCount(), coverageFigure()),
    },
    { id: 'verify:docs', npmScript: 'verify:docs', profiles: ['fast', 'ci', 'publish'] },
    { id: 'verify:samples', npmScript: 'verify:samples', profiles: ['ci', 'publish'] },
    { id: 'corpus:pdfa', npmScript: 'corpus:pdfa', profiles: ['ci', 'publish'] },
    { id: 'validate:pdfx', npmScript: 'validate:pdfx', profiles: ['ci', 'publish'] },
    {
        id: 'validate:pdfa', npmScript: 'validate:pdfa', profiles: ['publish'],
        skipWhen: () => (veraPdfInstalled() ? null : 'veraPDF not installed'),
    },
];

// ── Running a step ──────────────────────────────────────────────────

/**
 * Run an npm script with its stdout and stderr interleaved into one log
 * file. `npm_execpath` is set whenever this script itself was started by
 * npm, and running that CLI under the current node keeps the whole gate on
 * one toolchain; outside npm (a bare `tsx scripts/gate.ts`) fall back to
 * whatever `npm` is on PATH — through a shell, since on Windows that is an
 * `npm.cmd` shim which Node refuses to spawn directly.
 */
function runNpmScript(script: string, logPath: string, extraEnv: Readonly<Record<string, string>>): number {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv, NO_COLOR: '1', FORCE_COLOR: '0' };
    const fd = openSync(logPath, 'w');
    try {
        const npmCli = process.env.npm_execpath;
        const common: SpawnSyncOptions = { cwd: REPO_ROOT, env, stdio: ['ignore', fd, fd], windowsHide: true };
        const result = npmCli && existsSync(npmCli)
            ? spawnSync(process.execPath, [npmCli, 'run', script], common)
            : spawnSync('npm', ['run', script], { ...common, shell: true });
        if (result.error) throw result.error;
        return result.status ?? 1;
    } finally {
        closeSync(fd);
    }
}

function runInline(check: () => readonly string[], logPath: string): number {
    const failures = check();
    const fd = openSync(logPath, 'w');
    try {
        writeSync(fd, failures.length === 0 ? 'ok\n' : `${failures.join('\n')}\n`);
    } finally {
        closeSync(fd);
    }
    return failures.length === 0 ? 0 : 1;
}

function tail(file: string, lines: number): string[] {
    if (!existsSync(file)) return [];
    const all = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
    return all.slice(-lines);
}

// ── CLI ─────────────────────────────────────────────────────────────

export interface Options {
    readonly profile: Profile;
    readonly only: string | null;
    readonly from: string | null;
    readonly json: boolean;
    /** Turn every SKIP into a FAIL (CI and the release workflow). */
    readonly requireAll: boolean;
}

function usage(): string {
    return [
        'Usage: npx tsx scripts/gate.ts [--fast | --ci | --publish] [--only <id>] [--from <id>] [--require-all] [--json]',
        '',
        `Steps: ${STEPS.map(s => s.id).join(', ')}`,
    ].join('\n');
}

export function parseArgs(argv: readonly string[]): Options | { error: string } {
    let profile: Profile | null = null;
    let only: string | null = null;
    let from: string | null = null;
    let json = false;
    let requireAll = false;
    const ids = new Set(STEPS.map(s => s.id));

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--fast' || a === '--ci' || a === '--publish') {
            const p = a.slice(2) as Profile;
            if (profile !== null && profile !== p) return { error: `--${profile} and ${a} are mutually exclusive` };
            profile = p;
        } else if (a === '--only' || a === '--from') {
            const id = argv[i + 1];
            if (id === undefined || id.startsWith('--')) return { error: `${a} needs a step id` };
            if (!ids.has(id)) return { error: `unknown step "${id}"` };
            if (a === '--only') only = id; else from = id;
            i++;
        } else if (a === '--json') {
            json = true;
        } else if (a === '--require-all') {
            requireAll = true;
        } else {
            return { error: `unknown argument "${a}"` };
        }
    }
    return { profile: profile ?? 'ci', only, from, json, requireAll };
}

interface StepOutcome {
    readonly id: string;
    readonly status: 'pass' | 'fail' | 'skip';
    readonly seconds: number;
    readonly note: string | null;
}

export function selectSteps(opts: Options): readonly Step[] {
    if (opts.only !== null) return STEPS.filter(s => s.id === opts.only);
    let selected = STEPS.filter(s => s.profiles.includes(opts.profile));
    if (opts.from !== null) {
        const at = selected.findIndex(s => s.id === opts.from);
        if (at < 0) {
            // The step exists but is not in this profile: run the profile
            // from the position it would occupy in the full table.
            const full = STEPS.findIndex(s => s.id === opts.from);
            selected = selected.filter(s => STEPS.indexOf(s) >= full);
        } else {
            selected = selected.slice(at);
        }
    }
    return selected;
}

function main(): number {
    const parsed = parseArgs(process.argv.slice(2));
    if ('error' in parsed) {
        process.stderr.write(`gate: ${parsed.error}\n${usage()}\n`);
        return 2;
    }
    const opts = parsed;
    const steps = selectSteps(opts);
    const width = Math.max(...STEPS.map(s => s.id.length));
    const say = (line: string): void => { if (!opts.json) process.stdout.write(`${line}\n`); };

    mkdirSync(LOG_DIR, { recursive: true });
    const outcomes: StepOutcome[] = [];
    const startedAt = Date.now();
    say(`gate --${opts.profile}: ${steps.length} step(s)`);

    let failedAt: string | null = null;
    for (const step of steps) {
        const reason = step.skipWhen?.() ?? null;
        if (reason !== null) {
            if (opts.requireAll) {
                const note = `required by --require-all: ${reason}`;
                outcomes.push({ id: step.id, status: 'fail', seconds: 0, note });
                say(`FAIL  ${step.id.padEnd(width)}          ${note}`);
                failedAt = step.id;
                break;
            }
            outcomes.push({ id: step.id, status: 'skip', seconds: 0, note: reason });
            say(`SKIP  ${step.id.padEnd(width)}          (${reason})`);
            continue;
        }

        const logPath = join(LOG_DIR, `${step.id.replace(/[^a-z0-9-]/gi, '-')}.log`);
        // A stale report from an earlier run must never be reported as this run's.
        if (step.env?.GATE === '1') rmSync(VITEST_JSON, { force: true });
        if (step.id === 'test:coverage') rmSync(COVERAGE_SUMMARY, { force: true });

        const t0 = Date.now();
        const status = step.inline
            ? runInline(step.inline, logPath)
            : runNpmScript(step.npmScript ?? step.id, logPath, step.env ?? {});
        const seconds = (Date.now() - t0) / 1000;
        const clock = `${seconds.toFixed(1)}s`.padStart(7);

        if (status === 0) {
            const note = step.note?.() ?? null;
            outcomes.push({ id: step.id, status: 'pass', seconds, note });
            say(`PASS  ${step.id.padEnd(width)}  ${clock}${note ? `  ${note}` : ''}`);
            continue;
        }

        const rel = relative(REPO_ROOT, logPath).replace(/\\/g, '/');
        outcomes.push({ id: step.id, status: 'fail', seconds, note: `exit ${status}; log: ${rel}` });
        say(`FAIL  ${step.id.padEnd(width)}  ${clock}  exit ${status}`);
        for (const line of tail(logPath, 12)) say(`      ${line}`);
        say(`      (full log: ${rel})`);
        failedAt = step.id;
        break;
    }

    const total = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (opts.json) {
        process.stdout.write(`${JSON.stringify({ ok: failedAt === null, profile: opts.profile, steps: outcomes }, null, 2)}\n`);
    } else if (failedAt !== null) {
        process.stdout.write(`gate: failed at ${failedAt}\n`);
    } else {
        const passed = outcomes.filter(o => o.status === 'pass').length;
        const skipped = outcomes.filter(o => o.status === 'skip').length;
        process.stdout.write(`gate: ${passed} passed, ${skipped} skipped in ${total} s\n`);
    }
    return failedAt === null ? 0 : 1;
}

// Only run when executed directly, so tests can import STEPS/parseArgs/selectSteps.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(main());
}
