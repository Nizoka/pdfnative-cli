import { describe, it, expect } from 'vitest';
import { CliError, ErrorCode } from '../../src/utils/error.js';

describe('CliError', () => {
    it('defaults exitCode to 1 and code to E_RUNTIME', () => {
        const err = new CliError('boom');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('CliError');
        expect(err.exitCode).toBe(1);
        expect(err.code).toBe(ErrorCode.RUNTIME);
    });

    it('derives E_USAGE from exit code 2 when no code is given', () => {
        const err = new CliError('missing flag', 2);
        expect(err.exitCode).toBe(2);
        expect(err.code).toBe(ErrorCode.USAGE);
    });

    it('keeps E_RUNTIME for non-2 exit codes when no code is given', () => {
        const err = new CliError('io', 1);
        expect(err.code).toBe(ErrorCode.RUNTIME);
    });

    it('honours an explicit code over the exit-code default', () => {
        const err = new CliError('bad pdf', 1, ErrorCode.PARSE);
        expect(err.exitCode).toBe(1);
        expect(err.code).toBe(ErrorCode.PARSE);
    });

    it('allows an explicit code that disagrees with the exit code', () => {
        const err = new CliError('reserved', 2, ErrorCode.UNSUPPORTED);
        expect(err.exitCode).toBe(2);
        expect(err.code).toBe(ErrorCode.UNSUPPORTED);
    });

    it('exposes a stable, distinct set of error codes', () => {
        const values = Object.values(ErrorCode);
        expect(new Set(values).size).toBe(values.length);
        expect(values).toContain('E_USAGE');
        expect(values).toContain('E_PARSE');
        expect(values).toContain('E_SIGN');
        expect(values.every((v) => v.startsWith('E_'))).toBe(true);
    });
});
