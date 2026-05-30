import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { loadConfig, applyConfigDefaults } from '../../src/utils/config.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';

async function mkTempDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'pdfnativerc-'));
}

describe('loadConfig', () => {
    const dirs: string[] = [];

    afterEach(async () => {
        for (const d of dirs.splice(0)) {
            await fs.rm(d, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('returns an empty object when no config file is found', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        expect(loadConfig('render', undefined, dir)).toEqual({});
    });

    it('reads global flag defaults', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(path.join(dir, '.pdfnativerc.json'), JSON.stringify({ 'no-color': true }));
        expect(loadConfig('render', undefined, dir)).toEqual({ 'no-color': true });
    });

    it('selects the matching command section and ignores other commands', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(
            path.join(dir, '.pdfnativerc.json'),
            JSON.stringify({
                render: { 'page-size': 'a5', compress: true },
                verify: { revocation: 'online' },
            }),
        );
        expect(loadConfig('render', undefined, dir)).toEqual({ 'page-size': 'a5', compress: true });
        expect(loadConfig('verify', undefined, dir)).toEqual({ revocation: 'online' });
    });

    it('lets command-scoped values win over global ones', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(
            path.join(dir, '.pdfnativerc.json'),
            JSON.stringify({ 'page-size': 'letter', render: { 'page-size': 'a5' } }),
        );
        expect(loadConfig('render', undefined, dir)).toEqual({ 'page-size': 'a5' });
    });

    it('coerces numbers to strings and arrays element-wise', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(
            path.join(dir, '.pdfnativerc.json'),
            JSON.stringify({ 'cell-padding': 8, lang: ['th', 'ja'] }),
        );
        expect(loadConfig('render', undefined, dir)).toEqual({ 'cell-padding': '8', lang: ['th', 'ja'] });
    });

    it('discovers a config file in a parent directory', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(path.join(dir, '.pdfnativerc.json'), JSON.stringify({ quiet: true }));
        const child = path.join(dir, 'a', 'b');
        await fs.mkdir(child, { recursive: true });
        expect(loadConfig('sign', undefined, child)).toEqual({ quiet: true });
    });

    it('throws CliError(2) for an explicit --config that does not exist', () => {
        expect(() => loadConfig('render', 'no-such-file.json')).toThrow(CliError);
    });

    it('throws CliError(2) for invalid JSON', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(path.join(dir, '.pdfnativerc.json'), '{not valid');
        expect(() => loadConfig('render', undefined, dir)).toThrow(CliError);
    });

    it('throws CliError(2) when the top level is not an object', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        await fs.writeFile(path.join(dir, '.pdfnativerc.json'), JSON.stringify([1, 2, 3]));
        expect(() => loadConfig('render', undefined, dir)).toThrow(CliError);
    });

    it('reads an explicit --config path', async () => {
        const dir = await mkTempDir();
        dirs.push(dir);
        const file = path.join(dir, 'custom.json');
        await fs.writeFile(file, JSON.stringify({ verify: { revocation: 'disabled' } }));
        expect(loadConfig('verify', file)).toEqual({ revocation: 'disabled' });
    });
});

describe('applyConfigDefaults', () => {
    it('fills only flags absent from the CLI args', () => {
        const args = parseArgs(['--page-size', 'letter']);
        const merged = applyConfigDefaults(args, { 'page-size': 'a5', compress: true });
        expect(merged.flags['page-size']).toBe('letter'); // CLI wins
        expect(merged.flags['compress']).toBe(true); // filled from config
    });

    it('never overwrites a user-provided boolean flag', () => {
        const args = parseArgs(['--compress']);
        const merged = applyConfigDefaults(args, { compress: false });
        expect(merged.flags['compress']).toBe(true);
    });

    it('preserves positionals', () => {
        const args = parseArgs(['bash']);
        const merged = applyConfigDefaults(args, { quiet: true });
        expect(merged.positionals).toEqual(['bash']);
        expect(merged.flags['quiet']).toBe(true);
    });
});
