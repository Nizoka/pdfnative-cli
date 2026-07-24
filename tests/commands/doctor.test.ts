import { describe, it, expect, afterEach, vi } from 'vitest';
import { doctor } from '../../src/commands/doctor.js';
import { parseArgs } from '../../src/utils/args.js';

function capture(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
        calls.push(String(c));
        return true;
    });
    return { calls, restore: () => spy.mockRestore() };
}

describe('doctor', () => {
    const origExit = process.exitCode;
    afterEach(() => {
        vi.restoreAllMocks();
        process.exitCode = origExit;
    });

    it('prints a text report with all core checks', async () => {
        const out = capture();
        await doctor(parseArgs([]));
        out.restore();
        const text = out.calls.join('');
        expect(text).toContain('pdfnative-cli doctor');
        for (const name of ['cli', 'node', 'webcrypto', 'pdfnative', 'commands']) {
            expect(text).toContain(name);
        }
    });

    it('emits a machine-readable report with --format json', async () => {
        const out = capture();
        await doctor(parseArgs(['--format', 'json']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(typeof doc.ok).toBe('boolean');
        expect(Array.isArray(doc.checks)).toBe(true);
        const names = (doc.checks as { name: string }[]).map((c) => c.name);
        expect(names).toEqual(expect.arrayContaining(['cli', 'node', 'webcrypto', 'pdfnative', 'commands']));
    });

    it('passes in this environment (Node >= 20, Web Crypto present) and leaves exit code 0', async () => {
        const out = capture();
        await doctor(parseArgs(['--format', 'json']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.ok).toBe(true);
        expect(process.exitCode ?? 0).toBe(0);
        // webcrypto must be reported available (encrypt depends on it).
        const wc = (doc.checks as { name: string; status: string }[]).find((c) => c.name === 'webcrypto');
        expect(wc?.status).toBe('ok');
    });
});
