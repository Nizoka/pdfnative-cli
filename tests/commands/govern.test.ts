import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { govern } from '../../src/commands/govern.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { force: true }).catch(() => undefined);
    }
});

function capture(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => { calls.push(String(c)); return true; });
    return { calls, restore: () => spy.mockRestore() };
}

async function draft(content: string): Promise<string> {
    const p = path.join(os.tmpdir(), `draft-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
    tmp.push(p);
    await fs.writeFile(p, content, 'utf8');
    return p;
}

describe('govern', () => {
    it('prints the machine-readable policy as JSON', async () => {
        const out = capture();
        await govern(parseArgs(['policy']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.applies_to).toContain('pdfnative-cli');
        expect(doc.policy.human_in_the_loop_mandatory).toBe(true);
    });

    it('prints the human/agent rules', async () => {
        const out = capture();
        await govern(parseArgs(['rules']));
        out.restore();
        expect(out.calls.join('')).toMatch(/draftsman/i);
    });

    it('passes a compliant draft (verify-issue)', async () => {
        const p = await draft('# Bug\n\nExpected on node 20.\n\n```\nrepro\n```\n');
        const out = capture();
        await govern(parseArgs(['verify-issue', p, '--format', 'json']));
        out.restore();
        expect(JSON.parse(out.calls.join('')).ok).toBe(true);
    });

    it('fails a draft that proposes a dependency', async () => {
        const p = await draft('Run `npm install lodash`.\n\n```\nrepro\n```\n');
        const out = capture();
        try {
            await govern(parseArgs(['verify-issue', p, '--format', 'json']));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.POLICY);
            expect((e as CliError).exitCode).toBe(1);
        } finally {
            out.restore();
        }
    });

    it('requires a draft path for verify-issue', async () => {
        await expect(govern(parseArgs(['verify-issue']))).rejects.toBeInstanceOf(CliError);
    });

    it('rejects an unknown subcommand', async () => {
        await expect(govern(parseArgs(['bogus']))).rejects.toBeInstanceOf(CliError);
    });

    it('requires a subcommand', async () => {
        await expect(govern(parseArgs([]))).rejects.toBeInstanceOf(CliError);
    });
});
