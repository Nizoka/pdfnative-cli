// Every key a command passes to emitStatus({...}) is a property of the
// `status` schema (v1.5.0, audit B-03): the contract says every envelope
// field is pinned, so this suite reads the sources and holds them to the
// schema. A new envelope field must be added to schema.ts `status` — with a
// description saying which command emits it — before this passes again.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { schema } from '../../src/commands/schema.js';
import { parseArgs } from '../../src/utils/args.js';
import { captured } from '../helpers/cli-harness.js';

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'commands');

afterEach(() => vi.restoreAllMocks());

/** The balanced `{ … }` literal starting at `start`. */
function objectLiteralAt(text: string, start: number): string {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return text.slice(start);
}

/** Top-level property names of an object literal (nested braces/brackets/parens masked). */
function topLevelKeys(literal: string): string[] {
    let depth = 0;
    let top = '';
    for (const ch of literal.slice(1, -1)) {
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') depth--;
        top += depth === 0 ? ch : ' ';
    }
    const keys: string[] = [];
    for (const m of top.matchAll(/(?:^|,)\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_]\w*)\s*(?::|,|$)/gm)) keys.push(m[1] as string);
    return keys;
}

/**
 * Every envelope key each command file emits: the keys of every
 * `emitStatus({ … })` literal, plus — for `emitStatus(name)` — the keys of
 * `const name … = { … }` and every `name['key'] = …` / `name.key = …`
 * assignment, plus the keys of the spread helpers render.ts uses
 * (`conformanceFields`, `diagnosticsField`: `out.<key> =` / `{ <key> }`).
 */
export function emittedStatusKeys(file: string): Set<string> {
    const text = readFileSync(join(COMMANDS_DIR, file), 'utf8');
    const keys = new Set<string>();
    const spreads = new Set<string>();
    for (const m of text.matchAll(/emitStatus\(\s*(\{|[A-Za-z_]\w*)/g)) {
        if (m[1] === '{') {
            const literal = objectLiteralAt(text, m.index + m[0].length - 1);
            for (const k of topLevelKeys(literal)) keys.add(k);
            for (const s of literal.matchAll(/\.\.\.([A-Za-z_]\w*)\([^)]*\)/g)) spreads.add(s[1] as string);
        } else {
            const name = m[1] as string;
            for (const c of text.matchAll(new RegExp(`const ${name}[^=]*=\\s*\\{`, 'g'))) {
                for (const k of topLevelKeys(objectLiteralAt(text, c.index + c[0].length - 1))) keys.add(k);
            }
            for (const a of text.matchAll(new RegExp(`${name}\\[['"]([A-Za-z_]\\w*)['"]\\]\\s*=`, 'g'))) keys.add(a[1] as string);
            for (const a of text.matchAll(new RegExp(`${name}\\.([A-Za-z_]\\w*)\\s*=`, 'g'))) keys.add(a[1] as string);
        }
    }
    for (const helper of spreads) {
        // `function helper(…) { … }` (ends at the first line holding only `}`)
        // or `const helper = (…) => …;` (ends at the first `;` at end of line).
        const start = text.search(new RegExp(`(?:function ${helper}\\(|const ${helper}\\s*=)`));
        if (start < 0) continue;
        const isFunction = text.startsWith('function', start);
        const end = isFunction ? text.indexOf('\n}', start) : text.indexOf(';\n', start);
        const body = text.slice(start, end < 0 ? undefined : end + 2);
        for (const a of body.matchAll(/\bout\.([A-Za-z_]\w*)\s*=/g)) keys.add(a[1] as string);
        for (const a of body.matchAll(/\?\s*\{\s*([A-Za-z_]\w*)\s*\}/g)) keys.add(a[1] as string);
    }
    return keys;
}

describe('schema status pins every emitted envelope field (v1.5.0)', () => {
    let status: { properties: Record<string, { description?: string }> };
    let pinned = new Set<string>();
    const files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.ts')).sort();

    beforeAll(async () => {
        const { stdout } = await captured(() => schema(parseArgs(['status'])));
        status = JSON.parse(stdout) as typeof status;
        pinned = new Set(Object.keys(status.properties));
    });

    it('reads the 13 status-emitting command files (batch prints its own summary on stdout)', () => {
        const emitting = files.filter((f) => emittedStatusKeys(f).size > 0);
        expect(emitting).toEqual([
            'annotate.ts', 'compare.ts', 'decrypt.ts', 'docTimestamp.ts', 'encrypt.ts', 'extract.ts', 'fill.ts',
            'ltv.ts', 'merge.ts', 'metadata.ts', 'render.ts', 'sign.ts', 'split.ts',
        ]);
    });

    it.each(files)('%s emits only pinned keys', (file) => {
        const keys = emittedStatusKeys(file);
        keys.add('ok'); // added by emitStatus itself
        const unpinned = [...keys].filter((k) => !pinned.has(k)).sort();
        expect(unpinned, `add these to schema.ts status.properties with a "<command>: …" description`).toEqual([]);
    });

    it('resolves the render spread helpers (pdfx, creationDate, diagnostics) rather than skipping them', () => {
        const keys = emittedStatusKeys('render.ts');
        expect([...keys]).toEqual(expect.arrayContaining(['variant', 'inspectLayout', 'pdfx', 'creationDate', 'diagnostics']));
    });

    it('resolves the sign variable envelope (algorithm, timestamp)', () => {
        expect([...emittedStatusKeys('sign.ts')]).toEqual(expect.arrayContaining(['algorithm', 'timestamp', 'bytes']));
    });

    it('every pinned command-specific property names the command that emits it', () => {
        const generic = new Set(['ok', 'command', 'dryRun', 'output', 'bytes']);
        for (const [key, def] of Object.entries(status.properties)) {
            if (generic.has(key)) continue;
            expect(def.description, key).toMatch(/^[a-z-]+( \/ [a-z-]+)*( --[a-z-]+)?( --[a-z-]+)?:|^(render|sign|ltv|compare|fill|metadata|split|merge|extract|annotate|encrypt|decrypt|doc-timestamp)\b/);
        }
    });
});
