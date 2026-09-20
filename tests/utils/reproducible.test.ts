import { describe, it, expect } from 'vitest';
import { parseIsoDate, parseSourceDateEpoch, resolveReproducibleDate } from '../../src/utils/reproducible.js';
import { CliError } from '../../src/utils/error.js';

describe('reproducible: parseIsoDate', () => {
    it('parses an ISO 8601 instant', () => {
        expect(parseIsoDate('2026-01-01T00:00:00Z', 'creation-date').toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(parseIsoDate(' 2026-06-15T12:30:00+02:00 ', 'creation-date').toISOString()).toBe('2026-06-15T10:30:00.000Z');
    });

    it('rejects garbage and the empty string with a usage error (exit 2)', () => {
        for (const bad of ['', 'yesterday', '2026-13-45']) {
            try {
                parseIsoDate(bad, 'creation-date');
                expect.unreachable();
            } catch (e) {
                expect(e).toBeInstanceOf(CliError);
                expect((e as CliError).exitCode).toBe(2);
                expect((e as CliError).message).toContain('--creation-date');
            }
        }
    });
});

describe('reproducible: parseSourceDateEpoch', () => {
    it('reads integer seconds (reproducible-builds.org)', () => {
        expect(parseSourceDateEpoch('1767225600').toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(parseSourceDateEpoch('0').toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('rejects a non-integer, negative or empty value instead of silently ignoring it', () => {
        for (const bad of ['-1', '1.5', 'abc', '2026-01-01', '']) {
            expect(() => parseSourceDateEpoch(bad)).toThrow(CliError);
        }
    });
});

describe('reproducible: resolveReproducibleDate', () => {
    it('returns undefined when neither the flag nor the env is set', () => {
        expect(resolveReproducibleDate({}, {})).toBeUndefined();
        expect(resolveReproducibleDate({}, { SOURCE_DATE_EPOCH: '   ' })).toBeUndefined();
    });

    it('takes SOURCE_DATE_EPOCH when the flag is absent', () => {
        const r = resolveReproducibleDate({}, { SOURCE_DATE_EPOCH: '1767225600' });
        expect(r?.source).toBe('env');
        expect(r?.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('the flag wins over the env', () => {
        const r = resolveReproducibleDate({ 'creation-date': '2025-05-05T05:05:05Z' }, { SOURCE_DATE_EPOCH: '1767225600' });
        expect(r?.source).toBe('flag');
        expect(r?.date.toISOString()).toBe('2025-05-05T05:05:05.000Z');
    });

    it('a bare --creation-date (no value) is a usage error', () => {
        expect(() => resolveReproducibleDate({ 'creation-date': true }, {})).toThrow(CliError);
    });
});
