// The engine-surface traceability matrix (tests/regression/engine-surface.json).
//
// pdfnative-cli wraps an engine: a release of the engine that the CLI's tests
// and samples do not exercise is a release the CLI has not really adopted.
// This suite holds the matrix to the tree, so coverage cannot rot silently:
//
//   - every reference is real (the test file holds that test name, the sample
//     is an entry of the byte baseline, the transmission suite exists);
//   - a diagnostic code the schema names is a code a test TRIGGERS;
//   - every typography key and every script code appears in a rendered sample;
//   - moving the pdfnative pin fails the suite until the matrix follows.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SCRIPT_CODES } from '../../src/utils/fonts.js';
import { planRenderJobs } from '../../scripts/lib/sample-plan.js';
import { DIAGNOSTIC_TRIGGERS } from '../helpers/diagnostic-triggers.js';
import { SCRIPT_TEXT } from '../helpers/script-text.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

interface TestRef { readonly file: string; readonly name: string }
interface Waiver { readonly kind: string; readonly reason: string; readonly transmission?: string }
interface Item {
    readonly id: string;
    readonly kind: string;
    readonly changelog: string;
    readonly tests?: readonly TestRef[];
    readonly samples?: readonly string[];
    readonly waiver?: Waiver;
    readonly note?: string;
}
interface Matrix { readonly engine: string; readonly items: readonly Item[] }

const matrix = JSON.parse(read('tests/regression/engine-surface.json')) as Matrix;
const baseline = JSON.parse(read('tests/regression/baselines/samples.sha256.json')) as { entries: Record<string, unknown> };
const ecosystem = JSON.parse(read('docs/assets/ecosystem.json')) as {
    packages: Record<string, { version: string }>;
    declared: Record<string, number>;
};

const WAIVER_KINDS = ['LIB', 'TOOLING', 'DOCS', 'tested-upstream', 'upstream-limit'];
const ITEM_KINDS = ['feature', 'change', 'fix', 'docs'];
/** The keys of pdfnative's TypographyOptions (src/types/pdf-types.ts, 1.8.0). */
const TYPOGRAPHY_KEYS = [
    'splitParagraphs', 'orphans', 'widows', 'keepHeadingsWithNext', 'unitBinding', 'bindShortWords',
    'punctuationSpacing', 'opticalMargins', 'metrics', 'fontFeatures', 'kerning', 'hyphenationLanguage',
];

function walk(dir: string, keep: (p: string) => boolean): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p, keep) : keep(p) ? [p] : [];
    });
}

describe('engine-surface matrix: shape', () => {
    it('describes the pdfnative release the CLI is pinned to', () => {
        expect(matrix.engine).toBe(ecosystem.packages['pdfnative']!.version);
    });

    it('has unique ids, known kinds, and exactly one of tests / waiver per item', () => {
        const ids = matrix.items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const item of matrix.items) {
            expect(ITEM_KINDS, item.id).toContain(item.kind);
            expect(item.changelog.length, item.id).toBeGreaterThan(8);
            const tested = (item.tests?.length ?? 0) > 0;
            expect(tested !== (item.waiver !== undefined), `${item.id}: tests XOR waiver`).toBe(true);
            if (item.waiver !== undefined) {
                expect(WAIVER_KINDS, item.id).toContain(item.waiver.kind);
                expect(item.waiver.reason.length, `${item.id}: a waiver states its reason`).toBeGreaterThan(20);
                expect(item.samples, `${item.id}: a waived item lists no sample`).toBeUndefined();
            }
        }
    });

    it('a user-facing feature or fix is never waived as documentation', () => {
        for (const item of matrix.items) {
            if (item.waiver?.kind === 'DOCS') expect(item.kind, item.id).toBe('docs');
        }
    });
});

describe('engine-surface matrix: every reference is real', () => {
    const sources = new Map<string, string>();
    const source = (file: string): string => {
        let text = sources.get(file);
        if (text === undefined) {
            expect(existsSync(join(ROOT, file)), `${file} exists`).toBe(true);
            text = read(file);
            sources.set(file, text);
        }
        return text;
    };

    it('each named test exists in the file that is said to hold it', () => {
        for (const item of matrix.items) {
            for (const ref of item.tests ?? []) {
                expect(ref.file, item.id).toMatch(/^tests\/.+\.test\.ts$/);
                expect(source(ref.file).includes(ref.name), `${item.id}: "${ref.name}" in ${ref.file}`).toBe(true);
            }
        }
    });

    it('each sample is an entry of the byte baseline', () => {
        for (const item of matrix.items) {
            for (const sample of item.samples ?? []) {
                expect(Object.hasOwn(baseline.entries, sample), `${item.id}: ${sample}`).toBe(true);
            }
        }
    });

    it('a tested-upstream waiver names the suite that proves the transmission', () => {
        for (const item of matrix.items) {
            if (item.waiver?.kind !== 'tested-upstream') continue;
            expect(item.waiver.transmission, item.id).toBeDefined();
            expect(existsSync(join(ROOT, item.waiver.transmission!)), `${item.id}: ${item.waiver.transmission}`).toBe(true);
        }
    });
});

describe('engine-surface: named means exercised', () => {
    it('every diagnostic code the status schema names has a trigger that a test executes', () => {
        const named = [...new Set(read('src/commands/schema.ts').match(/\b(?:PDFA|PDFX|TYPOGRAPHY)_[A-Z0-9_]+\b/g) ?? [])].sort();
        expect(Object.keys(DIAGNOSTIC_TRIGGERS).sort()).toEqual(named);
        expect(named).toHaveLength(ecosystem.declared['diagnosticCodes']!);
        // The table is executed, not just declared.
        const suite = read('tests/commands/render-diagnostics.test.ts');
        expect(suite).toContain('it.each(Object.entries(DIAGNOSTIC_TRIGGERS))');
    });

    it('every TypographyOptions key is documented by the schema and set by a rendered sample', () => {
        const schema = read('src/commands/schema.ts');
        const used = new Set<string>();
        for (const file of walk(join(ROOT, 'samples', 'render'), (p) => p.endsWith('.json'))) {
            const doc = JSON.parse(readFileSync(file, 'utf8')) as { layout?: { typography?: Record<string, unknown> } };
            for (const key of Object.keys(doc.layout?.typography ?? {})) used.add(key);
        }
        for (const key of TYPOGRAPHY_KEYS) {
            expect(schema.includes(key), `schema names ${key}`).toBe(true);
            expect(used.has(key), `a sample sets layout.typography.${key}`).toBe(true);
        }
        expect([...used].filter((k) => !TYPOGRAPHY_KEYS.includes(k)), 'no sample sets a key the engine does not have').toEqual([]);
    });

    it('every script code is loaded by a planned sample render, and has a test string', () => {
        const jobs = planRenderJobs({ renderDir: join(ROOT, 'samples', 'render'), outputDir: join(ROOT, 'test-output', 'samples'), creationDate: '2026-01-01T00:00:00.000Z' });
        const loaded = new Set<string>();
        for (const job of jobs) {
            job.args.forEach((arg, i) => {
                if (arg === '--lang') for (const code of (job.args[i + 1] ?? '').split(',')) loaded.add(code.trim());
            });
        }
        expect(SCRIPT_CODES.filter((code) => !loaded.has(code)), 'script codes no sample renders').toEqual([]);
        expect(SCRIPT_CODES.filter((code) => SCRIPT_TEXT[code] === undefined), 'script codes without a test string').toEqual([]);
    });
});

// The engine ships no CHANGELOG in its npm package: this check runs where the
// sibling checkout exists (the maintainer's machine), never on a CI runner.
const ENGINE_CHANGELOG = resolve(ROOT, '..', 'pdfnative', 'CHANGELOG.md');

describe.runIf(existsSync(ENGINE_CHANGELOG))('engine-surface matrix: complete against the engine changelog', () => {
    it('maps every bullet of the release entry to exactly one item', () => {
        const text = readFileSync(ENGINE_CHANGELOG, 'utf8').replace(/\r\n/g, '\n');
        const start = text.indexOf(`## [${matrix.engine}]`);
        expect(start, `the changelog has a [${matrix.engine}] entry`).toBeGreaterThan(-1);
        const next = text.indexOf('\n## [', start + 1);
        const entry = text.slice(start, next === -1 ? undefined : next);
        const titles = [...entry.matchAll(/^- \*\*(.+?)(?:\*\*|$)/gm)].map((m) => m[1]!.trim());
        expect(titles.length).toBeGreaterThan(40);

        const used = new Map<string, string>();
        const unmatched: string[] = [];
        for (const title of titles) {
            const candidates = matrix.items.filter((i) => title.startsWith(i.changelog)).sort((a, b) => b.changelog.length - a.changelog.length);
            const item = candidates[0];
            if (item === undefined) { unmatched.push(title); continue; }
            expect(used.get(item.id), `${item.id} matched twice ("${used.get(item.id) ?? ''}" and "${title}")`).toBeUndefined();
            used.set(item.id, title);
        }
        expect(unmatched, 'changelog bullets without a matrix item').toEqual([]);
        expect(matrix.items.filter((i) => !used.has(i.id)).map((i) => i.id), 'matrix items matching no changelog bullet').toEqual([]);
    });
});
