import { describe, it, expect, afterEach } from 'vitest';
import {
    parseMaxOutputSize,
    collectSourcePaths,
    firstNonEmpty,
    resolveSourcePassword,
    normalizeEncryptAlgo,
    readEncryptTrigger,
} from '../../src/utils/pdfops.js';
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

describe('firstNonEmpty', () => {
    it('returns the first non-empty string', () => {
        expect(firstNonEmpty(undefined, '', 'x', 'y')).toBe('x');
    });
    it('treats empty string as absent', () => {
        expect(firstNonEmpty('', '')).toBeUndefined();
    });
    it('returns undefined when all are empty/undefined', () => {
        expect(firstNonEmpty(undefined, undefined)).toBeUndefined();
    });
});

describe('resolveSourcePassword — env precedence', () => {
    const KEY = 'PDFNATIVE_PASSWORD';
    const orig = process.env[KEY];
    afterEach(() => {
        if (orig === undefined) delete process.env[KEY];
        else process.env[KEY] = orig;
    });

    it('uses the --password flag when env is unset', () => {
        delete process.env[KEY];
        expect(resolveSourcePassword({ password: 'flagpw' })).toBe('flagpw');
    });
    it('lets a non-empty env win over the flag', () => {
        process.env[KEY] = 'envpw';
        expect(resolveSourcePassword({ password: 'flagpw' })).toBe('envpw');
    });
    it('does NOT let an empty env override the flag (regression)', () => {
        process.env[KEY] = '';
        expect(resolveSourcePassword({ password: 'flagpw' })).toBe('flagpw');
    });
});

describe('normalizeEncryptAlgo', () => {
    it('defaults to aes128', () => {
        expect(normalizeEncryptAlgo(undefined)).toBe('aes128');
    });
    it('accepts aes-256 / 256 / aes256', () => {
        expect(normalizeEncryptAlgo('aes-256')).toBe('aes256');
        expect(normalizeEncryptAlgo('256')).toBe('aes256');
        expect(normalizeEncryptAlgo('aes256')).toBe('aes256');
    });
    it('rejects an unknown algorithm', () => {
        expect(() => normalizeEncryptAlgo('des')).toThrow(CliError);
    });
});

describe('readEncryptTrigger', () => {
    it('is disabled when the flag is absent', () => {
        expect(readEncryptTrigger({})).toEqual({ enabled: false, algoRaw: undefined });
    });
    it('bare --encrypt enables with no explicit algorithm', () => {
        expect(readEncryptTrigger({ encrypt: true })).toEqual({ enabled: true, algoRaw: undefined });
    });
    it('--encrypt aes-256 carries the algorithm', () => {
        expect(readEncryptTrigger({ encrypt: 'aes-256' })).toEqual({ enabled: true, algoRaw: 'aes-256' });
    });
    it('--encrypt=false disables', () => {
        expect(readEncryptTrigger({ encrypt: 'false' })).toEqual({ enabled: false, algoRaw: undefined });
    });
});
