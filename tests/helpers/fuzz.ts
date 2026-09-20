// Hostile-input helpers for tests/fuzz/ (v1.5.0, ported in spirit from
// pdfnative's tests/fuzzing/): a seeded PRNG so every run is reproducible,
// case runners that name the failing iteration and its seed, generators for
// argv tokens / JSON / page specs / date strings, PDF byte builders that sit
// just past the engine's parser limits, and the one invariant every suite
// asserts — the CLI answers hostile input with a CliError carrying one of
// the 12 stable codes (or a value), never a RangeError, a TypeError, a hang
// or a polluted Object.prototype. No Math.random, no Date.now, no fast-check.

import { deflateSync } from 'node:zlib';
import { CliError, ErrorCode, type ErrorCodeValue } from '../../src/utils/error.js';
import { buildDocumentPDFBytes } from '../../src/core-bridge/index.js';

// ── PRNG ─────────────────────────────────────────────────────────────

export const DEFAULT_SEED = 0x5eed1234;

export interface Rng {
    /** Uniform float in [0, 1). */
    readonly next: () => number;
    /** Uniform integer in [0, maxExclusive). */
    readonly int: (maxExclusive: number) => number;
    readonly pick: <T>(items: readonly T[]) => T;
    readonly chance: (probability: number) => boolean;
}

/** mulberry32 — 32-bit state, good enough for test-case generation and fully deterministic. */
export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    const next = (): number => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: (n) => Math.floor(next() * n),
        pick: (items) => items[Math.floor(next() * items.length)] as never,
        chance: (p) => next() < p,
    };
}

function caseSeed(seed: number, i: number): number {
    return (seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
}

function caseFailure(label: string, i: number, seed: number, e: unknown): Error {
    const detail = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
    return new Error(`${label}: iteration ${i} (seed 0x${seed.toString(16)}) — ${detail}`, { cause: e });
}

/** Run `fn` `count` times with an independent, reproducible RNG per iteration. */
export function forEachCase(label: string, count: number, fn: (rng: Rng, i: number) => void, seed = DEFAULT_SEED): void {
    for (let i = 0; i < count; i++) {
        const s = caseSeed(seed, i);
        try {
            fn(mulberry32(s), i);
        } catch (e) {
            throw caseFailure(label, i, s, e);
        }
    }
}

export async function forEachCaseAsync(label: string, count: number, fn: (rng: Rng, i: number) => Promise<void>, seed = DEFAULT_SEED): Promise<void> {
    for (let i = 0; i < count; i++) {
        const s = caseSeed(seed, i);
        try {
            await fn(mulberry32(s), i);
        } catch (e) {
            throw caseFailure(label, i, s, e);
        }
    }
}

// ── The invariant ────────────────────────────────────────────────────

export const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

export type Outcome<T> = { readonly outcome: 'ok'; readonly value: T } | { readonly outcome: 'error'; readonly error: CliError };

function assertCliError(e: unknown, codes: readonly ErrorCodeValue[] | undefined): asserts e is CliError {
    if (!(e instanceof CliError)) {
        const detail = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
        throw new Error(`threw something that is not a CliError — ${detail}`, { cause: e });
    }
    if (!KNOWN_CODES.has(e.code)) throw new Error(`CliError with an unknown code "${e.code}": ${e.message}`);
    if (e.exitCode !== 1 && e.exitCode !== 2) throw new Error(`CliError with exit code ${e.exitCode}: ${e.message}`);
    if (codes !== undefined && !codes.includes(e.code)) {
        throw new Error(`CliError ${e.code} is not one of ${codes.join(', ')}: ${e.message}`);
    }
}

/** `fn` either returns a value or throws a CliError (optionally one of `codes`). */
export function onlyCliError<T>(fn: () => T, codes?: readonly ErrorCodeValue[]): Outcome<T> {
    try {
        return { outcome: 'ok', value: fn() };
    } catch (e) {
        assertCliError(e, codes);
        return { outcome: 'error', error: e };
    }
}

export async function onlyCliErrorAsync<T>(fn: () => Promise<T>, codes?: readonly ErrorCodeValue[]): Promise<Outcome<T>> {
    try {
        return { outcome: 'ok', value: await fn() };
    } catch (e) {
        assertCliError(e, codes);
        return { outcome: 'error', error: e };
    }
}

// ── Object.prototype guard ───────────────────────────────────────────

const PROTOTYPE_KEYS_AT_IMPORT: readonly string[] = Object.getOwnPropertyNames(Object.prototype).sort();

/** Object.prototype carries exactly the own properties it had when the suite loaded. */
export function assertPrototypeClean(): void {
    const now = Object.getOwnPropertyNames(Object.prototype).sort();
    const added = now.filter((k) => !PROTOTYPE_KEYS_AT_IMPORT.includes(k));
    if (added.length > 0) throw new Error(`Object.prototype was polluted with: ${added.join(', ')}`);
    const probe = {} as Record<string, unknown>;
    if (probe['polluted'] !== undefined || probe['fuzz'] !== undefined) throw new Error('Object.prototype carries a polluted value');
}

// ── Generators ───────────────────────────────────────────────────────

export const HOSTILE_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

const ATOMS: readonly string[] = [
    '', ' ', '  ', '-', '--', '=', ',', '.', '..', '../', '/', '\\', 'a', 'Z', 'x', '0', '9', '42', '1-3', '3-1', '-1',
    '{', '}', '[', ']', '"', '\'', '\n', '\r', '\t', '\0', '', 'é', 'ß', '中', '😀', ' ', '﻿', '​',
    '__proto__', 'constructor', 'prototype', 'toString', 'NaN', 'Infinity', '-0', '1e309', '0x1f', 'true', 'false',
    'null', 'undefined', '%PDF', 'obj', 'endobj', '<<', '>>', 'stream', '#', '$', '&', '|', ';', '`', '${x}', '%s', '%n',
    'input', 'output', 'json', 'dry-run', 'render', 'pages', 'a'.repeat(300),
];

/** A string built from 0–`maxParts` hostile atoms. */
export function randomToken(rng: Rng, maxParts = 6): string {
    let s = '';
    const n = rng.int(maxParts + 1);
    for (let i = 0; i < n; i++) s += rng.pick(ATOMS);
    return s;
}

const KEYS: readonly string[] = ['a', 'b', 'layout', 'typography', 'outputIntent', 'iccProfile', 'creationDate', 'attachments', 'data', 'blocks', 'type', 'text', 'print', 'pdfx', 'tagged', 'version', 'tasks', 'id', 'command', 'flags', 'input', 'output', 'quiet', 'render', 'toString', 'valueOf', 'hasOwnProperty'];

/** A random JSON value up to `depth` levels deep; objects may carry hostile keys. */
export function randomJson(rng: Rng, depth = 4, hostileKeys = true): unknown {
    const kind = rng.int(depth <= 0 ? 5 : 7);
    switch (kind) {
        case 0: return null;
        case 1: return rng.chance(0.5);
        case 2: return rng.pick([0, -0, 1, -1, 42, 1e308, -1e308, 2 ** 53, 0.5, 1e-7, 65535, 4294967296]);
        case 3: return randomToken(rng);
        case 4: return rng.pick(['2026-01-01T00:00:00Z', 'pdfx4', 'pdfa2b', 'fr', 'exact', '1,3-5', 'auto', '']);
        case 5: {
            const arr: unknown[] = [];
            const n = rng.int(6);
            for (let i = 0; i < n; i++) arr.push(randomJson(rng, depth - 1, hostileKeys));
            return arr;
        }
        default: {
            const obj: Record<string, unknown> = {};
            const n = rng.int(6);
            for (let i = 0; i < n; i++) {
                const key = hostileKeys && rng.chance(0.25) ? rng.pick(HOSTILE_KEYS) : rng.pick(KEYS);
                // Own-property definition, exactly what JSON.parse produces for `__proto__`.
                Object.defineProperty(obj, key, { value: randomJson(rng, depth - 1, hostileKeys), enumerable: true, writable: true, configurable: true });
            }
            return obj;
        }
    }
}

/** `depth` nested arrays or objects, built iteratively (no recursion) so 10 000 levels is cheap. */
export function deepNested(depth: number, kind: 'array' | 'object', leaf: unknown = 1): unknown {
    let v: unknown = leaf;
    for (let i = 0; i < depth; i++) v = kind === 'array' ? [v] : { k: v };
    return v;
}

const PAGE_PIECES: readonly string[] = ['1', '2', '3', '10', '0', '-1', '1-3', '3-1', '1-', '-3', '1--3', 'a', '1.5', '1e2', '٣', '1-9999999999', ' 1 ', '1 - 3', '', '00', '+2', '2-2', '9007199254740993'];

export function randomPageSpec(rng: Rng): string {
    const n = rng.int(6);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(rng.pick(PAGE_PIECES));
    return parts.join(rng.pick([',', ', ', ',,', ';']));
}

const ISOISH: readonly string[] = [
    '2026-01-01T00:00:00Z', '2026-01-01', '2026-13-40', '', '   ', 'now', '1767225600', '0', '-1', '1e5', '+1',
    '2026-01-01T00:00:00+99:00', '9999-12-31T23:59:59Z', '0000-00-00', '2026-02-30T00:00:00Z',
    '2026-01-01T00:00:00.000000000Z', '275760-09-13T00:00:00Z', 'Infinity', 'NaN', '1767225600000', '12345678901234',
    '2026-01-01T00:00:00Z\n', ' 2026-01-01', 'Mon, 01 Jan 2026 00:00:00 GMT',
];

export function randomIsoish(rng: Rng): string {
    return rng.chance(0.7) ? rng.pick(ISOISH) : randomToken(rng, 4);
}

// ── PDF byte builders ────────────────────────────────────────────────

const ENC = new TextEncoder();

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
}

/** N chained xref tables, each `/Prev`-linked to the previous (pdfnative tests/fuzzing/xref-chain). */
export function buildChainedXrefPdf(chainLength: number): Uint8Array {
    const parts: Uint8Array[] = [];
    let offset = 0;
    const push = (s: string): number => { const b = ENC.encode(s); parts.push(b); const at = offset; offset += b.length; return at; };
    push('%PDF-1.7\n%binary\n');
    const obj1 = push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    const obj2 = push('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
    const xrefOffsets: number[] = [];
    for (let i = 0; i < chainLength; i++) {
        const prev = i === 0 ? '' : ` /Prev ${xrefOffsets[i - 1]}`;
        xrefOffsets.push(offset);
        push(`xref\n0 3\n0000000000 65535 f \n${String(obj1).padStart(10, '0')} 00000 n \n${String(obj2).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R${prev} >>\n`);
    }
    push(`startxref\n${xrefOffsets[xrefOffsets.length - 1]}\n%%EOF\n`);
    return concatBytes(parts);
}

/** An xref whose `/Prev` points back at itself. */
export function buildCyclicXrefPdf(): Uint8Array {
    const header = ENC.encode('%PDF-1.7\n%binary\n');
    const obj1 = ENC.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    const obj2 = ENC.encode('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
    const o1 = header.length;
    const o2 = o1 + obj1.length;
    const xrefAt = o2 + obj2.length;
    const xref = ENC.encode(`xref\n0 3\n0000000000 65535 f \n${String(o1).padStart(10, '0')} 00000 n \n${String(o2).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R /Prev ${xrefAt} >>\n`);
    return concatBytes([header, obj1, obj2, xref, ENC.encode(`startxref\n${xrefAt}\n%%EOF\n`)]);
}

/** A catalog carrying a value nested `depth` levels deep (arrays or dictionaries). */
export function buildDeepNestingPdf(depth: number, kind: 'array' | 'dict'): Uint8Array {
    const nested = kind === 'array'
        ? '['.repeat(depth) + '1' + ']'.repeat(depth)
        : '<< /K '.repeat(depth) + '1' + ' >>'.repeat(depth);
    return buildObjectsPdf([
        `<< /Type /Catalog /Pages 2 0 R /Nested ${nested} >>`,
        '<< /Type /Pages /Kids [] /Count 0 >>',
    ]);
}

/** One page (Helvetica as /F1) whose content stream is `payload` deflated (FlateDecode). */
export function buildFlatePdf(payload: Uint8Array): Uint8Array {
    const deflated = new Uint8Array(deflateSync(payload));
    const streamHead = ENC.encode(`<< /Length ${deflated.length} /Filter /FlateDecode >>\nstream\n`);
    const streamTail = ENC.encode('\nendstream');
    return buildObjectsPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>',
        concatBytes([streamHead, deflated, streamTail]),
    ]);
}

/** A content stream of `repeat` text-showing operators — deflates ~340:1, the shape of an inflate bomb that carries text. */
export function textBombPayload(repeat: number): Uint8Array {
    return ENC.encode('BT /F1 12 Tf 10 100 Td (bomb) Tj ET\n'.repeat(repeat));
}

export interface ObjectsPdfOptions {
    /** Header line (default `%PDF-1.7`). */
    readonly header?: string;
    /** Add a trailer `/ID` (PDF/X requires one). */
    readonly id?: boolean;
}

/** Assemble numbered objects (1-based) with a correct xref table; object 1 is the catalog. */
export function buildObjectsPdf(objects: readonly (string | Uint8Array)[], opts: ObjectsPdfOptions = {}): Uint8Array {
    const parts: Uint8Array[] = [ENC.encode(`${opts.header ?? '%PDF-1.7'}\n%\xe2\xe3\xcf\xd3\n`)];
    let offset = parts[0]!.length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
        offsets.push(offset);
        const chunk = concatBytes([ENC.encode(`${i + 1} 0 obj\n`), typeof body === 'string' ? ENC.encode(body) : body, ENC.encode('\nendobj\n')]);
        parts.push(chunk);
        offset += chunk.length;
    });
    const xrefAt = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${opts.id === true ? ' /ID [<01> <01>]' : ''} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    parts.push(ENC.encode(xref));
    return concatBytes(parts);
}

/**
 * Replace the first occurrence of `from` with `to` (same byte length, latin1)
 * so every xref offset stays valid. Throws when the marker is absent: a probe
 * that silently patches nothing would prove nothing.
 */
export function patchBytes(bytes: Uint8Array, from: string, to: string): Uint8Array {
    if (from.length !== to.length) throw new Error(`patchBytes: "${from}" and "${to}" differ in length`);
    const at = Buffer.from(bytes).indexOf(Buffer.from(from, 'latin1'));
    if (at === -1) throw new Error(`patchBytes: marker "${from}" not found`);
    const out = Uint8Array.from(bytes);
    out.set(Buffer.from(to, 'latin1'), at);
    return out;
}

let minimal: Uint8Array | null = null;
/** A small valid PDF rendered by the engine with a pinned date (cached per process). */
export function minimalPdf(): Uint8Array {
    if (minimal === null) {
        minimal = buildDocumentPDFBytes(
            { title: 'Fuzz', blocks: [{ type: 'paragraph', text: 'Fuzz seed document with a little text on one page.' }] },
            { creationDate: new Date('2026-01-01T00:00:00Z') },
        );
    }
    return minimal;
}

/** Apply `count` random byte-level mutations: flips, deletions, duplications, insertions, truncation, keyword damage. */
export function mutatePdf(source: Uint8Array, rng: Rng, count = 8): Uint8Array {
    let bytes: Uint8Array = Uint8Array.from(source);
    for (let m = 0; m < count && bytes.length > 0; m++) {
        const at = rng.int(bytes.length);
        const len = 1 + rng.int(Math.min(64, bytes.length - at));
        switch (rng.int(7)) {
            case 0: bytes[at] = rng.int(256); break;
            case 1: bytes = concatBytes([bytes.subarray(0, at), bytes.subarray(at + len)]); break;
            case 2: bytes = concatBytes([bytes.subarray(0, at + len), bytes.subarray(at, at + len), bytes.subarray(at + len)]); break;
            case 3: bytes = concatBytes([bytes.subarray(0, at), ENC.encode(randomToken(rng, 3)), bytes.subarray(at)]); break;
            case 4: bytes = bytes.subarray(0, Math.max(1, at)); break;
            case 5: bytes.fill(rng.pick([0, 0x20, 0xff]), at, at + len); break;
            default: {
                const text = new TextDecoder('latin1').decode(bytes);
                const damaged = text.replace(rng.pick(['xref', 'trailer', 'startxref', 'endobj', 'stream', '/Root', '/Length', '/Size']), (w) => rng.pick(['', w.slice(1), `${w}${w}`, 'xxxx']));
                bytes = Uint8Array.from(damaged, (c) => c.charCodeAt(0) & 0xff);
            }
        }
    }
    return bytes;
}
