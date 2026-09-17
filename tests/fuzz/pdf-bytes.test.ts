// Hostile PDF bytes through the read commands (inspect, extract-text,
// merge): an xref /Prev chain past MAX_XREF_CHAIN, a /Prev cycle, nesting
// past MAX_PARSE_DEPTH, an inflate bomb under --max-inflate-size and forty
// random mutations of a valid file all end in a CliError with a stable
// code — never a RangeError, never a hang. The engine's own limits are
// exercised here through the CLI, the untrusted-input boundary its fuzz
// tests never cross.

import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from '../../src/commands/inspect.js';
import { extractTextCmd as extractText } from '../../src/commands/extract-text.js';
import { merge } from '../../src/commands/merge.js';
import { parseArgs } from '../../src/utils/args.js';
import { ErrorCode } from '../../src/utils/error.js';
import { MAX_XREF_CHAIN, MAX_PARSE_DEPTH, setMaxInflateOutputSize, DEFAULT_MAX_INFLATE_OUTPUT } from '../../src/core-bridge/index.js';
import { captured } from '../helpers/cli-harness.js';
import {
    forEachCaseAsync, onlyCliErrorAsync, assertPrototypeClean, mutatePdf, minimalPdf,
    buildChainedXrefPdf, buildCyclicXrefPdf, buildDeepNestingPdf, buildFlatePdf, textBombPayload,
} from '../helpers/fuzz.js';

const dir = mkdtempSync(join(tmpdir(), 'pdfcli-fuzz-pdf-'));
afterAll(() => { assertPrototypeClean(); rmSync(dir, { recursive: true, force: true }); });
afterEach(() => { vi.restoreAllMocks(); setMaxInflateOutputSize(DEFAULT_MAX_INFLATE_OUTPUT); });

const READ_CODES = [ErrorCode.PARSE, ErrorCode.PASSWORD, ErrorCode.UNSUPPORTED, ErrorCode.INPUT, ErrorCode.USAGE];

function file(name: string, bytes: Uint8Array): string {
    const p = join(dir, name);
    writeFileSync(p, bytes);
    return p;
}

const inspectFile = (p: string): Promise<unknown> => captured(() => inspect(parseArgs(['--input', p, '--format', 'json'])));
const extractFile = (p: string): Promise<unknown> => captured(() => extractText(parseArgs(['--input', p])));
const mergeFiles = (a: string, b: string, out: string): Promise<unknown> => captured(() => merge(parseArgs([a, b, '--output', out])));

describe('fuzz: PDF bytes through the read commands', { timeout: 60_000 }, () => {
    let valid = '';
    beforeAll(() => { valid = file('valid.pdf', minimalPdf()); });

    it('the engine exposes its two parser limits', () => {
        expect(Number.isInteger(MAX_XREF_CHAIN) && MAX_XREF_CHAIN > 0).toBe(true);
        expect(Number.isInteger(MAX_PARSE_DEPTH) && MAX_PARSE_DEPTH > 0).toBe(true);
    });

    it('a /Prev chain just below the limit is read; past the limit inspect answers E_PARSE', async () => {
        const below = file('chain-ok.pdf', buildChainedXrefPdf(Math.min(10, MAX_XREF_CHAIN - 1)));
        expect((await onlyCliErrorAsync(() => inspectFile(below), READ_CODES)).outcome).toBe('ok');
        const past = file('chain-bad.pdf', buildChainedXrefPdf(MAX_XREF_CHAIN + 5));
        const r = await onlyCliErrorAsync(() => inspectFile(past), [ErrorCode.PARSE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/Prev chain|maximum depth|depth/i);
    });

    it('a self-referential /Prev is E_PARSE (cycle), not a hang', async () => {
        const p = file('cycle.pdf', buildCyclicXrefPdf());
        const r = await onlyCliErrorAsync(() => inspectFile(p), [ErrorCode.PARSE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/cycle/i);
    });

    it.each([
        ['arrays', MAX_PARSE_DEPTH + 50, 'array'],
        ['dictionaries', MAX_PARSE_DEPTH + 10, 'dict'],
        ['10 000 arrays', 10_000, 'array'],
    ] as const)('a catalog nesting %s past MAX_PARSE_DEPTH is E_PARSE, never a stack overflow', async (_label, depth, kind) => {
        const p = file(`deep-${kind}-${depth}.pdf`, buildDeepNestingPdf(depth, kind));
        const r = await onlyCliErrorAsync(() => inspectFile(p), [ErrorCode.PARSE]);
        expect(r.outcome).toBe('error');
        if (r.outcome === 'error') expect(r.error.message).toMatch(/depth|nested|recursion/i);
    });

    it('nesting below the cap is read normally', async () => {
        const p = file('deep-ok.pdf', buildDeepNestingPdf(Math.min(100, MAX_PARSE_DEPTH - 1), 'array'));
        expect((await onlyCliErrorAsync(() => inspectFile(p), READ_CODES)).outcome).toBe('ok');
    });

    it('an inflate bomb under --max-inflate-size is never materialised (the engine drops the stream); above the cap its text comes back', async () => {
        // ~1 MiB of text operators deflating to ~3 KB. Under the cap the
        // engine's inflate throws "potential zip bomb" and extractText drops
        // the stream (audit V-01: silently — the command answers ok with no
        // text; surfacing it is upstream work). What the CLI guarantees is
        // the bound itself: nothing past the cap is ever allocated.
        const p = file('bomb.pdf', buildFlatePdf(textBombPayload(30_000)));
        setMaxInflateOutputSize(1024);
        const capped = await onlyCliErrorAsync(() => captured(() => extractText(parseArgs(['--input', p]))), READ_CODES);
        expect(capped.outcome).toBe('ok');
        if (capped.outcome === 'ok') expect(capped.value.stdout).not.toContain('bomb');
        setMaxInflateOutputSize(2 * 1024 * 1024);
        const open = await onlyCliErrorAsync(() => captured(() => extractText(parseArgs(['--input', p]))), READ_CODES);
        expect(open.outcome).toBe('ok');
        if (open.outcome === 'ok') expect(open.value.stdout).toContain('bomb');
        // inspect never touches content streams: identical under both caps.
        setMaxInflateOutputSize(1024);
        expect((await onlyCliErrorAsync(() => inspectFile(p), READ_CODES)).outcome).toBe('ok');
    });

    it('40 random mutations of a valid PDF end in a value or a stable code for inspect, extract-text and merge', async () => {
        await forEachCaseAsync('mutatePdf', 40, async (rng, i) => {
            const mutated = file(`m${i}.pdf`, mutatePdf(minimalPdf(), rng, 1 + rng.int(12)));
            await onlyCliErrorAsync(() => inspectFile(mutated), READ_CODES);
            await onlyCliErrorAsync(() => extractFile(mutated), READ_CODES);
            await onlyCliErrorAsync(() => mergeFiles(valid, mutated, join(dir, `merged${i}.pdf`)), READ_CODES);
        });
    });
});
