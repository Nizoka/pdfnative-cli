import { describe, it, expect } from 'vitest';
import { parsePageList, parsePageRanges } from '../../src/utils/pages.js';
import { CliError } from '../../src/utils/error.js';

describe('parsePageList', () => {
    it('expands single pages and ranges to 0-based indices', () => {
        expect(parsePageList('1,3,5-7', 10)).toEqual([0, 2, 4, 5, 6]);
    });

    it('preserves order and keeps duplicates', () => {
        expect(parsePageList('3,1,1', 5)).toEqual([2, 0, 0]);
    });

    it('accepts a single page', () => {
        expect(parsePageList('2', 3)).toEqual([1]);
    });

    it('tolerates surrounding whitespace', () => {
        expect(parsePageList(' 1 , 2 ', 3)).toEqual([0, 1]);
    });

    it.each(['0', '11', '5-4', 'a', '1-', '1,,2', ''])(
        'rejects invalid selector %j',
        (spec) => {
            expect(() => parsePageList(spec, 10)).toThrow(CliError);
        },
    );

    it('reports a usage exit code (2) on out-of-bounds', () => {
        try {
            parsePageList('99', 3);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).exitCode).toBe(2);
        }
    });
});

describe('parsePageRanges', () => {
    it('maps each segment to a 0-based inclusive range', () => {
        expect(parsePageRanges('1-3,4-6,7', 10)).toEqual([
            { start: 0, end: 2 },
            { start: 3, end: 5 },
            { start: 6, end: 6 },
        ]);
    });

    it('treats a single page as a one-page range', () => {
        expect(parsePageRanges('2', 5)).toEqual([{ start: 1, end: 1 }]);
    });

    it('rejects a reversed range', () => {
        expect(() => parsePageRanges('5-2', 10)).toThrow(CliError);
    });
});
