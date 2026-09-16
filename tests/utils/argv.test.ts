import { describe, it, expect } from 'vitest';
import { parseArgs, GLOBAL_BOOLEAN_FLAGS } from '../../src/utils/args.js';
import { splitCommandArgv } from '../../src/utils/argv.js';
import { GLOBAL_FLAGS } from '../../src/commands/completion.js';

describe('parseArgs: booleanFlags option (v1.5.0)', () => {
    it('a boolean flag never swallows the following bare token', () => {
        const a = parseArgs(['--json', 'render', '--input', 'a.json'], { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
        expect(a.flags.json).toBe(true);
        expect(a.positionals).toEqual(['render']);
        expect(a.flags.input).toBe('a.json');
    });

    it('without the option the historical behaviour is unchanged', () => {
        const a = parseArgs(['--json', 'render']);
        expect(a.flags.json).toBe('render');
        expect(a.positionals).toEqual([]);
    });

    it('short boolean forms behave the same (-q, -h, -V)', () => {
        const a = parseArgs(['-q', 'inspect', '-i', 'x.pdf'], { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
        expect(a.flags.q).toBe(true);
        expect(a.positionals).toEqual(['inspect']);
        expect(a.flags.i).toBe('x.pdf');
    });

    it('value-taking globals still consume their value in front of the command', () => {
        const a = parseArgs(['--max-inflate-size', '1024', '--creation-date', '2026-01-01T00:00:00Z', 'inspect'], { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
        expect(a.flags['max-inflate-size']).toBe('1024');
        expect(a.flags['creation-date']).toBe('2026-01-01T00:00:00Z');
        expect(a.positionals).toEqual(['inspect']);
    });

    it('--flag=value still assigns on a boolean flag name', () => {
        const a = parseArgs(['--json=1', 'doctor'], { booleanFlags: GLOBAL_BOOLEAN_FLAGS });
        expect(a.flags.json).toBe('1');
        expect(a.positionals).toEqual(['doctor']);
    });

    it('every boolean global is a declared global flag (completion table)', () => {
        const declared = new Set(GLOBAL_FLAGS.map((f) => f.replace(/^--/, '')));
        for (const name of GLOBAL_BOOLEAN_FLAGS) {
            if (name.length === 1) continue; // short aliases (-q, -h, -V)
            expect(declared.has(name), name).toBe(true);
        }
    });
});

describe('splitCommandArgv', () => {
    it('resolves the command after a leading boolean global and strips only its first occurrence', () => {
        const r = splitCommandArgv(['--json', '--dry-run', 'render', '--input', 'render']);
        expect(r.commandName).toBe('render');
        expect(r.commandArgv).toEqual(['--json', '--dry-run', '--input', 'render']);
    });

    it('keeps the historical form (command first) intact', () => {
        const r = splitCommandArgv(['inspect', '--input', 'a.pdf', '--json']);
        expect(r.commandName).toBe('inspect');
        expect(r.commandArgv).toEqual(['--input', 'a.pdf', '--json']);
    });

    it('returns undefined when argv names no command', () => {
        expect(splitCommandArgv(['--json']).commandName).toBeUndefined();
        expect(splitCommandArgv([]).commandName).toBeUndefined();
    });

    it('a value-taking global before the command does not shadow it', () => {
        const r = splitCommandArgv(['--config', 'rc.json', 'doctor', '--format', 'json']);
        expect(r.commandName).toBe('doctor');
        expect(r.commandArgv).toEqual(['--config', 'rc.json', '--format', 'json']);
    });
});
