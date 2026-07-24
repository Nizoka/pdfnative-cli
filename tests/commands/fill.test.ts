import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { fill } from '../../src/commands/fill.js';
import { inspect } from '../../src/commands/inspect.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { readFormFields } from '../../src/core-bridge/index.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { recursive: true, force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `fill-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

/** Render an AcroForm PDF with a text, checkbox, and dropdown field. */
async function renderForm(): Promise<string> {
    const blocks = [
        { type: 'heading', text: 'Form', level: 1 },
        { type: 'formField', fieldType: 'text', name: 'fullName', label: 'Name' },
        { type: 'formField', fieldType: 'checkbox', name: 'subscribe', label: 'Subscribe' },
        { type: 'formField', fieldType: 'dropdown', name: 'plan', label: 'Plan', options: ['free', 'pro'] },
    ];
    const inPath = tmpPath('form.json');
    const outPath = tmpPath('form.pdf');
    await fs.writeFile(inPath, JSON.stringify({ blocks }), 'utf8');
    await render(parseArgs(['--input', inPath, '--output', outPath]));
    return outPath;
}

async function writeValues(obj: unknown): Promise<string> {
    const p = tmpPath('values.json');
    await fs.writeFile(p, JSON.stringify(obj), 'utf8');
    return p;
}

describe('fill', () => {
    it('fills text, checkbox, and dropdown fields', async () => {
        const form = await renderForm();
        const data = await writeValues({ fullName: 'Ada Lovelace', subscribe: true, plan: 'pro' });
        const out = tmpPath('filled.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--output', out]));
        const fields = readFormFields(new Uint8Array(await fs.readFile(out)));
        const byName = Object.fromEntries(fields.map((f) => [f.name, f.value]));
        expect(byName.fullName).toBe('Ada Lovelace');
        expect(byName.subscribe).toBe(true);
        expect(byName.plan).toBe('pro');
    });

    it('accepts a { values } wrapper object', async () => {
        const form = await renderForm();
        const data = await writeValues({ values: { fullName: 'Grace' } });
        const out = tmpPath('filled2.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--output', out]));
        const fields = readFormFields(new Uint8Array(await fs.readFile(out)));
        expect(fields.find((f) => f.name === 'fullName')?.value).toBe('Grace');
    });

    it('flattens the form (removes interactive fields)', async () => {
        const form = await renderForm();
        const data = await writeValues({ fullName: 'X' });
        const out = tmpPath('flat.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--flatten', '--output', out]));
        expect(readFormFields(new Uint8Array(await fs.readFile(out)))).toHaveLength(0);
    });

    it('flattens with --flatten alone (no --data)', async () => {
        const form = await renderForm();
        const out = tmpPath('flatonly.pdf');
        await fill(parseArgs(['--input', form, '--flatten', '--output', out]));
        expect(readFormFields(new Uint8Array(await fs.readFile(out)))).toHaveLength(0);
    });

    it('rejects an unknown field with E_INPUT', async () => {
        const form = await renderForm();
        const data = await writeValues({ nope: 'x' });
        await expect(
            fill(parseArgs(['--input', form, '--data', data, '--output', tmpPath('x.pdf')])),
        ).rejects.toMatchObject({ code: ErrorCode.INPUT });
    });

    it('ignores unknown fields with --on-unknown ignore', async () => {
        const form = await renderForm();
        const data = await writeValues({ nope: 'x', fullName: 'ok' });
        const out = tmpPath('ok.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--on-unknown', 'ignore', '--output', out]));
        expect(readFormFields(new Uint8Array(await fs.readFile(out))).find((f) => f.name === 'fullName')?.value).toBe('ok');
    });

    it('requires --data or --flatten', async () => {
        const form = await renderForm();
        await expect(fill(parseArgs(['--input', form, '--output', tmpPath('x.pdf')]))).rejects.toBeInstanceOf(CliError);
    });

    it('rejects a value of the wrong JSON type with (exit 1, E_INPUT)', async () => {
        const form = await renderForm();
        const data = await writeValues({ fullName: 42 });
        await expect(
            fill(parseArgs(['--input', form, '--data', data, '--output', tmpPath('x.pdf')])),
        ).rejects.toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('rejects a non-object --data payload with (exit 1, E_INPUT)', async () => {
        const form = await renderForm();
        const data = await writeValues([1, 2, 3]);
        await expect(
            fill(parseArgs(['--input', form, '--data', data, '--output', tmpPath('x.pdf')])),
        ).rejects.toMatchObject({ exitCode: 1, code: ErrorCode.INPUT });
    });

    it('dry-run validates without writing output', async () => {
        const form = await renderForm();
        const data = await writeValues({ fullName: 'X' });
        const out = tmpPath('none.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--output', out, '--dry-run']));
        await expect(fs.access(out)).rejects.toThrow();
    });
});

describe('fill --export', () => {
    function capture(): { calls: string[]; restore: () => void } {
        const calls: string[] = [];
        // writeOutput() uses the callback form of stdout.write — invoke it so the
        // returned promise resolves.
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((c: unknown, cb?: unknown) => {
            calls.push(typeof c === 'string' ? c : Buffer.from(c as Uint8Array).toString('utf8'));
            if (typeof cb === 'function') (cb as () => void)();
            return true;
        }) as typeof process.stdout.write);
        return { calls, restore: () => spy.mockRestore() };
    }

    it('exports current values as a --data-shaped map (unset choice omitted)', async () => {
        const form = await renderForm();
        const out = capture();
        await fill(parseArgs(['--input', form, '--export', '--pretty']));
        out.restore();
        const map = JSON.parse(out.calls.join(''));
        expect(map.fullName).toBe('');       // text → blank template default
        expect(map.subscribe).toBe(false);   // checkbox → boolean
        expect('plan' in map).toBe(false);   // unset dropdown → omitted
    });

    it('round-trips: export → edit → fill applies the edits', async () => {
        const form = await renderForm();
        const out = capture();
        await fill(parseArgs(['--input', form, '--export']));
        out.restore();
        const map = JSON.parse(out.calls.join(''));
        map.fullName = 'Grace Hopper';
        map.subscribe = true;
        const data = await writeValues(map);
        const filled = tmpPath('rt.pdf');
        await fill(parseArgs(['--input', form, '--data', data, '--output', filled]));
        const fields = readFormFields(new Uint8Array(await fs.readFile(filled)));
        const byName = Object.fromEntries(fields.map((f) => [f.name, f.value]));
        expect(byName.fullName).toBe('Grace Hopper');
        expect(byName.subscribe).toBe(true);
    });

    it('writes the export to --output when given', async () => {
        const form = await renderForm();
        const out = tmpPath('values.json');
        await fill(parseArgs(['--input', form, '--export', '--output', out]));
        const map = JSON.parse(await fs.readFile(out, 'utf8'));
        expect(map.fullName).toBe('');
    });
});

describe('inspect --form-fields / --encryption', () => {
    it('lists form fields', async () => {
        const form = await renderForm();
        const calls: string[] = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { calls.push(String(c)); return true; });
        await inspect(parseArgs(['--input', form, '--form-fields', '--format', 'json', '--pretty']));
        const doc = JSON.parse(calls.join(''));
        const names = (doc.formFields as { name: string }[]).map((f) => f.name);
        expect(names).toEqual(expect.arrayContaining(['fullName', 'subscribe', 'plan']));
    });

    it('reports no encryption for an unencrypted PDF', async () => {
        const form = await renderForm();
        const calls: string[] = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { calls.push(String(c)); return true; });
        await inspect(parseArgs(['--input', form, '--encryption', '--format', 'json', '--pretty']));
        expect(JSON.parse(calls.join('')).encryption).toBeNull();
    });
});
