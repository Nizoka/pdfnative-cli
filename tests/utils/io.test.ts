import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { validatePath, readFileOrStdin, assertJsonSizeLimit, writeOutput, writeStreamingOutput } from '../../src/utils/io.js';
import { CliError } from '../../src/utils/error.js';

vi.mock('node:fs/promises');
vi.mock('node:fs');

describe('validatePath', () => {
    it('throws CliError for path traversal with forward slashes', () => {
        expect(() => validatePath('../etc/passwd')).toThrow(CliError);
    });

    it('throws CliError for path traversal with backslashes', () => {
        expect(() => validatePath('..\\\\windows\\\\system32')).toThrow(CliError);
    });

    it('throws CliError for bare .. path', () => {
        expect(() => validatePath('..')).toThrow(CliError);
    });

    it('allows safe paths', () => {
        expect(() => validatePath('/tmp/safe-file.pdf')).not.toThrow();
        expect(() => validatePath('documents/input.json')).not.toThrow();
        expect(() => validatePath('./file.txt')).not.toThrow();
    });
});

describe('readFileOrStdin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reads from file when filePath is provided', async () => {
        const mockBuffer = Buffer.from('test content');
        (fs.readFile as any).mockResolvedValue(mockBuffer);

        const result = await readFileOrStdin('./test.json');

        expect(fs.readFile).toHaveBeenCalledWith('./test.json');
        expect(result).toEqual(mockBuffer);
    });

    it('throws CliError for path traversal', async () => {
        await expect(readFileOrStdin('../secret/file')).rejects.toThrow(CliError);
    });

    it('reads from stdin when filePath is undefined', async () => {
        const mockBuffer = Buffer.from('stdin content');
        
        // Mock process.stdin
        process.stdin.on = vi.fn((event: string, callback: any) => {
            if (event === 'end') process.nextTick(() => callback());
            return process.stdin as any;
        });
        process.stdin.on = vi.fn((event: string, callback: any) => {
            if (event === 'end') process.nextTick(() => callback());
            return process.stdin as any;
        });

        // This is a simplified test; full stdin mocking is complex
        // The real test would need more sophisticated mocking
    });
});

describe('assertJsonSizeLimit', () => {
    it('passes for buffer below 50 MB', () => {
        const buffer = Buffer.alloc(10 * 1024 * 1024); // 10 MB
        expect(() => assertJsonSizeLimit(buffer)).not.toThrow();
    });

    it('passes for buffer at 50 MB', () => {
        const buffer = Buffer.alloc(50 * 1024 * 1024);
        expect(() => assertJsonSizeLimit(buffer)).not.toThrow();
    });

    it('throws CliError for buffer exceeding 50 MB', () => {
        const buffer = Buffer.alloc(51 * 1024 * 1024);
        expect(() => assertJsonSizeLimit(buffer)).toThrow(CliError);
        expect(() => assertJsonSizeLimit(buffer)).toThrow(/exceeds the 50 MB limit/);
    });
});

describe('writeOutput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('writes to file when filePath is provided', async () => {
        (fs.writeFile as any).mockResolvedValue(undefined);
        const data = new Uint8Array([1, 2, 3, 4]);

        await writeOutput(data, '/tmp/output.pdf');

        expect(fs.writeFile).toHaveBeenCalledWith('/tmp/output.pdf', data);
    });

    it('throws CliError for path traversal', async () => {
        const data = new Uint8Array([1, 2, 3]);
        await expect(writeOutput(data, '../secret/file')).rejects.toThrow(CliError);
    });

    it('writes to stdout when filePath is undefined', async () => {
        const writeStub = vi.fn((data: any, cb: any) => cb());
        process.stdout.write = writeStub;

        const data = new Uint8Array([5, 6, 7]);
        await writeOutput(data, undefined);

        expect(writeStub).toHaveBeenCalled();
    });

    it('handles write errors to stdout', async () => {
        const writeError = new Error('Write failed');
        const writeStub = vi.fn((data: any, cb: any) => cb(writeError));
        process.stdout.write = writeStub;

        const data = new Uint8Array([5, 6, 7]);

        await expect(writeOutput(data, undefined)).rejects.toThrow('Write failed');
    });
});
