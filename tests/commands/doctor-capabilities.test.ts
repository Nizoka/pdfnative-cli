// doctor: the v1.5.0 checks — bundled fonts (probed on disk), Unicode
// version of the shaping engine, conformance targets, pdfnative 1.8.x.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { doctor } from '../../src/commands/doctor.js';
import { parseArgs } from '../../src/utils/args.js';
import { captured } from '../helpers/cli-harness.js';

interface Check { name: string; status: string; value: string; detail: string }

async function report(): Promise<{ ok: boolean; checks: Check[] }> {
    const { stdout } = await captured(() => doctor(parseArgs(['--format', 'json'])));
    return JSON.parse(stdout) as { ok: boolean; checks: Check[] };
}

describe('doctor capabilities (v1.5.0)', () => {
    const origExit = process.exitCode;
    afterEach(() => {
        vi.restoreAllMocks();
        process.exitCode = origExit;
    });

    it('reports pdfnative 1.8.x or newer — never a pinned patch', async () => {
        const { checks } = await report();
        const engine = checks.find((c) => c.name === 'pdfnative');
        expect(engine?.status).toBe('ok');
        expect(engine?.value).toMatch(/^1\.(8|9|\d{2,})\.\d+$/);
    });

    it('reports 31 bundled modules / 27 scripts, all present on disk, with the aliases', async () => {
        const { checks } = await report();
        const fonts = checks.find((c) => c.name === 'fonts');
        expect(fonts?.status).toBe('ok');
        expect(fonts?.value).toBe('31 modules / 27 scripts');
        for (const code of ['lo', 'nod', 'khb', 'tdd', 'cjm', 'ha', 'yo', 'ig', 'sw']) expect(fonts?.detail).toContain(code);
    });

    it('reports the Universal Shaping Engine Unicode version (17.0.0 or newer)', async () => {
        const { checks } = await report();
        const unicode = checks.find((c) => c.name === 'unicode');
        expect(unicode?.status).toBe('ok');
        expect(unicode?.value).toMatch(/^\d+\.\d+\.\d+$/);
        expect(Number(unicode?.value.split('.')[0])).toBeGreaterThanOrEqual(17);
    });

    it('reports the conformance targets of --tagged and --pdfx', async () => {
        const { checks } = await report();
        const conf = checks.find((c) => c.name === 'conformance');
        expect(conf?.value.split(',')).toEqual(['pdfa1b', 'pdfa2b', 'pdfa2u', 'pdfa3b', 'pdfx4']);
    });

    it('keeps the 1.4.0 checks and passes in this environment', async () => {
        const { ok, checks } = await report();
        expect(ok).toBe(true);
        expect(checks.map((c) => c.name)).toEqual(['cli', 'node', 'webcrypto', 'pdfnative', 'commands', 'fonts', 'unicode', 'conformance']);
        expect(checks.find((c) => c.name === 'commands')?.value).toBe('21');
    });

    it('text mode lists the new checks', async () => {
        const { stdout } = await captured(() => doctor(parseArgs([])));
        for (const name of ['fonts', 'unicode', 'conformance']) expect(stdout).toContain(name);
        expect(stdout).toContain('All checks passed.');
    });
});
