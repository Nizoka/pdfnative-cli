// Contract of scripts/gate.ts: the STEPS table is the one place the quality
// gate is defined, so these tests hold it to the shape CI, CONTRIBUTING and
// the agent files rely on. No step is executed here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { STEPS, parseArgs, selectSteps } from '../../scripts/gate.js';

const ROOT = resolve(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('gate: step table', () => {
    it('has unique ids', () => {
        const ids = STEPS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every npm-script step names a script that exists in package.json', () => {
        for (const s of STEPS) {
            if (s.npmScript !== undefined) expect(pkg.scripts, s.id).toHaveProperty(s.npmScript);
        }
    });

    it('every step is either an npm script or an inline check, never both', () => {
        for (const s of STEPS) {
            expect(Boolean(s.npmScript) !== Boolean(s.inline), s.id).toBe(true);
        }
    });

    it('the fast profile is exactly typecheck:all, lint, test and verify:docs', () => {
        const fast = STEPS.filter((s) => s.profiles.includes('fast')).map((s) => s.id);
        expect(fast).toEqual(['typecheck:all', 'lint', 'test', 'verify:docs']);
    });

    it('the ci profile runs everything except validate:pdfa; publish runs everything', () => {
        const ci = STEPS.filter((s) => s.profiles.includes('ci')).map((s) => s.id);
        const publish = STEPS.filter((s) => s.profiles.includes('publish')).map((s) => s.id);
        expect(ci).not.toContain('validate:pdfa');
        expect(ci).not.toContain('test'); // coverage variant instead
        expect(publish).toEqual(STEPS.filter((s) => s.id !== 'test').map((s) => s.id));
    });

    it('the only skippable step is validate:pdfa (veraPDF is external); validate:pdfx never skips', () => {
        const skippable = STEPS.filter((s) => s.skipWhen !== undefined).map((s) => s.id);
        expect(skippable).toEqual(['validate:pdfa']);
    });

    it('builds before every step that drives dist/cli.cjs — the coverage run included', () => {
        const order = STEPS.map((s) => s.id);
        const build = order.indexOf('build');
        for (const id of ['dist-check', 'smoke', 'bundle-size', 'bundle-check', 'test:generate', 'test:coverage', 'corpus:pdfa', 'validate:pdfx', 'validate:pdfa']) {
            expect(order.indexOf(id), id).toBeGreaterThan(build);
        }
        expect(order.indexOf('corpus:pdfa')).toBeLessThan(order.indexOf('validate:pdfx'));
        expect(order.indexOf('test:generate')).toBeLessThan(order.indexOf('verify:samples'));
        expect(order.indexOf('bundle-check')).toBe(order.indexOf('bundle-size') + 1);
    });

    it('generates the samples before the coverage run, so the regression suite runs on CI (audit A-08)', () => {
        const order = STEPS.map((s) => s.id);
        expect(order.indexOf('test:generate')).toBeLessThan(order.indexOf('test:coverage'));
    });

    it('the fast profile runs the tests without a build; the coverage run requires the artifacts', () => {
        expect(STEPS.find((s) => s.id === 'test')?.env).toEqual({ GATE: '1' });
        expect(STEPS.find((s) => s.id === 'test:coverage')?.env).toEqual({ GATE: '1', GATE_REQUIRE_ARTIFACTS: '1' });
    });

    it('bundle-check is an inline step of the ci and publish profiles', () => {
        const step = STEPS.find((s) => s.id === 'bundle-check');
        expect(step?.inline).toBeTypeOf('function');
        expect(step?.profiles).toEqual(['ci', 'publish']);
    });

    it('test steps write the JSON report the gate reads the count from', () => {
        for (const id of ['test', 'test:coverage']) {
            const step = STEPS.find((s) => s.id === id);
            expect(step?.env?.GATE).toBe('1');
        }
    });
});

describe('gate: argument parsing and step selection', () => {
    it('defaults to the ci profile', () => {
        const opts = parseArgs([]);
        expect('error' in opts).toBe(false);
        if (!('error' in opts)) expect(opts.profile).toBe('ci');
    });

    it('rejects two profiles, unknown steps and unknown flags', () => {
        expect(parseArgs(['--fast', '--ci'])).toHaveProperty('error');
        expect(parseArgs(['--only', 'nope'])).toHaveProperty('error');
        expect(parseArgs(['--only'])).toHaveProperty('error');
        expect(parseArgs(['--bogus'])).toHaveProperty('error');
    });

    it('--only selects one step regardless of profile', () => {
        const opts = parseArgs(['--fast', '--only', 'validate:pdfa']);
        if ('error' in opts) throw new Error(opts.error);
        expect(selectSteps(opts).map((s) => s.id)).toEqual(['validate:pdfa']);
    });

    it('--from resumes the profile at the given step', () => {
        const opts = parseArgs(['--ci', '--from', 'build']);
        if ('error' in opts) throw new Error(opts.error);
        const ids = selectSteps(opts).map((s) => s.id);
        expect(ids[0]).toBe('build');
        expect(ids).not.toContain('lint');
    });

    it('--from a step outside the profile resumes at its table position', () => {
        const opts = parseArgs(['--fast', '--from', 'build']);
        if ('error' in opts) throw new Error(opts.error);
        expect(selectSteps(opts).map((s) => s.id)).toEqual(['verify:docs']);
        const fromTest = parseArgs(['--fast', '--from', 'test']);
        if ('error' in fromTest) throw new Error(fromTest.error);
        expect(selectSteps(fromTest).map((s) => s.id)).toEqual(['test', 'verify:docs']);
    });

    it('--require-all and --json are recognised', () => {
        const opts = parseArgs(['--publish', '--require-all', '--json']);
        if ('error' in opts) throw new Error(opts.error);
        expect(opts.requireAll).toBe(true);
        expect(opts.json).toBe(true);
        expect(opts.profile).toBe('publish');
    });
});

describe('gate: wiring', () => {
    it('CI and publish run the gate with --require-all', () => {
        const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
        expect(ci).toMatch(/scripts\/gate\.ts --ci --require-all/);
        const publish = readFileSync(resolve(ROOT, '.github/workflows/publish.yml'), 'utf8');
        expect(publish).toMatch(/scripts\/gate\.ts --publish --require-all/);
    });

    it('the pre-push hook runs the fast profile', () => {
        const hook = readFileSync(resolve(ROOT, '.githooks/pre-push'), 'utf8');
        expect(hook).toMatch(/npm run gate:fast/);
    });
});
