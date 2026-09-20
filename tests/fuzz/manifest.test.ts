// Hostile batch manifests: parseManifest answers with a plan or a
// CliError (E_PARSE for non-JSON, E_USAGE / E_INPUT for a bad shape), and a
// hostile flag name is refused before it can become an argv key.

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { parseManifest } from '../../src/utils/manifest.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, onlyCliError, randomJson, randomToken, assertPrototypeClean, HOSTILE_KEYS } from '../helpers/fuzz.js';

afterAll(assertPrototypeClean);
afterEach(assertPrototypeClean);

const DIR = tmpdir();
const CODES = [ErrorCode.PARSE, ErrorCode.USAGE, ErrorCode.INPUT];

/** A manifest that is valid except for whatever the caller injects. */
function manifest(flags: Record<string, unknown>, extraTask?: unknown): string {
    return JSON.stringify({ version: 1, tasks: [{ id: 't1', command: 'render', flags: { input: 'a.json', output: 'a.pdf', ...flags } }, ...(extraTask === undefined ? [] : [extraTask])] });
}

describe('fuzz: batch manifest', () => {
    it('parseManifest answers 200 random documents with a plan or a stable code', () => {
        forEachCase('parseManifest', 200, (rng) => {
            const raw = rng.chance(0.5)
                ? JSON.stringify(randomJson(rng, 4))
                : rng.chance(0.5)
                    ? manifest(randomJson(rng, 2) as Record<string, unknown>, randomJson(rng, 3))
                    : randomToken(rng, 8);
            const r = onlyCliError(() => parseManifest(raw, DIR), CODES);
            if (r.outcome !== 'ok') return;
            for (const task of r.value.tasks) {
                expect(task.id).toMatch(/^[A-Za-z0-9_-]+$/);
                for (const key of Object.keys(task.flags)) expect(HOSTILE_KEYS).not.toContain(key);
            }
        });
    });

    it.each(HOSTILE_KEYS)('a task flag named "%s" is a usage error', (key) => {
        const r = onlyCliError(() => parseManifest(manifest({ [key]: true }), DIR), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toContain('invalid flag name');
    });

    it('a __proto__ flag defined the way JSON.parse defines it never reaches Object.prototype', () => {
        const raw = '{"version":1,"tasks":[{"id":"t","command":"render","flags":{"__proto__":{"polluted":"yes"},"input":"a.json"}}]}';
        expect(onlyCliError(() => parseManifest(raw, DIR), [ErrorCode.USAGE]).outcome).toBe('error');
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('1 001 tasks are refused by count, not walked', () => {
        const tasks = Array.from({ length: 1001 }, (_, i) => ({ id: `t${i}`, command: 'render', flags: { input: 'a.json' } }));
        const r = onlyCliError(() => parseManifest(JSON.stringify({ version: 1, tasks }), DIR), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
    });
});
