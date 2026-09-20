import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
    MANIFEST_REL,
    OFFLINE_RULES,
    isSuppressed,
    lineOf,
    semverLess,
    verifyDocs,
    workflowJobs,
    type Problem,
} from '../../scripts/verify-docs.js';

// v1.5.0 — the documentation verifier. The helpers are unit-tested; the
// verifier itself runs twice: once against the real tree (the same run the
// gate's `verify:docs` step performs — zero errors is the release
// condition) and once against a sandbox copy whose manifest was corrupted,
// to prove the rules fire.

const ROOT = resolve(import.meta.dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-output', 'output']);

describe('verify-docs — helpers', () => {
    it('computes 1-based line numbers from offsets', () => {
        expect(lineOf('a\nb\nc', 0)).toBe(1);
        expect(lineOf('a\nb\nc', 2)).toBe(2);
        expect(lineOf('a\nb\nc', 4)).toBe(3);
    });

    it('honours an allow marker on the line or the line above, for that rule only', () => {
        const lines = ['<!-- verify-docs:allow stale-token -->', '12 commands', 'x', 'y <!-- verify-docs:allow count-tokens -->'];
        expect(isSuppressed(lines, 2, 'stale-token')).toBe(true);
        expect(isSuppressed(lines, 2, 'count-tokens')).toBe(false);
        expect(isSuppressed(lines, 4, 'count-tokens')).toBe(true);
        expect(isSuppressed(lines, 3, 'stale-token')).toBe(false);
    });

    it('orders plain semver triples', () => {
        expect(semverLess('1.4.0', '1.5.0')).toBe(true);
        expect(semverLess('1.5.0', '1.4.9')).toBe(false);
        expect(semverLess('1.5.0', '1.5.0')).toBe(false);
        expect(semverLess('1.10.0', '1.9.0')).toBe(false);
    });

    it('reads job ids, display names and matrix values from workflows', () => {
        const ci = 'name: CI\non: push\njobs:\n  ci:\n    name: ci\n    strategy:\n      matrix:\n        node-version: [22, 24]\n    steps: []\n  other:\n    runs-on: ubuntu\n';
        const { jobs, matrixValues } = workflowJobs([ci, 'jobs:\n  sample-regression:\n    steps: []\n']);
        expect([...jobs].sort()).toEqual(['ci', 'other', 'sample-regression']);
        expect([...matrixValues.get('ci')!]).toEqual(['22', '24']);
    });
});

describe('verify-docs — the real tree', () => {
    it('declares the rule list the report prints', () => {
        expect(OFFLINE_RULES).toContain('command-parity');
        expect(OFFLINE_RULES).toContain('flag-parity');
        expect(OFFLINE_RULES).toContain('error-parity');
        expect(OFFLINE_RULES).toContain('prose-language');
        expect(MANIFEST_REL).toBe('docs/assets/ecosystem.json');
    });

    it('passes every offline rule (the gate condition)', async () => {
        const { problems, files } = await verifyDocs(ROOT);
        const errors = problems.filter((p) => p.severity === 'error').map((p) => `${p.file}:${p.line} [${p.rule}] ${p.message}`);
        expect(files).toBeGreaterThan(10);
        expect(errors).toEqual([]);
    }, 60_000);
});

describe('verify-docs — a corrupted sandbox', () => {
    let sandbox = '';
    let problems: Problem[] = [];

    beforeAll(async () => {
        sandbox = mkdtempSync(join(tmpdir(), 'pdfnative-cli-verify-docs-'));
        cpSync(ROOT, sandbox, {
            recursive: true,
            filter: (src) => !SKIP.has(basename(src)),
        });
        const manifestPath = join(sandbox, MANIFEST_REL);
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            derived: Record<string, unknown>;
            declared: Record<string, unknown>;
            packages: Record<string, { version: string }>;
        };
        manifest.derived['commands'] = 99;
        manifest.derived['typoKey'] = 1;
        manifest.declared['pdfaSamples'] = 1;
        manifest.packages['pdfnative-cli'].version = '9.9.9';
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        // A stray sample directory and an unpaired script.
        writeFileSync(join(sandbox, 'samples', 'render', 'zz-orphan.sh'), 'echo orphan\n');
        writeFileSync(join(sandbox, 'README.md'), `${readFileSync(join(sandbox, 'README.md'), 'utf8')}\n\nStale: pdfnative-cli v0.0.1 has 12 commands and E_NOPE. A 3-sample baseline and 4 sample PDFs.\n\nBroken anchors: [same](#no-such-heading), [cross](docs/KNOWLEDGE_BASE.md#nope-either), [fine](#installation).\n\n[allowed](#also-missing) <!-- verify-docs:allow anchor-parity -->\n`);
        // A governance reference whose fragment does not exist.
        const policyPath = join(sandbox, '.github', 'ai-governance.json');
        writeFileSync(policyPath, readFileSync(policyPath, 'utf8').replace('AGENTS.md#mission-and-constraints', 'AGENTS.md#no-such-section'));
        // The protocol text drifts from the embedded copy `govern rules` prints.
        writeFileSync(join(sandbox, '.github', 'AGENT_RULES.md'), `${readFileSync(join(sandbox, '.github', 'AGENT_RULES.md'), 'utf8')}\n- Drifted rule.\n`);
        problems = (await verifyDocs(sandbox)).problems;
    }, 120_000);

    afterAll(() => {
        if (sandbox) rmSync(sandbox, { recursive: true, force: true });
    });

    const messages = (rule: string): string[] => problems.filter((p) => p.rule === rule && p.severity === 'error').map((p) => `${p.file}:${p.line} ${p.message}`);

    it('fails derived-counts, manifest-shape and command-parity on the corrupted manifest', () => {
        expect(messages('derived-counts')).toEqual(expect.arrayContaining([expect.stringContaining('derived.commands says 99'), expect.stringContaining('pdfaSamples')]));
        expect(messages('manifest-shape')).toEqual(expect.arrayContaining([expect.stringContaining('derived.typoKey'), expect.stringContaining('package.json says')]));
        expect(messages('command-parity')).toEqual(expect.arrayContaining([expect.stringContaining('derived.commands is 99')]));
    });

    it('fails stale-token, version-token and error-parity on the appended README line', () => {
        expect(messages('stale-token')).toEqual(expect.arrayContaining([expect.stringMatching(/README\.md:\d+ "12 commands"/)]));
        expect(messages('version-token')).toEqual(expect.arrayContaining([expect.stringContaining('pdfnative-cli v0.0.1')]));
        expect(messages('error-parity')).toEqual(expect.arrayContaining([expect.stringContaining('"E_NOPE"')]));
    });

    it('holds both spellings of the sample count to the baseline (count-tokens)', () => {
        expect(messages('count-tokens')).toEqual(expect.arrayContaining([
            expect.stringContaining('"3-sample baseline"'),
            expect.stringContaining('"4 sample PDFs"'),
        ]));
    });

    it('fails sample-shell-parity on the unpaired script', () => {
        expect(messages('sample-shell-parity')).toEqual([expect.stringContaining('samples/render/zz-orphan.sh')]);
    });

    it('fails anchor-parity on a same-file, a cross-file and a governance-reference fragment, and honours the allow marker', () => {
        const found = messages('anchor-parity');
        expect(found).toEqual(expect.arrayContaining([
            expect.stringMatching(/README\.md:\d+ "#no-such-heading" is not a heading anchor of README\.md/),
            expect.stringMatching(/README\.md:\d+ "#nope-either" is not a heading anchor of docs\/KNOWLEDGE_BASE\.md/),
            expect.stringMatching(/ai-governance\.json:\d+ "#no-such-section" is not a heading anchor of AGENTS\.md/),
        ]));
        expect(found.some((m) => m.includes('#installation'))).toBe(false);
        expect(found.some((m) => m.includes('#also-missing'))).toBe(false);
    });

    it('fails governance-embed when AGENT_RULES.md drifts from the text `govern rules` prints (and the edited policy from `govern policy`)', () => {
        expect(messages('governance-embed')).toEqual(expect.arrayContaining([
            expect.stringContaining('.github/AGENT_RULES.md:1 differs from AGENT_RULES_TEXT'),
            expect.stringContaining('.github/ai-governance.json:1 differs from AI_GOVERNANCE_POLICY'),
        ]));
    });

    it('never runs eol-lf outside a git checkout', () => {
        expect(problems.filter((p) => p.rule === 'eol-lf')).toEqual([]);
    });
});
