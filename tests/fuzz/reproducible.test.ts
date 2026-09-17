// Hostile date strings for the reproducibility pin: a valid instant or a
// usage error, and an accepted instant round-trips exactly.

import { describe, it, expect, afterAll } from 'vitest';
import { parseIsoDate, parseSourceDateEpoch, resolveReproducibleDate } from '../../src/utils/reproducible.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, onlyCliError, randomIsoish, assertPrototypeClean } from '../helpers/fuzz.js';

afterAll(assertPrototypeClean);

describe('fuzz: --creation-date / SOURCE_DATE_EPOCH', () => {
    it('parseIsoDate answers 400 random strings with a valid Date or E_USAGE, and round-trips what it accepts', () => {
        forEachCase('parseIsoDate', 400, (rng) => {
            const raw = randomIsoish(rng);
            const r = onlyCliError(() => parseIsoDate(raw, 'creation-date'), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            expect(Number.isNaN(r.value.getTime())).toBe(false);
            const again = parseIsoDate(r.value.toISOString(), 'creation-date');
            expect(again.getTime()).toBe(r.value.getTime());
        });
    });

    it('parseSourceDateEpoch accepts only non-negative integer seconds and answers E_USAGE otherwise', () => {
        forEachCase('parseSourceDateEpoch', 400, (rng) => {
            const raw = randomIsoish(rng);
            const r = onlyCliError(() => parseSourceDateEpoch(raw), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') {
                expect(/^\s*\d{1,12}\s*$/.test(raw)).toBe(false);
                return;
            }
            expect(r.value.getTime() % 1000).toBe(0);
            expect(r.value.getTime()).toBeGreaterThanOrEqual(0);
            expect(String(r.value.getTime() / 1000)).toBe(String(Number.parseInt(raw.trim(), 10)));
        });
    });

    it('resolveReproducibleDate prefers the flag, then the environment, and never throws anything but E_USAGE', () => {
        forEachCase('resolveReproducibleDate', 300, (rng) => {
            const flag = rng.chance(0.5) ? randomIsoish(rng) : undefined;
            const env = rng.chance(0.5) ? { SOURCE_DATE_EPOCH: randomIsoish(rng) } : {};
            const flags: Record<string, string> = flag === undefined ? {} : { 'creation-date': flag };
            const r = onlyCliError(() => resolveReproducibleDate(flags, env as NodeJS.ProcessEnv), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            if (r.value === undefined) {
                expect(flag).toBeUndefined();
                expect((env.SOURCE_DATE_EPOCH ?? '').trim()).toBe('');
            } else {
                expect(r.value.source).toBe(flag === undefined ? 'env' : 'flag');
            }
        });
    });
});
