import { describe, it, expect } from 'vitest';
import { parseArgs, getStringFlag, hasFlag } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

describe('parseArgs', () => {
    it('returns empty flags and positionals for empty argv', () => {
        const result = parseArgs([]);
        expect(result.flags).toEqual({});
        expect(result.positionals).toEqual([]);
    });

    it('handles --flag value', () => {
        const result = parseArgs(['--input', 'file.pdf']);
        expect(result.flags['input']).toBe('file.pdf');
    });

    it('handles --flag=value notation', () => {
        const result = parseArgs(['--input=file.pdf']);
        expect(result.flags['input']).toBe('file.pdf');
    });

    it('handles -f value (single-dash short flag)', () => {
        const result = parseArgs(['-i', 'file.pdf']);
        expect(result.flags['i']).toBe('file.pdf');
    });

    it('handles boolean --flag (no value following)', () => {
        const result = parseArgs(['--stream']);
        expect(result.flags['stream']).toBe(true);
    });

    it('treats boolean flag when next token starts with -', () => {
        const result = parseArgs(['--stream', '--output', 'out.pdf']);
        expect(result.flags['stream']).toBe(true);
        expect(result.flags['output']).toBe('out.pdf');
    });

    it('collects positional arguments', () => {
        const result = parseArgs(['render', '--input', 'f.json']);
        expect(result.positionals).toContain('render');
        expect(result.flags['input']).toBe('f.json');
    });

    it('stops flag parsing at --', () => {
        const result = parseArgs(['--input', 'a.json', '--', '--not-a-flag', 'pos']);
        expect(result.flags['input']).toBe('a.json');
        expect(result.positionals).toContain('--not-a-flag');
        expect(result.positionals).toContain('pos');
    });

    it('handles multiple flags', () => {
        const result = parseArgs(['--input', 'a.json', '--output', 'b.pdf', '--stream']);
        expect(result.flags['input']).toBe('a.json');
        expect(result.flags['output']).toBe('b.pdf');
        expect(result.flags['stream']).toBe(true);
    });

    it('collects unknown flags silently', () => {
        const result = parseArgs(['--weird-unknown-flag', 'val']);
        expect(result.flags['weird-unknown-flag']).toBe('val');
    });

    it.each([
        ['--flag value', ['--conformance', '2b'], 'conformance', '2b'],
        ['--flag=value', ['--conformance=3b'], 'conformance', '3b'],
        ['-f value', ['-f', '1b'], 'f', '1b'],
    ])('handles %s correctly', (_label, argv, key, expected) => {
        const result = parseArgs(argv);
        expect(result.flags[key]).toBe(expected);
    });
});

describe('getStringFlag', () => {
    it('returns the string value for a matching flag', () => {
        const flags = { input: 'file.pdf' };
        expect(getStringFlag(flags, 'input')).toBe('file.pdf');
    });

    it('returns undefined when flag is not present', () => {
        expect(getStringFlag({}, 'input')).toBeUndefined();
    });

    it('returns first matching alias', () => {
        const flags = { i: 'file.pdf' };
        expect(getStringFlag(flags, 'input', 'i')).toBe('file.pdf');
    });

    it('throws CliError when flag value is boolean (no value given)', () => {
        const flags = { input: true };
        expect(() => getStringFlag(flags, 'input')).toThrow(CliError);
    });
});

describe('hasFlag', () => {
    it('returns true when flag exists', () => {
        expect(hasFlag({ stream: true }, 'stream')).toBe(true);
    });

    it('returns false when flag is absent', () => {
        expect(hasFlag({}, 'stream')).toBe(false);
    });

    it('returns true for any matching alias', () => {
        expect(hasFlag({ h: true }, 'help', 'h')).toBe(true);
    });
});
