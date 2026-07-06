import { describe, it, expect } from 'vitest';
import { parseMaxOutputSize, collectSourcePaths } from '../../src/utils/pdfops.js';
import { CliError } from '../../src/utils/error.js';

describe('parseMaxOutputSize', () => {
    it('returns undefined when the flag is absent', () => {
        expect(parseMaxOutputSize(undefined)).toBeUndefined();
    });

    it('parses a positive integer of bytes', () => {
        expect(parseMaxOutputSize('1048576')).toBe(1048576);
    });

    it.each(['0', 'none', 'off', 'NONE'])('maps %j to Infinity (guard disabled)', (v) => {
        expect(parseMaxOutputSize(v)).toBe(Number.POSITIVE_INFINITY);
    });

    it.each(['-1', 'abc', '1.5', '10mb'])('rejects invalid value %j', (v) => {
        expect(() => parseMaxOutputSize(v)).toThrow(CliError);
    });
});

describe('collectSourcePaths', () => {
    it('merges positionals and --input flags in order', () => {
        expect(collectSourcePaths(['a.pdf', 'b.pdf'], ['c.pdf'])).toEqual([
            'a.pdf', 'b.pdf', 'c.pdf',
        ]);
    });

    it('trims and drops empty entries', () => {
        expect(collectSourcePaths([' a.pdf ', ''], [' '])).toEqual(['a.pdf']);
    });

    it('rejects path traversal', () => {
        expect(() => collectSourcePaths(['../etc/passwd'], [])).toThrow(CliError);
    });
});
