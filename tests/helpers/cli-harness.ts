// Shared harness for the v1.5.0 command tests: temp files, stdout/stderr
// capture and a one-call render. Commands are driven in-process through
// their exported functions with a hand-built ParsedArgs (the repository
// convention); the built binary is exercised by scripts/gate.ts `smoke` and
// tests/integration/reproducible-build.test.ts.

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { expect, vi } from 'vitest';

import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError } from '../../src/utils/error.js';
import { openPdf } from '../../src/core-bridge/index.js';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const SYNTHETIC_CMYK_ICC = path.join(FIXTURES, 'synthetic-cmyk.icc');
/** A valid monochrome `prtr` profile (scripts/lib/synthetic-gray-profile.ts) — a non-CMYK PDF/X intent. */
export const SYNTHETIC_GRAY_ICC = path.join(FIXTURES, 'synthetic-gray.icc');
export const RSA_KEY = path.join(FIXTURES, 'rsa-key.pem');
export const RSA_CERT = path.join(FIXTURES, 'rsa-cert.pem');

/** A fresh temp path; every path is removed by {@link cleanup}. */
export class TempFiles {
    private readonly paths: string[] = [];

    path(name: string): string {
        const p = path.join(os.tmpdir(), `pdfcli-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
        this.paths.push(p);
        return p;
    }

    async json(name: string, value: unknown): Promise<string> {
        const p = this.path(name);
        await fs.writeFile(p, JSON.stringify(value), 'utf8');
        return p;
    }

    async bytes(name: string, data: Uint8Array): Promise<string> {
        const p = this.path(name);
        await fs.writeFile(p, data);
        return p;
    }

    async cleanup(): Promise<void> {
        for (const p of this.paths.splice(0)) {
            await fs.rm(p, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

export interface Captured {
    readonly text: () => string;
    readonly lines: () => string[];
    readonly restore: () => void;
}

function captureStream(stream: NodeJS.WriteStream): Captured {
    const chunks: string[] = [];
    const spy = vi.spyOn(stream, 'write').mockImplementation((c: unknown) => {
        chunks.push(String(c));
        return true;
    });
    return {
        text: () => chunks.join(''),
        lines: () => chunks.join('').split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
        restore: () => spy.mockRestore(),
    };
}

export const captureStdout = (): Captured => captureStream(process.stdout);
export const captureStderr = (): Captured => captureStream(process.stderr);

/** Run `fn` with stdout and stderr captured; always restores. */
export async function captured<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> {
    const out = captureStdout();
    const err = captureStderr();
    try {
        const result = await fn();
        return { result, stdout: out.text(), stderr: err.text() };
    } finally {
        out.restore();
        err.restore();
    }
}

/** Run `fn` under PDFNATIVE_JSON=1 and return the last JSON envelope on stderr. */
export async function withJsonEnvelope(fn: () => Promise<void>): Promise<{ envelope: Record<string, unknown>; stdout: string }> {
    const prev = process.env['PDFNATIVE_JSON'];
    process.env['PDFNATIVE_JSON'] = '1';
    try {
        const { stdout, stderr } = await captured(fn);
        const envelopes = stderr.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));
        const last = envelopes.at(-1);
        if (last === undefined) throw new Error(`no JSON envelope on stderr:\n${stderr}`);
        return { envelope: JSON.parse(last) as Record<string, unknown>, stdout };
    } finally {
        if (prev === undefined) delete process.env['PDFNATIVE_JSON'];
        else process.env['PDFNATIVE_JSON'] = prev;
    }
}

/** Render `doc` (DocumentParams or PdfParams) to a temp PDF with extra argv; returns the output path and bytes. */
export async function renderTo(
    tmp: TempFiles,
    doc: unknown,
    argv: readonly string[] = [],
    name = 'out.pdf',
): Promise<{ output: string; bytes: Buffer; stderr: string }> {
    const input = await tmp.json('in.json', doc);
    const output = tmp.path(name);
    const { stderr } = await captured(() => render(parseArgs(['--input', input, '--output', output, ...argv])));
    const bytes = await fs.readFile(output);
    return { output, bytes, stderr };
}

/** Render under --json: the status envelope (diagnostics included) and the bytes written. */
export async function renderJson(
    tmp: TempFiles,
    doc: unknown,
    argv: readonly string[] = [],
): Promise<{ envelope: Record<string, unknown>; bytes: Buffer; output: string }> {
    const input = await tmp.json('in.json', doc);
    const output = tmp.path('out.pdf');
    const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, ...argv])));
    return { envelope, bytes: await fs.readFile(output), output };
}

/** The diagnostic codes an envelope carries (empty when the field is absent). */
export function diagnosticCodes(envelope: Record<string, unknown>): string[] {
    const list = (envelope['diagnostics'] ?? []) as { code: string }[];
    return list.map((d) => d.code);
}

export interface LaidOutBlock { readonly type: string; readonly page: number; readonly top: number; readonly height: number }
export interface LayoutReport {
    readonly totalPages: number;
    readonly pages: readonly { readonly index: number; readonly blocks: readonly LaidOutBlock[] }[];
}

/**
 * `render --inspect-layout` written through --output (never stdout: under
 * `captured()` the mocked stream never calls the write callback back).
 */
export async function inspectLayoutTo(tmp: TempFiles, doc: unknown, argv: readonly string[] = []): Promise<LayoutReport> {
    const input = await tmp.json('layout-in.json', doc);
    const output = tmp.path('layout.json');
    await captured(() => render(parseArgs(['--input', input, '--output', output, '--inspect-layout', ...argv])));
    return JSON.parse(await fs.readFile(output, 'utf8')) as LayoutReport;
}

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
/** The file as a latin1 string — one char per byte, for operator and dictionary probes. */
export const latin1 = (b: Uint8Array): string => Buffer.from(b).toString('latin1');
export const pageCount = (bytes: Uint8Array): number => openPdf(new Uint8Array(bytes)).pageCount;

/** Assert `fn` rejects with a CliError of this exit code (and stable code / message fragment). */
export async function expectCliError(fn: () => Promise<unknown>, exitCode: number, code?: string, contains?: string): Promise<void> {
    try {
        await fn();
        expect.unreachable('expected a CliError');
    } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        const err = e as CliError;
        expect(err.exitCode).toBe(exitCode);
        if (code !== undefined) expect(err.code).toBe(code);
        if (contains !== undefined) expect(err.message).toContain(contains);
    }
}

/** The document every v1.5.0 test starts from: one heading, one paragraph. */
export const MINIMAL_DOC = {
    title: 'Test Document',
    blocks: [
        { type: 'heading', text: 'Heading', level: 1 },
        { type: 'paragraph', text: 'Hello world, this is a paragraph of body text.' },
    ],
};
