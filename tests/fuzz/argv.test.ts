// Hostile argv through the two parse passes: a CliError (usage) or a parsed
// shape, never a crash, never a prototype write.

import { describe, it, expect, afterAll } from 'vitest';
import { parseArgs, GLOBAL_BOOLEAN_FLAGS } from '../../src/utils/args.js';
import { splitCommandArgv } from '../../src/utils/argv.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, mulberry32, onlyCliError, randomToken, assertPrototypeClean, HOSTILE_KEYS, DEFAULT_SEED } from '../helpers/fuzz.js';

afterAll(assertPrototypeClean);

function randomArgv(rng: ReturnType<typeof mulberry32>): string[] {
    const argv: string[] = [];
    const n = rng.int(9);
    for (let i = 0; i < n; i++) {
        const t = randomToken(rng, 3);
        argv.push(rng.pick([t, `--${t}`, `-${t.slice(0, 1)}`, `--${t}=${randomToken(rng, 2)}`, '--', 'render', '--json']));
    }
    return argv;
}

describe('fuzz: argv', () => {
    it('parseArgs answers 400 random argv arrays with a shape or E_USAGE', () => {
        forEachCase('parseArgs', 400, (rng) => {
            const argv = randomArgv(rng);
            const r = onlyCliError(() => parseArgs(argv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS }), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            for (const p of r.value.positionals) expect(typeof p).toBe('string');
            for (const [key, v] of Object.entries(r.value.flags)) {
                expect(HOSTILE_KEYS).not.toContain(key);
                expect(typeof v === 'string' || typeof v === 'boolean' || Array.isArray(v)).toBe(true);
            }
            assertPrototypeClean();
        });
    });

    it('splitCommandArgv never throws on random argv and always returns argv it was given (minus one token)', () => {
        forEachCase('splitCommandArgv', 400, (rng) => {
            const argv = randomArgv(rng);
            const r = onlyCliError(() => splitCommandArgv(argv), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            const { commandName, commandArgv } = r.value;
            expect(commandArgv.length).toBe(commandName === undefined ? argv.length : argv.length - 1);
            for (const t of commandArgv) expect(argv).toContain(t);
        });
    });

    it.each(['--__proto__', '--__proto__=x', '--constructor', '--prototype'])('%s is a usage error, not a prototype write', (flag) => {
        const r = onlyCliError(() => parseArgs([flag, 'x']), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.exitCode).toBe(2);
        assertPrototypeClean();
    });

    it.each(['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'])('--%s reads own flags only (a repeated inherited name collects, never crashes)', (name) => {
        const r = onlyCliError(() => parseArgs([`--${name}`, 'a', `--${name}`, 'b']));
        expect(r.outcome).toBe('ok');
        if (r.outcome === 'ok') expect(r.value.flags[name]).toEqual(['a', 'b']);
    });

    it('is deterministic: the same seed yields the same outcomes', () => {
        const run = (): string[] => {
            const out: string[] = [];
            forEachCase('det', 50, (rng) => {
                const r = onlyCliError(() => parseArgs(randomArgv(rng), { booleanFlags: GLOBAL_BOOLEAN_FLAGS }));
                out.push(r.outcome === 'ok' ? JSON.stringify(r.value) : r.error.code);
            }, DEFAULT_SEED);
            return out;
        };
        expect(run()).toEqual(run());
    });
});
