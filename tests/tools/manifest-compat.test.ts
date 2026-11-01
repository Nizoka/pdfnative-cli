// v1.6.0 — the zero-breaking-change policy of the process contract, half one:
// every command, flag, global flag, error code, schema subject and envelope
// field the previous release's `schema manifest` / `schema list` /
// `schema status` described still exists, with the same type (SECURITY.md
// §Compatibility promise). The fixtures are the previous release's own
// answers (`npx pdfnative-cli@1.5.0 schema manifest`, …), committed so the
// check runs without the registry. Half two is scripts/run-compat.ts, which
// runs the previous suite itself.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { schema } from '../../src/commands/schema.js';
import { parseArgs } from '../../src/utils/args.js';
import { captured } from '../helpers/cli-harness.js';
import { findAllowList, parseAllowList } from '../../scripts/run-compat.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PREVIOUS = '1.5.0';

interface Manifest {
    readonly version: string;
    readonly commands: ReadonlyArray<{ readonly name: string; readonly flags: readonly string[] }>;
    readonly globalFlags: readonly string[];
    readonly errorCodes: readonly string[];
}
interface JsonSchema { readonly properties?: Record<string, { readonly type?: string | readonly string[] }> }

const previous = JSON.parse(readFileSync(resolve(ROOT, 'tests', 'compat', `manifest-${PREVIOUS}.json`), 'utf8')) as Manifest;
const previousSubjects = (JSON.parse(readFileSync(resolve(ROOT, 'tests', 'compat', `subjects-${PREVIOUS}.json`), 'utf8')) as { subjects: string[] }).subjects;
const previousStatus = JSON.parse(readFileSync(resolve(ROOT, 'tests', 'compat', `status-${PREVIOUS}.json`), 'utf8')) as JsonSchema;

async function subject<T>(name: string): Promise<T> {
    const { stdout } = await captured(() => schema(parseArgs([name])));
    return JSON.parse(stdout) as T;
}

describe(`manifest-compat: the ${PREVIOUS} process contract is a subset of today's`, () => {
    it('the fixtures are the previous release, and the allow-list names the same tag', () => {
        expect(previous.version).toBe(PREVIOUS);
        const allow = parseAllowList(readFileSync(findAllowList(ROOT) as string, 'utf8'));
        expect(allow.tag).toBe(`v${PREVIOUS}`);
    });

    it('every command and every flag of the previous release is still there (flags only grow)', async () => {
        const current = await subject<Manifest>('manifest');
        const byName = new Map(current.commands.map((c) => [c.name, c.flags]));
        for (const command of previous.commands) {
            const flags = byName.get(command.name);
            expect(flags, `command ${command.name} was removed`).toBeDefined();
            for (const flag of command.flags) expect(flags, `${command.name} ${flag}`).toContain(flag);
        }
    });

    it('every global flag and every stable error code of the previous release is still there', async () => {
        const current = await subject<Manifest>('manifest');
        for (const flag of previous.globalFlags) expect(current.globalFlags).toContain(flag);
        for (const code of previous.errorCodes) expect(current.errorCodes).toContain(code);
    });

    it('every schema subject of the previous release is still listed', async () => {
        const current = await subject<{ subjects: string[] }>('list');
        for (const name of previousSubjects) expect(current.subjects, name).toContain(name);
    });

    it('every field of the previous status envelope keeps its type (additive only)', async () => {
        const current = await subject<JsonSchema>('status');
        for (const [field, shape] of Object.entries(previousStatus.properties ?? {})) {
            const now = current.properties?.[field];
            expect(now, `status.${field} was removed`).toBeDefined();
            if (shape.type !== undefined) expect(now?.type, `status.${field} changed type`).toEqual(shape.type);
        }
    });
});
