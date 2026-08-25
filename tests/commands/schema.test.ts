import { describe, it, expect, vi, afterEach } from 'vitest';
import { schema } from '../../src/commands/schema.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

function captureStdout(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        calls.push(String(chunk));
        return true;
    });
    return { calls, restore: () => spy.mockRestore() };
}

describe('schema', () => {
    afterEach(() => vi.restoreAllMocks());

    it('prints the render schema when no subject is given', async () => {
        const out = captureStdout();
        await schema(parseArgs([]));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.title).toBe('pdfnative-cli render input');
        expect(doc.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
        expect(Array.isArray(doc.oneOf)).toBe(true);
    });

    it.each([
        'render', 'inspect', 'verify', 'batch', 'annotate', 'extract-text', 'fill',
        'form-export', 'inspect-summary', 'verify-summary', 'batch-summary',
        'govern-verify', 'metadata', 'ltv-data', 'compare', 'batch-manifest', 'status', 'doctor',
    ])(
        'prints a valid Draft 2020-12 schema for "%s"',
        async (subject) => {
            const out = captureStdout();
            await schema(parseArgs([subject]));
            out.restore();
            const doc = JSON.parse(out.calls.join(''));
            expect(doc.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
            expect(typeof doc.title).toBe('string');
        },
    );

    it('emits a capability manifest for "manifest"', async () => {
        const out = captureStdout();
        await schema(parseArgs(['manifest']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.kind).toBe('capability-manifest');
        expect(doc.name).toBe('pdfnative-cli');
        expect(Array.isArray(doc.commands)).toBe(true);
        // Every new 1.3.0 command must be discoverable.
        const names = (doc.commands as { name: string }[]).map((c) => c.name);
        expect(names).toEqual(
            expect.arrayContaining(['extract-text', 'fill', 'encrypt', 'decrypt']),
        );
        expect(doc.errorCodes).toContain('E_PASSWORD');
    });

    it('embeds the CLI version in the schema $id', async () => {
        const out = captureStdout();
        await schema(parseArgs(['inspect']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.$id).toMatch(
            /^https:\/\/pdfnative\.dev\/schema\/cli\/\d+\.\d+\.\d+\/inspect\.schema\.json$/,
        );
    });

    it('lists the available subjects', async () => {
        const out = captureStdout();
        await schema(parseArgs(['list']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.subjects).toEqual([
            'render',
            'inspect',
            'verify',
            'batch',
            'annotate',
            'extract-text',
            'fill',
            'form-export',
            'inspect-summary',
            'verify-summary',
            'batch-summary',
            'govern-verify',
            'metadata',
            'ltv-data',
            'compare',
            'batch-manifest',
            'status',
            'manifest',
            'doctor',
        ]);
    });

    it('embeds the CLI version in a summary schema $id', async () => {
        const out = captureStdout();
        await schema(parseArgs(['verify-summary']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.$id).toMatch(
            /^https:\/\/pdfnative\.dev\/schema\/cli\/\d+\.\d+\.\d+\/verify-summary\.schema\.json$/,
        );
        expect(doc.required).toEqual(['valid', 'signatures', 'invalid']);
    });

    it('rejects an unknown subject with a usage error', async () => {
        await expect(schema(parseArgs(['bogus']))).rejects.toBeInstanceOf(CliError);
        await schema(parseArgs(['bogus'])).catch((err: CliError) => {
            expect(err.exitCode).toBe(2);
            expect(err.code).toBe(ErrorCode.USAGE);
        });
    });

    it('should cover every key the batch manifest-mode envelope emits (full and --summary)', async () => {
        // Guard against the pinned schema rejecting the real output: every key
        // emitted by `batch --manifest` (see emitManifestSummary in batch.ts)
        // must be declared, because both schemas set additionalProperties:false.
        const manifestModeKeys = ['ok', 'command', 'mode', 'dryRun', 'total', 'succeeded', 'failed', 'skipped'];

        const out = captureStdout();
        await schema(parseArgs(['batch']));
        out.restore();
        const full = JSON.parse(out.calls.join(''));
        for (const key of [...manifestModeKeys, 'tasks', 'results']) {
            expect(Object.keys(full.properties), `batch schema missing "${key}"`).toContain(key);
        }

        const out2 = captureStdout();
        await schema(parseArgs(['batch-summary']));
        out2.restore();
        const summary = JSON.parse(out2.calls.join(''));
        for (const key of manifestModeKeys) {
            expect(Object.keys(summary.properties), `batch-summary schema missing "${key}"`).toContain(key);
        }
    });

    it('should print the metadata --from-json input schema', async () => {
        const out = captureStdout();
        await schema(parseArgs(['metadata']));
        out.restore();
        const doc = JSON.parse(out.calls.join(''));
        expect(doc.title).toBe('pdfnative-cli metadata input');
        expect(Object.keys(doc.properties)).toEqual(['title', 'author', 'subject', 'keywords', 'modDate']);
        expect(doc.additionalProperties).toBe(false);
    });
});
