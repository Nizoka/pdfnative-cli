// Hostile layout JSON: reviveLayoutJson, deepMerge (the --template layering)
// and mergeNestedLayout answer with a value or E_INPUT — never a stack
// overflow on deep nesting, never a 16 MiB allocation from a declared array
// length, never a prototype write.

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviveLayoutJson, deepMerge, mergeNestedLayout, loadLayoutFile, isPlainObject, MAX_JSON_DEPTH, MAX_ICC_PROFILE_BYTES } from '../../src/utils/layout.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, forEachCaseAsync, onlyCliError, onlyCliErrorAsync, randomJson, randomToken, deepNested, assertPrototypeClean, HOSTILE_KEYS } from '../helpers/fuzz.js';
import type { PdfLayoutOptions } from '../../src/core-bridge/index.js';

const dir = mkdtempSync(join(tmpdir(), 'pdfcli-fuzz-layout-'));
afterAll(() => { assertPrototypeClean(); rmSync(dir, { recursive: true, force: true }); });
afterEach(assertPrototypeClean);

describe('fuzz: layout JSON', () => {
    it('reviveLayoutJson and deepMerge answer 300 random documents with a value or E_INPUT', () => {
        forEachCase('layout', 300, (rng) => {
            const a = randomJson(rng, 4);
            const b = randomJson(rng, 4);
            if (isPlainObject(a)) {
                const r = onlyCliError(() => reviveLayoutJson(a), [ErrorCode.INPUT]);
                if (r.outcome === 'ok') expect(isPlainObject(r.value)).toBe(true);
            }
            const m = onlyCliError(() => deepMerge(a, b), [ErrorCode.INPUT]);
            // When both sides are objects the merge is a fresh object without
            // the hostile keys; otherwise the override is returned as-is (a
            // JSON own key named __proto__ is inert until something copies it).
            if (m.outcome === 'ok' && isPlainObject(a) && isPlainObject(b)) {
                expect(isPlainObject(m.value)).toBe(true);
                for (const key of Object.keys(m.value as object)) expect(HOSTILE_KEYS).not.toContain(key);
            }
            if (isPlainObject(a) && isPlainObject(b)) {
                const n = mergeNestedLayout(a as Partial<PdfLayoutOptions>, b as Partial<PdfLayoutOptions>);
                expect(isPlainObject(n)).toBe(true);
            }
        });
    });

    it.each([MAX_JSON_DEPTH + 1, 200, 10_000])('deepMerge refuses %i nested levels with E_INPUT, not a RangeError', (depth) => {
        const r = onlyCliError(() => deepMerge(deepNested(depth, 'object'), deepNested(depth, 'object')), [ErrorCode.INPUT]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/nests deeper/);
    });

    it('deepMerge accepts nesting at the cap and merges it', () => {
        const r = onlyCliError(() => deepMerge(deepNested(MAX_JSON_DEPTH - 1, 'object', { a: 1 }), deepNested(MAX_JSON_DEPTH - 1, 'object', { b: 2 })));
        expect(r.outcome).toBe('ok');
    });

    it('deepMerge skips __proto__ / constructor / prototype on both sides and reads own keys only', () => {
        const base = JSON.parse('{"__proto__":{"polluted":"yes"},"keep":1,"nested":{"x":1}}') as Record<string, unknown>;
        const override = JSON.parse('{"constructor":{"polluted":"yes"},"prototype":2,"nested":{"__proto__":{"polluted":"yes"},"y":2},"toString":"own"}') as Record<string, unknown>;
        const merged = deepMerge(base, override) as Record<string, unknown>;
        expect(Object.keys(merged).sort()).toEqual(['keep', 'nested', 'toString']);
        expect(merged.nested).toEqual({ x: 1, y: 2 });
        expect(Object.keys(merged.nested as object)).toEqual(['x', 'y']);
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('an outputIntent.iccProfile array longer than the ICC cap is refused before it is allocated', () => {
        const declared = new Array<number>(MAX_ICC_PROFILE_BYTES + 1);
        const t0 = performance.now();
        const r = onlyCliError(() => reviveLayoutJson({ outputIntent: { iccProfile: declared, outputConditionIdentifier: 'x' } }), [ErrorCode.INPUT]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/exceeds the 16 MiB/);
        // A loose bound: copying 16 Mi elements would take far longer; a busy runner must not fail it.
        expect(performance.now() - t0).toBeLessThan(5_000);
        const ok = onlyCliError(() => reviveLayoutJson({ outputIntent: { iccProfile: [0, 1, 2], outputConditionIdentifier: 'x' } }));
        expect(ok.outcome).toBe('ok');
    });

    it('loadLayoutFile answers 60 random files with a layout or a CliError', async () => {
        await forEachCaseAsync('loadLayoutFile', 60, async (rng, i) => {
            const p = join(dir, `l${i}.json`);
            writeFileSync(p, rng.chance(0.7) ? JSON.stringify(randomJson(rng, 4)) : randomToken(rng, 8));
            const r = await onlyCliErrorAsync(() => loadLayoutFile(p));
            if (r.outcome === 'ok') expect(isPlainObject(r.value)).toBe(true);
        });
    });
});
