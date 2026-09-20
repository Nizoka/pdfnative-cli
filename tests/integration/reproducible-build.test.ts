// The BUILT binary (dist/cli.cjs) is byte-reproducible across processes and
// time zones. Source tests import the command functions; this suite spawns
// the bundle the way CI and users run it, so the tsup flattening and the
// dispatcher's env handling are covered too. Skipped when dist/ is absent
// in a plain local run (`npm run build` is a one-off) — but under the gate's
// ci / publish profiles, which build first and set GATE_REQUIRE_ARTIFACTS=1,
// a missing dist/ FAILS this file instead of skipping it (audit A-08: the
// suite used to skip silently on every CI runner).

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'dist', 'cli.cjs');
const haveDist = existsSync(CLI);
if (!haveDist && process.env.GATE_REQUIRE_ARTIFACTS === '1') {
    throw new Error('dist/cli.cjs is missing but GATE_REQUIRE_ARTIFACTS=1: the gate builds before test:coverage — run `npm run build`');
}
const dir = mkdtempSync(join(tmpdir(), 'pdfcli-repro-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sha256 = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

function run(args: readonly string[], env: Readonly<Record<string, string>> = {}): { status: number; stdout: string; stderr: string } {
    const r = spawnSync(process.execPath, [CLI, ...args], {
        cwd: ROOT, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '', ...env },
    });
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const doc = join(dir, 'doc.json');
writeFileSync(doc, JSON.stringify({ title: 'Repro', blocks: [{ type: 'paragraph', text: 'Pinned on {date}.' }] }));

describe.runIf(haveDist)('dist/cli.cjs reproducible output', () => {
    it('two processes under different TZ values with --creation-date emit identical bytes', () => {
        const a = join(dir, 'a.pdf');
        const b = join(dir, 'b.pdf');
        expect(run(['render', '--input', doc, '--output', a, '--creation-date', '2026-01-01T00:00:00Z', '--header-right', '{date}'], { TZ: 'Europe/Paris' }).status).toBe(0);
        expect(run(['render', '--input', doc, '--output', b, '--creation-date', '2026-01-01T00:00:00Z', '--header-right', '{date}'], { TZ: 'Pacific/Auckland' }).status).toBe(0);
        expect(sha256(a)).toBe(sha256(b));
    });

    it('SOURCE_DATE_EPOCH alone pins the same instant as the flag', () => {
        const a = join(dir, 'epoch.pdf');
        const b = join(dir, 'flag.pdf');
        const r = run(['render', '--input', doc, '--output', a, '--header-right', '{date}', '--json'], { SOURCE_DATE_EPOCH: '1767225600' });
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('"creationDate":"2026-01-01T00:00:00.000Z"');
        expect(run(['render', '--input', doc, '--output', b, '--header-right', '{date}', '--creation-date', '2026-01-01T00:00:00Z']).status).toBe(0);
        expect(sha256(a)).toBe(sha256(b));
    });

    it('an invalid SOURCE_DATE_EPOCH is a usage error, not a silent fallback', () => {
        const r = run(['render', '--input', doc, '--output', join(dir, 'x.pdf')], { SOURCE_DATE_EPOCH: 'yesterday' });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('SOURCE_DATE_EPOCH');
    });

    it('global flags may precede the command name on the built binary', () => {
        const r = run(['--json', '--dry-run', 'render', '--input', doc]);
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('"command":"render"');
        expect(r.stderr).toContain('"dryRun":true');
    });

    it('a command flag placed before the command is recovered, not swallowed', () => {
        const r = run(['--json', '--strict', 'render', '--input', doc, '--dry-run']);
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('"command":"render"');
    });

    it('arguments with no command exit 2 (E_USAGE); an unknown command exits 1; a bare call prints the usage', () => {
        const none = run(['--json', '--input', doc]);
        expect(none.status).toBe(2);
        expect(none.stderr).toContain('"code":"E_USAGE"');
        expect(run(['frobnicate']).status).toBe(1);
        const bare = run([]);
        expect(bare.status).toBe(0);
        expect(bare.stdout).toContain('Commands (21):');
    });

    it('doctor reports the 1.5.0 capabilities and --version matches package.json', () => {
        const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
        expect(run(['--version']).stdout.trim()).toBe(pkg.version);
        const r = run(['doctor', '--format', 'json']);
        expect(r.status).toBe(0);
        const report = JSON.parse(r.stdout) as { ok: boolean; checks: { name: string; value: string }[] };
        expect(report.ok).toBe(true);
        expect(report.checks.find((c) => c.name === 'fonts')?.value).toBe('31 modules / 27 scripts');
    });
});
