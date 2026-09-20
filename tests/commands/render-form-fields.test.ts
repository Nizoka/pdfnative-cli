// Audit D-01 — pdfnative does not validate `formField.fieldType`: an unknown
// value (the HTML-flavoured `textarea` / `select`) falls through its geometry
// table and writes NaN coordinates, a PDF this CLI's own `fill` then refuses.
// `render` refuses the value up front, in a real run and in a dry run.

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { render, FORM_FIELD_TYPES } from '../../src/commands/render.js';
import { readFormFields } from '../../src/core-bridge/index.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { TempFiles } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(() => tmp.cleanup());

function formDoc(fieldType: unknown): object {
    return {
        title: 'Form',
        blocks: [
            { type: 'heading', text: 'Form', level: 1 },
            { type: 'formField', fieldType, name: 'f1', label: 'Field', options: ['a', 'b'] },
        ],
    };
}

describe('render — formField.fieldType validation', () => {
    it('lists the six engine field types', () => {
        expect(FORM_FIELD_TYPES).toEqual(['text', 'multilineText', 'checkbox', 'radio', 'dropdown', 'listbox']);
    });

    it.each(['textarea', 'select', 'TEXT', '', 42, null, undefined])('refuses fieldType %j with E_INPUT', async (bad) => {
        const input = await tmp.json('in.json', formDoc(bad));
        const out = tmp.path('out.pdf');
        const err = await render(parseArgs(['--input', input, '--output', out])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(ErrorCode.INPUT);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).message).toContain('blocks[1] ("f1")');
        expect((err as CliError).message).toContain('multilineText');
        await expect(fs.access(out)).rejects.toBeDefined();
    });

    it('refuses it in a dry run as well', async () => {
        const input = await tmp.json('in.json', formDoc('textarea'));
        await expect(render(parseArgs(['--input', input, '--dry-run']))).rejects.toMatchObject({ code: ErrorCode.INPUT });
    });

    it.each(FORM_FIELD_TYPES.map((t) => [t] as const))('renders fieldType %s without NaN and the form reads back', async (type) => {
        const input = await tmp.json('in.json', formDoc(type));
        const out = tmp.path('out.pdf');
        await render(parseArgs(['--input', input, '--output', out]));
        const bytes = await fs.readFile(out);
        expect(bytes.includes(Buffer.from('NaN'))).toBe(false);
        // An unset choice field is left out of `fill --export`, so read the field list itself.
        const names = readFormFields(new Uint8Array(bytes)).map((f) => f.name);
        expect(names).toContain('f1');
    });
});

describe('samples — every formField uses an engine field type', () => {
    it('holds for every JSON document under samples/render/', async () => {
        const root = path.join(process.cwd(), 'samples', 'render');
        const files = (await fs.readdir(root, { recursive: true })).filter((f) => f.endsWith('.json'));
        const offenders: string[] = [];
        let seen = 0;
        for (const file of files) {
            const doc = JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) as { blocks?: unknown };
            if (!Array.isArray(doc.blocks)) continue;
            for (const block of doc.blocks as { type?: unknown; fieldType?: unknown }[]) {
                if (block.type !== 'formField') continue;
                seen++;
                if (typeof block.fieldType !== 'string' || !FORM_FIELD_TYPES.includes(block.fieldType)) {
                    offenders.push(`${file}: ${String(block.fieldType)}`);
                }
            }
        }
        expect(seen).toBeGreaterThan(0);
        expect(offenders).toEqual([]);
    });
});
