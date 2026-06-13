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

    it.each(['render', 'inspect', 'verify', 'batch', 'inspect-summary', 'verify-summary', 'batch-summary'])(
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
            'inspect-summary',
            'verify-summary',
            'batch-summary',
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
});
