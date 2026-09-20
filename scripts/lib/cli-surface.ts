/**
 * pdfnative-cli — the command surface, derived from the source constants
 * ======================================================================
 * `docs/assets/ecosystem.json` quotes counts the docs repeat in prose: how
 * many commands, schema subjects, stable error codes, global flags, manifest
 * commands, corpus files, samples. None of those figures is hand-maintained
 * here: they are read from the constants the CLI itself runs on —
 * `COMMANDS` / `GLOBAL_FLAGS` (completion.ts, which also feeds the
 * capability manifest), `SUBJECTS` (schema.ts), `ErrorCode` (error.ts),
 * `MANIFEST_COMMANDS` (manifest.ts), the conformance corpus table, the
 * bundled-font table — and from directory walks for the samples and tests.
 *
 * The parsers over `src/index.ts` and README.md are pure functions over text
 * (unit-tested in tests/tools/cli-surface.test.ts); `computeDerived()` is the
 * one function that touches the filesystem, used by `scripts/verify-docs.ts`
 * (rules `derived-counts`, `command-parity`, `flag-parity`, `error-parity`,
 * `schema-parity`) and by the gate's smoke step.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { COMMANDS, GLOBAL_FLAGS } from '../../src/commands/completion.js';
import { SUBJECTS } from '../../src/commands/schema.js';
import { ErrorCode } from '../../src/utils/error.js';
import { MANIFEST_COMMANDS } from '../../src/utils/manifest.js';
import { BUNDLED_FONT_MODULES, SCRIPT_CODES, FONT_ALIASES } from '../../src/utils/fonts.js';
import { CORPUS } from './pdfa-corpus.js';

// ── Source constants ─────────────────────────────────────────────────

/** Every command the completion table (and therefore the manifest) knows, in table order. */
export function commandNames(): string[] {
    return COMMANDS.map((c) => c.name);
}

/** `E_USAGE`, `E_INPUT`, … — the stable error codes, in declaration order. */
export function errorCodeValues(): string[] {
    return Object.values(ErrorCode);
}

/** `USAGE`, `INPUT`, … — the keys of the ErrorCode table. */
export function errorCodeKeys(): string[] {
    return Object.keys(ErrorCode);
}

export function schemaSubjects(): readonly string[] {
    return SUBJECTS;
}

export function globalFlags(): readonly string[] {
    return GLOBAL_FLAGS;
}

export function manifestCommands(): string[] {
    return [...MANIFEST_COMMANDS].sort();
}

/** Flags the completion table declares for one command (null when unknown). */
export function completionFlags(command: string): readonly string[] | null {
    return COMMANDS.find((c) => c.name === command)?.flags ?? null;
}

// ── src/index.ts parsers ─────────────────────────────────────────────

/** Commands listed under `Commands (N):` in the top-level USAGE text, and the N it claims. */
export function usageCommandList(indexText: string): { readonly declared: number | null; readonly commands: string[] } {
    const text = indexText.replace(/\r\n/g, '\n');
    const start = /^Commands \((\d+)\):\s*$/m.exec(text);
    if (!start) return { declared: null, commands: [] };
    const declared = Number(start[1]);
    const rest = text.slice(start.index + start[0].length);
    const end = /^Options:\s*$/m.exec(rest);
    const block = end ? rest.slice(0, end.index) : rest;
    const commands: string[] = [];
    for (const line of block.split('\n')) {
        const m = /^ {2}([a-z][a-z-]*)\s{2,}\S/.exec(line);
        if (m) commands.push(m[1]);
    }
    return { declared, commands };
}

/**
 * Every `case '<name>':` label in src/index.ts, counted. A command appears
 * twice — once in the `--help` switch (its `<NAME>_USAGE` text) and once in
 * `loadCommand()` — so a command wired in one switch but not the other is
 * caught without parsing either function body.
 */
export function switchCaseCounts(indexText: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of indexText.matchAll(/^\s*case '([a-z][a-z-]*)':/gm)) {
        out.set(m[1], (out.get(m[1]) ?? 0) + 1);
    }
    return out;
}

/** `RENDER_USAGE` → `render`, `DOC_TIMESTAMP_USAGE` → `doc-timestamp`. */
export function usageConstantCommand(constant: string): string {
    return constant.replace(/_USAGE$/, '').toLowerCase().replace(/_/g, '-');
}

/**
 * The `--flag` tokens of every `<NAME>_USAGE` template literal, keyed by
 * command. The top-level `USAGE` (global options) is left out: its flags are
 * the GLOBAL_FLAGS table's business. A line marked `DEPRECATED` documents a
 * flag that still parses but is no longer advertised (completions never
 * propose it), so its tokens are skipped.
 */
export function usageFlagsByCommand(indexText: string): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    const text = indexText.replace(/\r\n/g, '\n');
    const re = /^const ([A-Z][A-Z_]*)_USAGE = `\\?\n([\s\S]*?)^`;/gm;
    for (const m of text.matchAll(re)) {
        const command = usageConstantCommand(`${m[1]}_USAGE`);
        const flags = new Set<string>();
        for (const line of m[2].split('\n')) {
            if (/\bDEPRECATED\b/.test(line)) continue;
            for (const f of line.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*)/g)) flags.add(f[1]);
        }
        out.set(command, flags);
    }
    return out;
}

export interface FlagDrift {
    readonly command: string;
    /** In the usage text, absent from the completion table. */
    readonly usageOnly: string[];
    /** In the completion table, never mentioned by the usage text. */
    readonly completionOnly: string[];
}

/**
 * Compare each command's usage text with its completion entry. A usage text
 * may legitimately name a flag of ANOTHER command in prose ("see `sign
 * --timestamp`"), so a token is only "usage-only" when no command's
 * completion entry and no global flag knows it; a completion flag the usage
 * never mentions is always drift (the user cannot discover it).
 */
export function flagDrift(indexText: string): FlagDrift[] {
    const known = new Set<string>(GLOBAL_FLAGS);
    for (const c of COMMANDS) for (const f of c.flags) known.add(f);
    const out: FlagDrift[] = [];
    for (const [command, usageFlags] of usageFlagsByCommand(indexText)) {
        const table = completionFlags(command);
        if (table === null) {
            out.push({ command, usageOnly: [...usageFlags].sort(), completionOnly: [] });
            continue;
        }
        const tableSet = new Set(table);
        const usageOnly = [...usageFlags].filter((f) => !tableSet.has(f) && !known.has(f)).sort();
        const completionOnly = table.filter((f) => !usageFlags.has(f)).sort();
        if (usageOnly.length > 0 || completionOnly.length > 0) out.push({ command, usageOnly, completionOnly });
    }
    return out;
}

// ── Markdown parsers ─────────────────────────────────────────────────

/** Commands with a `### \`pdfnative <name>\`` reference heading in README.md, in order. */
export function readmeCommandHeadings(readme: string): string[] {
    return [...readme.matchAll(/^###\s+`pdfnative ([a-z][a-z-]*)`/gm)].map((m) => m[1]);
}

/** `E_*` tokens of a document, word-bounded (never the tail of `PDFNATIVE_SIGN_CERT`). */
export function errorTokens(text: string): string[] {
    return [...new Set([...text.matchAll(/(?<![A-Z_])E_[A-Z][A-Z_]*\b/g)].map((m) => m[0]))].sort();
}

/** Keys of the `DEFAULT_MESSAGE` table in src/utils/agent.ts (`[ErrorCode.USAGE]: …` → `USAGE`). */
export function defaultMessageKeys(agentText: string): string[] {
    const block = /const DEFAULT_MESSAGE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(agentText);
    if (!block) return [];
    return [...block[1].matchAll(/\[ErrorCode\.([A-Z_]+)\]:/g)].map((m) => m[1]);
}

// ── Directory walks ──────────────────────────────────────────────────

function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, filter, out);
        else if (filter(full)) out.push(full);
    }
    return out;
}

/** Directories under samples/ that are not a command: run in a shell, not by one command. */
export const NON_COMMAND_SAMPLE_DIRS: readonly string[] = ['agent', 'config', 'output', 'streaming'];

export function sampleDirs(root: string): string[] {
    const dir = join(root, 'samples');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory()).sort();
}

/** Sample scripts with no twin: every `.sh` needs a `.ps1` beside it and vice versa. */
export function unpairedSampleScripts(root: string): string[] {
    const scripts = walk(join(root, 'samples'), (p) => /\.(sh|ps1)$/.test(p));
    const set = new Set(scripts.map((p) => p.replace(/\\/g, '/')));
    const out: string[] = [];
    for (const p of set) {
        const twin = p.endsWith('.sh') ? `${p.slice(0, -3)}.ps1` : `${p.slice(0, -4)}.sh`;
        if (!set.has(twin)) out.push(p.slice(root.replace(/\\/g, '/').length + 1));
    }
    return out.sort();
}

export interface DerivedCounts {
    readonly commands: number;
    readonly schemaSubjects: number;
    readonly errorCodes: number;
    readonly globalFlags: number;
    readonly manifestCommands: number;
    readonly pdfaCorpus: number;
    readonly bundledFontModules: number;
    readonly unicodeScripts: number;
    readonly fontAliases: number;
    readonly testFiles: number;
    readonly renderSamples: number;
    readonly sampleScripts: number;
    readonly samplePdfs: number;
}

/** Number of entries in the committed sample baseline (0 when absent or unreadable). */
export function baselineEntryCount(root: string): number {
    const file = join(root, 'tests', 'regression', 'baselines', 'samples.sha256.json');
    if (!existsSync(file)) return 0;
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as { entries?: Record<string, unknown> };
        return Object.keys(parsed.entries ?? {}).length;
    } catch {
        return 0;
    }
}

/** Every counter `derived.*` in docs/assets/ecosystem.json is held to. */
export function computeDerived(root: string): DerivedCounts {
    return {
        commands: COMMANDS.length,
        schemaSubjects: SUBJECTS.length,
        errorCodes: Object.keys(ErrorCode).length,
        globalFlags: GLOBAL_FLAGS.length,
        manifestCommands: MANIFEST_COMMANDS.size,
        pdfaCorpus: CORPUS.length,
        bundledFontModules: Object.keys(BUNDLED_FONT_MODULES).length,
        unicodeScripts: SCRIPT_CODES.length,
        fontAliases: Object.keys(FONT_ALIASES).length,
        testFiles: walk(join(root, 'tests'), (p) => p.endsWith('.test.ts')).length,
        renderSamples: walk(join(root, 'samples', 'render'), (p) => p.endsWith('.json')).length,
        sampleScripts: walk(join(root, 'samples'), (p) => p.endsWith('.sh')).length,
        samplePdfs: baselineEntryCount(root),
    };
}
