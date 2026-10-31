#!/usr/bin/env tsx
/**
 * pdfnative-cli — compat-previous: the previous release's own test suite,
 * run against the current sources (v1.6.0)
 * =====================================================================
 * The zero-breaking-change policy of the process contract (SECURITY.md
 * §Compatibility promise) is proven mechanically in two halves:
 * `tests/tools/manifest-compat.test.ts` checks that every command, flag,
 * global flag, error code, schema subject and envelope field the previous
 * release's `schema manifest` / `schema status` listed still exists with the
 * same shape, and THIS script checks that the previous release's behaviour
 * still holds — by running its test suite, exactly as it was tagged, against
 * today's `src/`.
 *
 * What it does:
 *   1. `git archive <tag> tests samples vitest.config.ts` into
 *      `test-output/.compat/<version>/` (git-ignored; a dot-directory, which
 *      the sample walkers skip, removed again when the run ends unless
 *      `--keep`) — the archived suite reads its own sample inputs;
 *   2. copies the current `src/` and `scripts/` next to it (and `dist/`
 *      when present, so the archived reproducible-build round-trip spawns
 *      the current binary), plus the root tsconfigs, package.json and the
 *      governance sources the archived tests compare with `src/`, so the
 *      archived tests' relative imports (`../../src/…`, `../../scripts/…`)
 *      resolve to the sources under test;
 *   3. runs vitest in that directory with the archived configuration,
 *      excluding the files listed in `tests/compat/allow-<version>.json` —
 *      each with a reason and, for a behaviour change, the compatibility
 *      ledger entry (C1…Cn in the release note) that justifies it.
 *
 * Exit code: vitest's (0 green, 1 red), 2 on usage or git failure — among
 * them a tag that is not available locally, named with the fetch command,
 * so that the gate's `--require-all` reports the cause rather than an opaque
 * failure.
 *
 * Usage:
 *   npx tsx scripts/run-compat.ts                 # tag from tests/compat/allow-*.json
 *   npx tsx scripts/run-compat.ts --tag v1.5.0
 *   npx tsx scripts/run-compat.ts --list          # print the exclusions and exit
 *   npx tsx scripts/run-compat.ts --keep          # leave test-output/.compat/<version> behind for inspection
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** The current trees the archived suite imports, besides its own files (`dist` only when built). */
const CURRENT_TREES = ['src', 'scripts'] as const;
/**
 * Root files the copied trees and the archived tests reach for:
 * scripts/tsconfig.json extends ../tsconfig.scripts.json; the governance
 * tests compare `.github/ai-governance.json` and `.github/AGENT_RULES.md`
 * with the text embedded in src/utils/governance.ts — the current pair.
 */
const CURRENT_FILES = ['tsconfig.json', 'tsconfig.scripts.json', 'tsconfig.test.json', 'package.json', '.github/ai-governance.json', '.github/AGENT_RULES.md', 'AGENTS.md'] as const;
/** Directories the governance tests resolve references into (`.github/ai-governance.json` → references). */
const CURRENT_DIRS = ['.github/ISSUE_TEMPLATE'] as const;

export interface CompatExclusion {
    /** A vitest include-style glob, relative to the archived tree (e.g. `tests/docs/**`). */
    readonly pattern: string;
    /** Why this file of the previous suite cannot run against the current sources. */
    readonly reason: string;
    /** The release note's compatibility-ledger entry (`C1`…) when the reason is a behaviour change. */
    readonly ledger?: string;
}

export interface CompatAllowList {
    readonly tag: string;
    readonly exclude: readonly CompatExclusion[];
}

/** The newest `tests/compat/allow-<version>.json` — the previous release's. */
export function findAllowList(root: string): string | null {
    const dir = join(root, 'tests', 'compat');
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => /^allow-\d+\.\d+\.\d+\.json$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return files.length === 0 ? null : join(dir, files[files.length - 1] as string);
}

export function parseAllowList(text: string): CompatAllowList {
    const parsed = JSON.parse(text) as { tag?: unknown; exclude?: unknown };
    if (typeof parsed.tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(parsed.tag)) throw new Error('allow-list: "tag" must be a vX.Y.Z string');
    if (!Array.isArray(parsed.exclude)) throw new Error('allow-list: "exclude" must be an array');
    for (const e of parsed.exclude as Array<Record<string, unknown>>) {
        if (typeof e.pattern !== 'string' || e.pattern === '') throw new Error('allow-list: every exclusion needs a "pattern"');
        if (typeof e.reason !== 'string' || e.reason.length < 20) throw new Error(`allow-list: ${String(e.pattern)} needs a "reason" (a sentence, not a word)`);
        if (e.ledger !== undefined && (typeof e.ledger !== 'string' || !/^C\d+$/.test(e.ledger))) throw new Error(`allow-list: ${e.pattern} ledger must look like "C3"`);
    }
    return { tag: parsed.tag, exclude: parsed.exclude as CompatExclusion[] };
}

/** Whether `tag` resolves to a commit in this clone (the gate's skip condition). */
export function tagAvailable(root: string, tag: string): boolean {
    return git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], { cwd: root }).status === 0;
}

function git(args: string[], options: { cwd?: string } = {}): { status: number | null; stdout: Buffer; stderr: string } {
    const r = spawnSync('git', args, { cwd: options.cwd ?? ROOT, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
    return { status: r.status, stdout: r.stdout ?? Buffer.alloc(0), stderr: r.stderr?.toString('utf8') ?? '' };
}

function main(): number {
    const args = process.argv.slice(2);
    const tagArg = args.indexOf('--tag');
    const listOnly = args.includes('--list');

    const allowPath = findAllowList(ROOT);
    if (allowPath === null) {
        process.stderr.write('run-compat: no tests/compat/allow-<version>.json — nothing to check against\n');
        return 2;
    }
    const allow = parseAllowList(readFileSync(allowPath, 'utf8'));
    const tag = tagArg >= 0 ? (args[tagArg + 1] ?? '') : allow.tag;
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
        process.stderr.write(`run-compat: tag "${tag}" is not of the form vX.Y.Z\n`);
        return 2;
    }
    if (listOnly) {
        process.stdout.write(`compat-previous: ${tag} suite against the current sources; exclusions from ${allowPath}:\n`);
        for (const e of allow.exclude) process.stdout.write(`  ${e.pattern.padEnd(48)} ${e.ledger ? `[${e.ledger}] ` : ''}${e.reason}\n`);
        return 0;
    }

    if (!tagAvailable(ROOT, tag)) {
        process.stderr.write(`run-compat: tag ${tag} is not available — fetch it first (git fetch --no-tags origin +refs/tags/${tag}:refs/tags/${tag})\n`);
        return 2;
    }

    const version = tag.slice(1);
    const dir = join(ROOT, 'test-output', '.compat', version);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    // 1. The archived tree: `git archive` writes a tar; extract it with the
    //    platform's tar (present on every GitHub runner and on Windows 10+).
    const archive = git(['archive', '--format=tar', tag, 'tests', 'samples', 'vitest.config.ts']);
    if (archive.status !== 0) {
        process.stderr.write(`run-compat: git archive ${tag} failed — ${archive.stderr.trim()}\n`);
        return 2;
    }
    // Extract from inside the target directory: Git for Windows' tar reads a
    // `D:\…` argument to -C as a remote host.
    const untar = spawnSync('tar', ['-x', '-f', '-'], { cwd: dir, input: archive.stdout, windowsHide: true });
    if (untar.status !== 0) {
        process.stderr.write(`run-compat: tar extraction failed — ${untar.stderr?.toString('utf8').trim() ?? ''}\n`);
        return 2;
    }

    // 2. The sources under test, where the archived tests expect them.
    for (const tree of CURRENT_TREES) cpSync(join(ROOT, tree), join(dir, tree), { recursive: true });
    if (existsSync(join(ROOT, 'dist', 'cli.cjs'))) cpSync(join(ROOT, 'dist'), join(dir, 'dist'), { recursive: true });
    for (const file of CURRENT_FILES) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        cpSync(join(ROOT, file), join(dir, file));
    }
    for (const tree of CURRENT_DIRS) {
        if (existsSync(join(ROOT, tree))) cpSync(join(ROOT, tree), join(dir, tree), { recursive: true });
    }

    // 3. The archived suite with the archived configuration, minus the allow-list.
    const vitest = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
    if (!existsSync(vitest)) {
        process.stderr.write('run-compat: node_modules/vitest/vitest.mjs is missing — npm ci first\n');
        return 2;
    }
    const vitestArgs = ['run', '--config', 'vitest.config.ts'];
    for (const e of allow.exclude) vitestArgs.push('--exclude', e.pattern);
    process.stdout.write(`compat-previous: ${tag} suite (${allow.exclude.length} exclusion${allow.exclude.length === 1 ? '' : 's'}) against the current src/ in ${dir}\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, TZ: 'UTC' };
    // The archived config would otherwise write its JSON report over the
    // gate's, and the artefact guard would demand samples the archived tree
    // never generated.
    delete env.GATE;
    delete env.GATE_REQUIRE_ARTIFACTS;
    const r = spawnSync(process.execPath, [vitest, ...vitestArgs], { cwd: dir, stdio: 'inherit', env, windowsHide: true });
    // Left behind, the archived fixtures and the copied trees would be
    // walked by every sample and docs walker that does not skip dot-dirs.
    if (!args.includes('--keep')) rmSync(dir, { recursive: true, force: true });
    return r.status ?? 1;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
    process.exit(main());
}
