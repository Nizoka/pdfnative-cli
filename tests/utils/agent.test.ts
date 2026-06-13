import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isJsonMode,
    isDryRun,
    buildErrorEnvelope,
    emitJsonError,
    emitStatus,
} from '../../src/utils/agent.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

describe('agent mode helpers', () => {
    const origJson = process.env['PDFNATIVE_JSON'];
    const origDry = process.env['PDFNATIVE_DRY_RUN'];

    afterEach(() => {
        if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
        else process.env['PDFNATIVE_JSON'] = origJson;
        if (origDry === undefined) delete process.env['PDFNATIVE_DRY_RUN'];
        else process.env['PDFNATIVE_DRY_RUN'] = origDry;
        vi.restoreAllMocks();
    });

    describe('isJsonMode / isDryRun', () => {
        it('reflect the env flags', () => {
            process.env['PDFNATIVE_JSON'] = '1';
            process.env['PDFNATIVE_DRY_RUN'] = '1';
            expect(isJsonMode()).toBe(true);
            expect(isDryRun()).toBe(true);
        });

        it('are false when unset or not exactly "1"', () => {
            delete process.env['PDFNATIVE_JSON'];
            process.env['PDFNATIVE_DRY_RUN'] = 'true';
            expect(isJsonMode()).toBe(false);
            expect(isDryRun()).toBe(false);
        });
    });

    describe('buildErrorEnvelope', () => {
        it('uses the CliError code and message', () => {
            const env = buildErrorEnvelope('inspect', new CliError('bad pdf', 1, ErrorCode.PARSE));
            expect(env).toEqual({
                ok: false,
                command: 'inspect',
                error: { code: ErrorCode.PARSE, message: 'bad pdf' },
            });
        });

        it('substitutes a default message when the CliError message is empty', () => {
            const env = buildErrorEnvelope('verify', new CliError('', 1, ErrorCode.VERIFY_FAILED));
            expect(env.error.code).toBe(ErrorCode.VERIFY_FAILED);
            expect(env.error.message.length).toBeGreaterThan(0);
        });

        it('maps a plain Error to E_RUNTIME', () => {
            const env = buildErrorEnvelope('render', new Error('kaboom'));
            expect(env).toEqual({
                ok: false,
                command: 'render',
                error: { code: ErrorCode.RUNTIME, message: 'kaboom' },
            });
        });

        it('stringifies a non-Error throw', () => {
            const env = buildErrorEnvelope(null, 'oops');
            expect(env.command).toBeNull();
            expect(env.error).toEqual({ code: ErrorCode.RUNTIME, message: 'oops' });
        });
    });

    describe('emitJsonError', () => {
        it('writes a single JSON line to stderr', () => {
            const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
            emitJsonError('sign', new CliError('Failed to sign PDF.', 1, ErrorCode.SIGN));
            expect(spy).toHaveBeenCalledTimes(1);
            const line = spy.mock.calls[0]![0] as string;
            expect(line.endsWith('\n')).toBe(true);
            expect(JSON.parse(line.trim())).toEqual({
                ok: false,
                command: 'sign',
                error: { code: ErrorCode.SIGN, message: 'Failed to sign PDF.' },
            });
        });
    });

    describe('emitStatus', () => {
        it('writes an ok:true envelope to stderr in json mode', () => {
            process.env['PDFNATIVE_JSON'] = '1';
            const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
            emitStatus({ command: 'render', output: 'out.pdf', bytes: 42 });
            expect(spy).toHaveBeenCalledTimes(1);
            const parsed = JSON.parse((spy.mock.calls[0]![0] as string).trim());
            expect(parsed).toEqual({ ok: true, command: 'render', output: 'out.pdf', bytes: 42 });
        });

        it('is a no-op outside json mode', () => {
            delete process.env['PDFNATIVE_JSON'];
            const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
            emitStatus({ command: 'render' });
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
