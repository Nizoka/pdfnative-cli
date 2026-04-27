import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { CliError } from './error.js';

const JSON_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

/**
 * Validate a file path against directory traversal.
 * Throws CliError if the path contains `../` or `..\\` sequences.
 */
export function validatePath(filePath: string): void {
    // Normalise backslashes for Windows paths and check for traversal
    const normalised = filePath.replace(/\\/g, '/');
    if (normalised.includes('../') || normalised === '..') {
        throw new CliError(`Path traversal detected in path: ${filePath}`, 1);
    }
}

/**
 * Read all bytes from stdin.
 */
export function readStdin(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
        process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
        process.stdin.on('error', reject);
    });
}

/**
 * Read a file by path, or fall back to stdin if `filePath` is undefined.
 */
export async function readFileOrStdin(filePath: string | undefined): Promise<Buffer> {
    if (filePath === undefined) {
        return readStdin();
    }
    validatePath(filePath);
    return readFile(filePath);
}

/**
 * Enforce the 50 MB JSON input size limit on a buffer.
 * Throws CliError if the buffer exceeds the limit.
 */
export function assertJsonSizeLimit(buf: Buffer): void {
    if (buf.length > JSON_SIZE_LIMIT) {
        throw new CliError(
            `JSON input exceeds the 50 MB limit (got ${(buf.length / 1024 / 1024).toFixed(1)} MB).`,
            1,
        );
    }
}

/**
 * Write binary data to a file path, or to stdout if `filePath` is undefined.
 */
export async function writeOutput(data: Uint8Array, filePath: string | undefined): Promise<void> {
    if (filePath === undefined) {
        await new Promise<void>((resolve, reject) => {
            process.stdout.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return;
    }
    validatePath(filePath);
    await writeFile(filePath, data);
}

/**
 * Pipe streaming PDF chunks to a file or stdout.
 * Used by `render --stream`.
 */
export async function writeStreamingOutput(
    chunks: AsyncGenerator<Uint8Array>,
    filePath: string | undefined,
): Promise<void> {
    if (filePath === undefined) {
        for await (const chunk of chunks) {
            await new Promise<void>((resolve, reject) => {
                process.stdout.write(chunk, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        return;
    }

    validatePath(filePath);
    const stream = createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        (async () => {
            for await (const chunk of chunks) {
                const ok = stream.write(chunk);
                if (!ok) {
                    await new Promise<void>((r) => stream.once('drain', r));
                }
            }
            stream.end();
        })().catch(reject);
    });
}

