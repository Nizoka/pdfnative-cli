// sign --timestamp-timeout <ms> (v1.5.0, ROADMAP "dedicated TSA timeout flags").

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { sign } from '../../src/commands/sign.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';
import { setTimestampProvider, ensureCryptoReady } from '../../src/core-bridge/index.js';
import { createMockPki, createMockTimestampProvider } from '../helpers/mock-pki.js';
import { TempFiles, MINIMAL_DOC, RSA_KEY, RSA_CERT, renderTo, captured, withJsonEnvelope } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
const TSA_URL = 'http://tsa.mock.invalid/tsr';
let pdf = '';

beforeAll(async () => {
    await ensureCryptoReady();
    pdf = (await renderTo(tmp, MINIMAL_DOC)).output;
});
afterEach(() => {
    vi.restoreAllMocks();
    setTimestampProvider(null);
});

const creds = ['--key', RSA_KEY, '--cert', RSA_CERT];

describe('sign --timestamp-timeout', () => {
    it('is forwarded and reported in the envelope (mock TSA, zero network)', async () => {
        setTimestampProvider(createMockTimestampProvider(createMockPki()));
        const out = tmp.path('signed.pdf');
        const { envelope } = await withJsonEnvelope(() => sign(parseArgs(['--input', pdf, '--output', out, ...creds, '--timestamp', TSA_URL, '--timestamp-timeout', '3000'])));
        expect(envelope).toMatchObject({ ok: true, command: 'sign', timestamp: { url: TSA_URL, digest: 'sha256', timeoutMs: 3000 } });
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects a non-positive or non-integer value with exit 2', async () => {
        for (const bad of ['0', '-5', '1.5', 'soon']) {
            await expect(captured(() => sign(parseArgs(['--input', pdf, '--output', tmp.path('x.pdf'), ...creds, '--timestamp', TSA_URL, '--timestamp-timeout', bad])))).rejects.toMatchObject({ exitCode: 2 });
        }
    });

    it('is a usage error without --timestamp', async () => {
        try {
            await captured(() => sign(parseArgs(['--input', pdf, '--output', tmp.path('x.pdf'), ...creds, '--timestamp-timeout', '3000'])));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).exitCode).toBe(2);
            expect((e as CliError).message).toContain('--timestamp');
        }
    });

    it('--dry-run never contacts the TSA, timeout or not', async () => {
        let called = false;
        setTimestampProvider({ getTimestamp: () => { called = true; return Promise.reject(new Error('should not be called')); } });
        const out = tmp.path('dry.pdf');
        const { envelope } = await withJsonEnvelope(() => sign(parseArgs(['--input', pdf, '--output', out, ...creds, '--timestamp', TSA_URL, '--timestamp-timeout', '10', '--dry-run'])));
        expect(envelope).toMatchObject({ ok: true, dryRun: true });
        expect(called).toBe(false);
        await expect(fs.stat(out)).rejects.toThrow();
    });
});
