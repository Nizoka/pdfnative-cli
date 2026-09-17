// Hostile page selectors: every accepted selector maps inside the document,
// every refused one is E_USAGE, and an absurd selector is refused quickly.

import { describe, it, expect, afterAll } from 'vitest';
import { parsePageList, parsePageRanges } from '../../src/utils/pages.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, onlyCliError, randomPageSpec, randomToken, assertPrototypeClean } from '../helpers/fuzz.js';

afterAll(assertPrototypeClean);

describe('fuzz: page selectors', () => {
    it('parsePageList / parsePageRanges answer 500 random selectors with in-bounds pages or E_USAGE', () => {
        forEachCase('pages', 500, (rng) => {
            const spec = rng.chance(0.8) ? randomPageSpec(rng) : randomToken(rng, 4);
            const pageCount = 1 + rng.int(50);
            const list = onlyCliError(() => parsePageList(spec, pageCount), [ErrorCode.USAGE]);
            const ranges = onlyCliError(() => parsePageRanges(spec, pageCount), [ErrorCode.USAGE]);
            expect(list.outcome).toBe(ranges.outcome);
            if (list.outcome === 'ok') {
                for (const i of list.value) {
                    expect(Number.isInteger(i)).toBe(true);
                    expect(i).toBeGreaterThanOrEqual(0);
                    expect(i).toBeLessThan(pageCount);
                }
            }
            if (ranges.outcome === 'ok') {
                for (const r of ranges.value) {
                    expect(r.start).toBeGreaterThanOrEqual(0);
                    expect(r.end).toBeGreaterThanOrEqual(r.start);
                    expect(r.end).toBeLessThan(pageCount);
                }
            }
        });
    });

    it('a 100 000-segment selector is refused before it is walked', () => {
        const spec = Array.from({ length: 100_000 }, () => '1').join(',');
        const t0 = performance.now();
        const r = onlyCliError(() => parsePageList(spec, 5), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/too many segments/);
        // A loose bound: it only has to catch quadratic behaviour, not a busy CI runner.
        expect(performance.now() - t0).toBeLessThan(5_000);
    });

    it.each(['1-99999999999999', '9007199254740993', '1e2', '٣', '1--3', '-', ',', ' '])('"%s" is a usage error', (spec) => {
        const r = onlyCliError(() => parsePageList(spec, 10), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
    });
});
