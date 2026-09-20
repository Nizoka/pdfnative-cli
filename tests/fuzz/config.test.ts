// Hostile .pdfnativerc.json files: only usage errors or a flat flag map, and
// a `__proto__` / `constructor` key never reaches Object.prototype.

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, applyConfigDefaults, KNOWN_COMMANDS } from '../../src/utils/config.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { forEachCase, onlyCliError, randomJson, randomToken, assertPrototypeClean, HOSTILE_KEYS } from '../helpers/fuzz.js';

const dir = mkdtempSync(join(tmpdir(), 'pdfcli-fuzz-config-'));
afterAll(() => { assertPrototypeClean(); rmSync(dir, { recursive: true, force: true }); });
afterEach(assertPrototypeClean);

function writeConfig(name: string, content: string): string {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
}

describe('fuzz: .pdfnativerc.json', () => {
    it('loadConfig answers 150 random documents with a flat map or E_USAGE', () => {
        forEachCase('loadConfig', 150, (rng, i) => {
            const doc = rng.chance(0.85) ? JSON.stringify(randomJson(rng, 3)) : randomToken(rng, 8);
            const p = writeConfig(`c${i}.json`, doc);
            const command = rng.pick(KNOWN_COMMANDS);
            const r = onlyCliError(() => loadConfig(command, p), [ErrorCode.USAGE]);
            if (r.outcome !== 'ok') return;
            for (const [key, v] of Object.entries(r.value)) {
                expect(HOSTILE_KEYS).not.toContain(key);
                expect(typeof v === 'string' || typeof v === 'boolean' || Array.isArray(v)).toBe(true);
            }
            const merged = applyConfigDefaults(parseArgs(['--input', 'x']), r.value);
            expect(merged.flags.input).toBe('x');
            for (const key of Object.keys(merged.flags)) expect(HOSTILE_KEYS).not.toContain(key);
        });
    });

    it('a __proto__ section or flag is skipped, and Object.prototype stays clean', () => {
        const p = writeConfig('proto.json', '{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"},"render":{"__proto__":{"polluted":"yes"},"prototype":1,"page-size":"a5"}}');
        const defaults = loadConfig('render', p);
        expect(defaults).toEqual({ 'page-size': 'a5' });
        const merged = applyConfigDefaults(parseArgs([]), { __proto__: 'x', 'page-size': 'a5' } as unknown as Record<string, string>);
        expect(Object.keys(merged.flags)).toEqual(['page-size']);
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('a flag the user passed is never overwritten, even when it shadows an inherited name', () => {
        const merged = applyConfigDefaults(parseArgs(['--toString', 'mine', '--quiet']), { toString: 'theirs', quiet: false, input: 'in.json' });
        expect(merged.flags.toString).toBe('mine');
        expect(merged.flags.quiet).toBe(true);
        expect(merged.flags.input).toBe('in.json');
    });

    it('a document over the 1 MB cap is a usage error before parsing', () => {
        const p = writeConfig('big.json', `{"a":"${'x'.repeat(1024 * 1024 + 16)}"}`);
        const r = onlyCliError(() => loadConfig('render', p), [ErrorCode.USAGE]);
        expect(r.outcome).toBe('error');
    });
});
