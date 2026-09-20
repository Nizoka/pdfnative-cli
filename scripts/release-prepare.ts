#!/usr/bin/env tsx
/**
 * pdfnative-cli — Release preparation (ported from pdfnative 1.8.0)
 * ==================================================================
 * Applies the mechanical part of a version bump in one pass. Until 1.5.0 a
 * release spread the same number across a dozen files edited by hand —
 * package manifests, the ecosystem manifest, CITATION.cff, the SECURITY.md
 * support table, the README banner, the knowledge-base footer, llms.txt —
 * and nothing caught the drift (`verify:docs` now does, after the fact).
 *
 * What it edits, in order (every touched file is printed):
 *   1. package.json + package-lock.json `version`
 *   2. docs/assets/ecosystem.json `packages.pdfnative-cli.version` + `verifiedOn`,
 *      and the "Verified on" stamps the verified-on-parity rule holds to
 *      that date (llms.txt, docs/KNOWLEDGE_BASE.md, docs/AGENT_CONTRACT.md)
 *   3. CITATION.cff `version` + `date-released`
 *   4. SECURITY.md supported-versions table
 *   5. README.md "What's new in vX.Y.Z — built on pdfnative A.B.C" banner
 *      and its release-note link (the engine version is the package.json
 *      dependency floor)
 *   6. docs/KNOWLEDGE_BASE.md footer and llms.txt `Current version:` line
 *   7. release-notes/vX.Y.Z.md scaffolded from release-notes/TEMPLATE.md
 *
 * It never reserialises JSON or YAML: each edit is a targeted regex on the
 * one field it owns, so formatting, key order and comments survive and the
 * diff reads as the bump and nothing else.
 *
 * Usage:
 *   npx tsx scripts/release-prepare.ts --version 1.5.0
 *   npx tsx scripts/release-prepare.ts --version 1.5.0 --date 2026-09-16 --previous v1.4.0
 *   npx tsx scripts/release-prepare.ts --version 1.5.0 --dry-run
 *
 * (PowerShell swallows a bare `--`, so call the script directly rather than
 * going through `npm run release:prepare`.)
 *
 * Exit codes:
 *   0 — done, or the dry run reported what would change
 *   1 — a file the bump owns is missing, or a pattern it edits was not found
 *   2 — bad usage (invalid semver or date), or git could not name the previous tag
 *
 * The pure functions are exported and covered by
 * tests/tools/release-prepare.test.ts; only `main()` touches git and disk.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── Types ───────────────────────────────────────────────────────────

/** Result of one targeted edit. `text` equals the input when nothing changed. */
export interface Rewrite {
    readonly text: string;
    /** How many places the owning pattern was found — changed or already right. */
    readonly matched: number;
}

export interface Options {
    readonly version: string;
    readonly date: string;
    readonly previous: string | null;
    readonly dryRun: boolean;
}

// ── Small helpers ───────────────────────────────────────────────────

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isSemver(v: string): boolean {
    return SEMVER.test(v);
}

export function isIsoDate(d: string): boolean {
    return ISO_DATE.test(d) && !Number.isNaN(Date.parse(d));
}

/** Today as YYYY-MM-DD in UTC — the same clock CI uses. */
export function todayUtc(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

/** `v1.4.0` → `1.4.0`. */
export function stripTag(tag: string): string {
    return tag.replace(/^v/, '');
}

/** `1.5.3` → `1.5`. */
export function minorLine(version: string): string {
    return version.split('.').slice(0, 2).join('.');
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace with a counter, so the caller learns whether the pattern existed at all. */
function replaceCounting(text: string, re: RegExp, replacement: (...groups: string[]) => string): Rewrite {
    let matched = 0;
    const out = text.replace(re, (...args: unknown[]) => {
        matched++;
        return replacement(...(args as string[]));
    });
    return { text: out, matched };
}

// ── 1. package.json / package-lock.json ─────────────────────────────

/**
 * The top-level `"version"` of an npm manifest sits at the file's base indent
 * (two spaces in npm's own output). Nested `version` keys — every dependency
 * in the lockfile — are deeper and are left alone.
 */
export function bumpJsonVersion(text: string, version: string): Rewrite {
    return replaceCounting(text, /^( {2}"version":[ \t]*")([^"]*)(")/m, (_m, a, _old, c) => `${a}${version}${c}`);
}

/** The lockfile carries the version twice: at the root and under `packages[""]`. */
export function bumpLockVersion(text: string, version: string): Rewrite {
    const root = bumpJsonVersion(text, version);
    const pkg = replaceCounting(
        root.text,
        /("packages":\s*\{\s*"":\s*\{[^}]*?"version":[ \t]*")([^"]*)(")/,
        (_m, a, _old, c) => `${a}${version}${c}`,
    );
    return { text: pkg.text, matched: root.matched + pkg.matched };
}

/** The `pdfnative` dependency floor of package.json (`^1.8.0` → `1.8.0`), or null. */
export function engineVersion(packageJson: string): string | null {
    const m = /"dependencies":\s*\{[^}]*"pdfnative":\s*"[\^~]?(\d+\.\d+\.\d+)"/.exec(packageJson);
    return m?.[1] ?? null;
}

// ── 2. ecosystem.json + "Verified on" stamps ────────────────────────

/** `packages.pdfnative-cli.version` and the top-level `verifiedOn`. */
export function bumpManifest(text: string, version: string, date: string): Rewrite {
    const v = replaceCounting(
        text,
        /("packages":\s*\{\s*"pdfnative-cli":\s*\{\s*"version":[ \t]*")([^"]*)(")/,
        (_m, a, _old, c) => `${a}${version}${c}`,
    );
    const d = replaceCounting(v.text, /^( {2}"verifiedOn":[ \t]*")([^"]*)(")/m, (_m, a, _old, c) => `${a}${date}${c}`);
    return { text: d.text, matched: v.matched + d.matched };
}

/**
 * The entry-point artefacts carry a `Verified on YYYY-MM-DD` sentence (or a
 * `"verifiedOn"` field) that verify-docs requires to equal the manifest's
 * date exactly — bumping one without the other fails the build.
 */
export function restampVerifiedOn(text: string, date: string): Rewrite {
    return replaceCounting(text, /(Verified on |"verifiedOn":[ \t]*")\d{4}-\d{2}-\d{2}/, (_m, a) => `${a}${date}`);
}

// ── 3. CITATION.cff ─────────────────────────────────────────────────

/**
 * The software's own `version:` — not `cff-version:`, which is the format
 * revision (the anchored `^version` cannot match a line starting with `cff-`).
 * `date-released` is rewritten when present (keeping its quoting style) and
 * added directly under `version:` otherwise, so a citation names the date.
 */
export function bumpCitation(text: string, version: string, date: string): Rewrite {
    const v = replaceCounting(text, /^(version:[ \t]*)([^\r\n]*)/m, (_m, a) => `${a}${version}`);
    if (v.matched === 0) return v;
    if (/^date-released:/m.test(v.text)) {
        const d = replaceCounting(v.text, /^(date-released:[ \t]*)([^\r\n]*)/m, (_m, a, old) => `${a}${/^["']/.test(old) ? `"${date}"` : date}`);
        return { text: d.text, matched: v.matched + d.matched };
    }
    const eol = v.text.includes('\r\n') ? '\r\n' : '\n';
    const out = v.text.replace(/^(version:[^\r\n]*)/m, `$1${eol}date-released: ${date}`);
    return { text: out, matched: v.matched + 1 };
}

// ── 4. SECURITY.md ──────────────────────────────────────────────────

/**
 * The table has three rows: the supported line, the previous line on security
 * fixes, and everything older unsupported:
 *
 *   | 1.5.x   | ✅        |
 *   | 1.4.x   | ✅ (security fixes) |
 *   | < 1.4   | ❌        |
 *
 * Mapping on a bump to X.Y.Z: the row that was supported keeps its number and
 * drops to "security fixes", the new X.Y line takes the supported row, and
 * the cut-off becomes `< <old supported line>`. A patch release lands on the
 * line already listed, so the table is left as it is; a major release follows
 * the same rule (2.0.x supported, 1.N.x security fixes, < 1.N unsupported).
 */
export function bumpSecurityTable(text: string, version: string): Rewrite {
    const line = minorLine(version);
    const re =
        /^(\| )(\d+\.\d+)(\.x[ \t]*\| ✅[ \t]*\|[^\r\n]*\r?\n\| )(\d+\.\d+)(\.x[ \t]*\| ✅ \(security fixes\)[ \t]*\|[^\r\n]*\r?\n\| < )(\d+\.\d+)([ \t]*\| ❌)/m;
    return replaceCounting(text, re, (whole, a, supported, b, _security, c, _cutoff, d) =>
        supported === line ? whole : `${a}${line}${b}${supported}${c}${supported}${d}`,
    );
}

// ── 5. README banner ────────────────────────────────────────────────

/**
 * The blockquote at the top of README.md opens with
 * `> **What's new in vX.Y.Z** — built on **pdfnative A.B.C**` and closes with
 * a link to `release-notes/vX.Y.Z.md`. Its narrative is rewritten by hand
 * each release; the three tokens are bumped here so verify-docs
 * (`version-token`, `internal-links`) sees the new release the moment the
 * bump lands.
 */
export function bumpReadmeBanner(text: string, version: string, engine: string | null): Rewrite {
    const banner = replaceCounting(text, /(\*\*What's new in v)(\d+\.\d+\.\d+)(\*\*)/, (_m, a, _old, c) => `${a}${version}${c}`);
    let matched = banner.matched;
    let out = banner.text;
    if (engine !== null) {
        const built = replaceCounting(out, /(built on \*\*pdfnative )(\d+\.\d+\.\d+)(\*\*)/, (_m, a, _old, c) => `${a}${engine}${c}`);
        matched += built.matched;
        out = built.text;
    }
    const link = replaceCounting(out, /(\[release notes\]\(release-notes\/v)(\d+\.\d+\.\d+)(\.md\))/, (_m, a, _old, c) => `${a}${version}${c}`);
    return { text: link.text, matched: matched + link.matched };
}

// ── 6. Knowledge-base footer and llms.txt ───────────────────────────

/** The prose form `pdfnative-cli v1.4.0` / `pdfnative-cli 1.4.0`, word-bounded, from `from` to `to`. */
export function replaceProductVersion(text: string, product: string, from: string, to: string): Rewrite {
    const re = new RegExp(`(\\b${escapeRe(product)} v?)${escapeRe(from)}(?!\\d|\\.\\d)`, 'g');
    return replaceCounting(text, re, (_m, a) => `${a}${to}`);
}

/**
 * `*Verified on YYYY-MM-DD · pdfnative-cli vX.Y.Z · pdfnative A.B.C*` — the
 * last line of docs/KNOWLEDGE_BASE.md. All three tokens move together.
 */
export function bumpKnowledgeBaseFooter(text: string, version: string, engine: string | null, date: string): Rewrite {
    return replaceCounting(
        text,
        /^(\*Verified on )(\d{4}-\d{2}-\d{2})( · pdfnative-cli v)(\d+\.\d+\.\d+)( · pdfnative )(\d+\.\d+\.\d+)(\*)$/m,
        (_m, a, _d, b, _v, c, oldEngine, e) => `${a}${date}${b}${version}${c}${engine ?? oldEngine}${e}`,
    );
}

/** `Current version: X.Y.Z` (llms.txt). */
export function bumpCurrentVersion(text: string, version: string): Rewrite {
    return replaceCounting(text, /(Current version:\s*)(\d+\.\d+\.\d+)/, (_m, a) => `${a}${version}`);
}

// ── 7. Release note scaffold ────────────────────────────────────────

/**
 * release-notes/TEMPLATE.md carries the note as a fenced ```markdown block
 * whose own code fences are escaped as \`\`\`. Extract it, resolve the
 * `vX.Y.Z` / `X.Y.Z` / `vX.Y.Z-1` / `YYYY-MM-DD` placeholders and unescape.
 */
export function scaffoldReleaseNote(template: string, version: string, date: string, previousTag: string): string {
    const m = /```markdown\r?\n([\s\S]*?)\r?\n```/.exec(template);
    if (!m) throw new Error('release-notes/TEMPLATE.md has no ```markdown block to scaffold from');
    return (
        m[1]
            .replace(/vX\.Y\.Z-1/g, previousTag)
            .replace(/vX\.Y\.Z/g, `v${version}`)
            .replace(/X\.Y\.Z/g, version)
            .replace(/YYYY-MM-DD/g, date)
            .replace(/\\`\\`\\`/g, '```') + '\n'
    );
}

// ── CLI ─────────────────────────────────────────────────────────────

export const USAGE =
    'usage: npx tsx scripts/release-prepare.ts --version X.Y.Z [--date YYYY-MM-DD] [--previous vA.B.C] [--dry-run]';

/** Returns the options, or a usage error message. */
export function parseArgs(argv: readonly string[]): Options | string {
    let version: string | null = null;
    let date: string | null = null;
    let previous: string | null = null;
    let dryRun = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = (): string | null => (i + 1 < argv.length ? argv[++i] : null);
        if (arg === '--dry-run') dryRun = true;
        else if (arg === '--version') version = value();
        else if (arg === '--date') date = value();
        else if (arg === '--previous') previous = value();
        else if (arg.startsWith('--version=')) version = arg.slice('--version='.length);
        else if (arg.startsWith('--date=')) date = arg.slice('--date='.length);
        else if (arg.startsWith('--previous=')) previous = arg.slice('--previous='.length);
        else return `unknown argument "${arg}"\n${USAGE}`;
    }
    if (version === null) return `--version is required\n${USAGE}`;
    if (!isSemver(version)) return `--version "${version}" is not a plain semver triple (X.Y.Z)`;
    if (date !== null && !isIsoDate(date)) return `--date "${date}" is not an ISO date (YYYY-MM-DD)`;
    if (previous !== null && !isSemver(stripTag(previous))) return `--previous "${previous}" is not a tag of the form vA.B.C`;
    return { version, date: date ?? todayUtc(), previous: previous === null ? null : `v${stripTag(previous)}`, dryRun };
}

function git(root: string, args: string[]): string | null {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    return r.status === 0 ? r.stdout : null;
}

export function main(argv: readonly string[], root = resolve(import.meta.dirname, '..')): number {
    const parsed = parseArgs(argv);
    if (typeof parsed === 'string') {
        console.error(`release-prepare: ${parsed}`);
        return 2;
    }
    const opts = parsed;
    const rel = (p: string): string => relative(root, p).replace(/\\/g, '/');

    const previousTag = opts.previous ?? git(root, ['describe', '--tags', '--abbrev=0'])?.trim() ?? null;
    if (!previousTag || !isSemver(stripTag(previousTag))) {
        console.error('release-prepare: could not determine the previous tag (git describe --tags --abbrev=0); pass --previous vA.B.C');
        return 2;
    }
    const previousVersion = stripTag(previousTag);
    const { version, date, dryRun } = opts;
    const mark = dryRun ? '~' : '+';
    let problems = 0;
    const engine = existsSync(join(root, 'package.json')) ? engineVersion(readFileSync(join(root, 'package.json'), 'utf8')) : null;

    console.log(
        `release-prepare: v${version} (previous ${previousTag}, date ${date}, engine pdfnative ${engine ?? '?'})${dryRun ? ' — dry run, nothing is written' : ''}`,
    );

    /** Read, rewrite, report, and write unless --dry-run. */
    const edit = (relPath: string, what: string, fn: (text: string) => Rewrite): void => {
        const abs = join(root, relPath);
        if (!existsSync(abs)) {
            console.log(`  !  ${relPath} — missing`);
            problems++;
            return;
        }
        const before = readFileSync(abs, 'utf8');
        const r = fn(before);
        if (r.matched === 0) {
            console.log(`  !  ${relPath} — ${what}: pattern not found, edit by hand`);
            problems++;
        } else if (r.text === before) {
            console.log(`  =  ${relPath} — ${what}: already current`);
        } else {
            console.log(`  ${mark}  ${relPath} — ${what}`);
            if (!dryRun) writeFileSync(abs, r.text);
        }
    };

    console.log('\n1. Package manifests');
    edit('package.json', 'version', (t) => bumpJsonVersion(t, version));
    edit('package-lock.json', 'version (root + packages[""])', (t) => bumpLockVersion(t, version));

    console.log('\n2. Ecosystem manifest and the Verified-on stamps it governs');
    edit('docs/assets/ecosystem.json', `packages.pdfnative-cli.version + verifiedOn ${date}`, (t) => bumpManifest(t, version, date));
    for (const stamped of ['llms.txt', 'docs/KNOWLEDGE_BASE.md', 'docs/AGENT_CONTRACT.md']) {
        edit(stamped, `Verified on ${date}`, (t) => restampVerifiedOn(t, date));
    }

    console.log('\n3. Citation metadata');
    edit('CITATION.cff', `version + date-released ${date}`, (t) => bumpCitation(t, version, date));

    console.log('\n4. Supported versions');
    edit('SECURITY.md', `${minorLine(version)}.x supported, previous line on security fixes`, (t) => bumpSecurityTable(t, version));

    console.log('\n5. README banner');
    edit('README.md', `What's new in v${version} — built on pdfnative ${engine ?? '?'}; release-note link`, (t) => bumpReadmeBanner(t, version, engine));

    console.log('\n6. Knowledge-base footer and llms.txt');
    edit('docs/KNOWLEDGE_BASE.md', 'footer (date · CLI version · engine)', (t) => bumpKnowledgeBaseFooter(t, version, engine, date));
    edit('llms.txt', `Current version: ${version}`, (t) => bumpCurrentVersion(t, version));

    console.log('\n7. Release note');
    const notePath = join(root, 'release-notes', `v${version}.md`);
    const templatePath = join(root, 'release-notes', 'TEMPLATE.md');
    if (existsSync(notePath)) {
        console.log(`  =  ${rel(notePath)} — exists, left alone`);
    } else if (!existsSync(templatePath)) {
        console.log('  !  release-notes/TEMPLATE.md — missing');
        problems++;
    } else {
        console.log(`  ${mark}  ${rel(notePath)} — scaffolded from release-notes/TEMPLATE.md`);
        if (!dryRun) writeFileSync(notePath, scaffoldReleaseNote(readFileSync(templatePath, 'utf8'), version, date, previousTag));
    }

    console.log(`
Next steps
  1. git diff --stat                      review: the diff should read as the bump and nothing else
  2. npm run verify:docs                  every count and version the docs quote
  3. write release-notes/v${version}.md and the CHANGELOG.md entry ## [${version}] – ${date}
     (every sample rebaseline goes in the note's Upgrade section)
  4. npx tsx scripts/gate.ts --publish    the full release gate (previous release: v${previousVersion})
  5. draft the PR body into release-notes/draft/PR-v${version}.md
  See CONTRIBUTING.md § Release for the merge, tag and publish steps.`);

    if (problems > 0) {
        console.log(`\nrelease-prepare: ${problems} step${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} a hand edit (marked "!").`);
        return 1;
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exit(main(process.argv.slice(2)));
}
