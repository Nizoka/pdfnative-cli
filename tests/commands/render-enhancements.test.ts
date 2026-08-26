import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as zlib from 'node:zlib';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';

const tmp: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `render12-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function writeDoc(blocks: unknown): Promise<string> {
    const p = tmpPath('in.json');
    await fs.writeFile(p, JSON.stringify({ blocks }), 'utf8');
    return p;
}

function captureStdout(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((...args: unknown[]) => {
        const chunk = args[0];
        calls.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
        // writeOutput() to stdout uses the callback form and awaits it — invoke
        // any trailing callback so the write promise resolves.
        const cb = args.find((a) => typeof a === 'function');
        if (cb !== undefined) (cb as (e?: Error) => void)();
        return true;
    }) as never);
    return { calls, restore: () => spy.mockRestore() };
}

describe('render --outline', () => {
    it('renders bookmarks from auto', async () => {
        const input = await writeDoc([
            { type: 'heading', text: 'Chapter 1', level: 1 },
            { type: 'paragraph', text: 'x' },
            { type: 'heading', text: 'Chapter 2', level: 1 },
        ]);
        const out = tmpPath('out.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--outline', 'auto']));
        const bytes = await fs.readFile(out);
        expect(bytes.toString('latin1')).toContain('/Outlines');
    });

    it('renders bookmarks from a JSON outline file', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const outline = tmpPath('outline.json');
        await fs.writeFile(outline, JSON.stringify([{ title: 'Top', pageIndex: 0 }]), 'utf8');
        const out = tmpPath('out2.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--outline', outline]));
        expect((await fs.readFile(out)).toString('latin1')).toContain('/Outlines');
    });

    it('rejects a non-array outline file', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const outline = tmpPath('bad.json');
        await fs.writeFile(outline, JSON.stringify({ nope: true }), 'utf8');
        await expect(
            render(parseArgs(['--input', input, '--output', tmpPath('x.pdf'), '--outline', outline])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --inspect-layout', () => {
    it('emits a LayoutInspection JSON report instead of a PDF', async () => {
        const input = await writeDoc([
            { type: 'heading', text: 'H', level: 1 },
            { type: 'paragraph', text: 'body' },
        ]);
        const out = captureStdout();
        await render(parseArgs(['--input', input, '--inspect-layout']));
        out.restore();
        const report = JSON.parse(out.calls.join(''));
        expect(report.totalPages).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(report.pages)).toBe(true);
        expect(report.pages[0].blocks[0]).toHaveProperty('type');
    });

    it('is rejected for the table variant', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        await expect(
            render(parseArgs(['--input', input, '--inspect-layout', '--variant', 'table'])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --debug-layout', () => {
    it('renders with a debug overlay (bare flag)', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const out = tmpPath('dbg.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--debug-layout']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('accepts a box selector list', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        const out = tmpPath('dbg2.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--debug-layout', 'margins,cells']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects an unknown debug box token', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'body' }]);
        await expect(
            render(parseArgs(['--input', input, '--output', tmpPath('x.pdf'), '--debug-layout', 'bogus'])),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe('render --font math', () => {
    it('registers the math font and renders math symbols', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'Sum: ∑ ∀ ∈ ℝ ⇒ ∫' }]);
        const out = tmpPath('math.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--font', 'math']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// pdfnative 1.7.0 — print production, viewer prefs, metadata, outputIntent,
// --strict + diagnostics, image-block resolution, --chunk-size.
// ─────────────────────────────────────────────────────────────────────────

async function writeLayout(layout: unknown): Promise<string> {
    const p = tmpPath('layout.json');
    await fs.writeFile(p, JSON.stringify(layout), 'utf8');
    return p;
}

function captureStderr(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
        lines.push(String(chunk));
        return true;
    }) as never);
    return { lines, restore: () => spy.mockRestore() };
}

// ── Minimal deterministic 1×1 PNG built in-test (no fixture files) ───────

function crc32(buf: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) {
            crc = (crc & 1) !== 0 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/** 1×1 red pixel, 8-bit RGB, single IDAT — a fully valid minimal PNG. */
function makePng1x1(): Buffer {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0); // width
    ihdr.writeUInt32BE(1, 4); // height
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour RGB
    const idat = zlib.deflateSync(Buffer.from([0, 255, 0, 0])); // filter 0 + red px
    return Buffer.concat([
        sig,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', new Uint8Array(0)),
    ]);
}

describe('render print production (layout.print, pdfnative 1.7.0)', () => {
    it('print.bleed emits /TrimBox and /BleedBox page boxes', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'bleed test' }]);
        const layout = await writeLayout({ print: { bleed: 9 } });
        const out = tmpPath('bleed.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--layout', layout]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('/TrimBox');
        expect(raw).toContain('/BleedBox');
    });

    it('print.marks with an explicit trimBox renders crop marks', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'marks test' }]);
        const layout = await writeLayout({
            print: { trimBox: [30, 30, 565.28, 811.89], marks: true },
        });
        const out = tmpPath('marks.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--layout', layout]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('/TrimBox');
        expect(raw.startsWith('%PDF')).toBe(true);
    });

    it('print.userUnit emits /UserUnit', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'banner' }]);
        const layout = await writeLayout({ print: { userUnit: 2 } });
        const out = tmpPath('userunit.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--layout', layout]));
        expect((await fs.readFile(out)).toString('latin1')).toContain('/UserUnit');
    });

    it('print.userUnit under pdfa1b → CliError E_INPUT (exit 1)', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        const layout = await writeLayout({ print: { userUnit: 2 } });
        const stderr = captureStderr(); // swallow the PDF/A no-fontEntries warning
        try {
            const err = await render(parseArgs([
                '--input', input, '--output', tmpPath('x.pdf'),
                '--layout', layout, '--tagged', 'pdfa1b',
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(1);
            expect((err as CliError).code).toBe(ErrorCode.INPUT);
            expect((err as CliError).message).toContain('userUnit');
        } finally {
            stderr.restore();
        }
    });
});

describe('render viewer preferences (1.7.0 print-dialog keys)', () => {
    it('duplex / numCopies / printPageRange / pickTrayByPDFSize reach the catalog', async () => {
        const input = await writeDoc([
            { type: 'paragraph', text: 'page 1' },
            { type: 'pageBreak' },
            { type: 'paragraph', text: 'page 2' },
        ]);
        const layout = await writeLayout({
            viewerPreferences: {
                duplex: 'duplexFlipLongEdge',
                numCopies: 3,
                printPageRange: [[1, 2]],
                pickTrayByPDFSize: true,
            },
        });
        const out = tmpPath('viewerprefs.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--layout', layout]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('/Duplex /DuplexFlipLongEdge');
        expect(raw).toContain('/NumCopies 3');
        expect(raw).toContain('/PrintPageRange');
        expect(raw).toContain('/PickTrayByPDFSize true');
    });
});

describe('render metadata (DocumentParams.metadata, 1.7.0 trapped)', () => {
    it('author / subject / keywords / trapped reach /Info', async () => {
        const input = tmpPath('meta.json');
        await fs.writeFile(input, JSON.stringify({
            blocks: [{ type: 'paragraph', text: 'meta test' }],
            metadata: {
                author: 'Meta Author',
                subject: 'Meta Subject',
                keywords: 'alpha, beta',
                trapped: 'True',
            },
        }), 'utf8');
        const out = tmpPath('meta.pdf');
        await render(parseArgs(['--input', input, '--output', out]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('Meta Author');
        expect(raw).toContain('Meta Subject');
        expect(raw).toContain('alpha, beta');
        expect(raw).toContain('/Trapped /True');
    });
});

describe('render outputIntent (custom ICC profile via --layout)', () => {
    it('embeds a caller-supplied RGB profile under a tagged mode', async () => {
        // Minimal fake ICC profile: pdfnative validates a 128-byte header and
        // an "RGB " data colour space at bytes 16–19, then embeds the bytes.
        const icc = new Uint8Array(128);
        icc[16] = 0x52; icc[17] = 0x47; icc[18] = 0x42; icc[19] = 0x20; // "RGB "
        const input = await writeDoc([{ type: 'paragraph', text: 'intent' }]);
        const layout = await writeLayout({
            outputIntent: {
                iccProfile: Array.from(icc),
                outputConditionIdentifier: 'Fake RGB Test Profile',
            },
        });
        const out = tmpPath('intent.pdf');
        const stderr = captureStderr(); // swallow the PDF/A no-fontEntries warning
        try {
            await render(parseArgs([
                '--input', input, '--output', out,
                '--layout', layout, '--tagged', 'pdfa2b',
            ]));
        } finally {
            stderr.restore();
        }
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('Fake RGB Test Profile');
    });
});

describe('render --strict + PDF/A diagnostics (pdfnative 1.7.0)', () => {
    const origJson = process.env['PDFNATIVE_JSON'];

    afterEach(() => {
        if (origJson === undefined) delete process.env['PDFNATIVE_JSON'];
        else process.env['PDFNATIVE_JSON'] = origJson;
    });

    it('--strict succeeds on a document with no conformance findings', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'clean' }]);
        const out = tmpPath('strict-ok.pdf');
        await render(parseArgs(['--input', input, '--output', out, '--strict']));
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('--strict escalates a PDF/A violation to E_CHECK_FAILED before any output', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        const out = tmpPath('strict-fail.pdf');
        // pdfa2b with no fontEntries → PDFA_NO_FONT_ENTRIES, thrown under strict.
        const err = await render(parseArgs([
            '--input', input, '--output', out, '--tagged', 'pdfa2b', '--strict',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).code).toBe(ErrorCode.CHECK_FAILED);
        expect((err as CliError).message).toContain('PDF/A');
        await expect(fs.stat(out)).rejects.toThrow(); // no partial output
    });

    it('without --strict the violation is a stderr warning and the PDF renders', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        const out = tmpPath('warn.pdf');
        const stderr = captureStderr();
        try {
            await render(parseArgs(['--input', input, '--output', out, '--tagged', 'pdfa2b']));
        } finally {
            stderr.restore();
        }
        const warnings = stderr.lines.filter((l) => l.startsWith('warning: ['));
        expect(warnings.some((l) => l.includes('[PDFA_NO_FONT_ENTRIES]'))).toBe(true);
        expect((await fs.readFile(out)).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('--json status envelope carries an additive diagnostics array', async () => {
        process.env['PDFNATIVE_JSON'] = '1';
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        const out = tmpPath('diag.pdf');
        const stderr = captureStderr();
        try {
            await render(parseArgs(['--input', input, '--output', out, '--tagged', 'pdfa2b']));
        } finally {
            stderr.restore();
        }
        const envelopes = stderr.lines
            .map((l) => l.trim())
            .filter((l) => l.startsWith('{'))
            .map((l) => JSON.parse(l) as Record<string, unknown>);
        const status = envelopes.at(-1);
        expect(status).toMatchObject({ ok: true, command: 'render' });
        const diags = status?.diagnostics as readonly Record<string, unknown>[];
        expect(Array.isArray(diags)).toBe(true);
        expect(diags[0]).toMatchObject({
            code: 'PDFA_NO_FONT_ENTRIES',
            severity: 'warning',
        });
        expect(typeof diags[0]?.message).toBe('string');
    });

    it('omits the diagnostics field when there are no findings', async () => {
        process.env['PDFNATIVE_JSON'] = '1';
        const input = await writeDoc([{ type: 'paragraph', text: 'clean' }]);
        const out = tmpPath('nodiag.pdf');
        const stderr = captureStderr();
        try {
            await render(parseArgs(['--input', input, '--output', out]));
        } finally {
            stderr.restore();
        }
        const status = stderr.lines
            .map((l) => l.trim())
            .filter((l) => l.startsWith('{'))
            .map((l) => JSON.parse(l) as Record<string, unknown>)
            .at(-1);
        expect(status).toMatchObject({ ok: true, command: 'render' });
        expect(status).not.toHaveProperty('diagnostics');
    });
});

describe('render image blocks — src / dataBase64 resolution', () => {
    it('renders a dataBase64 PNG payload as an image XObject', async () => {
        const b64 = makePng1x1().toString('base64');
        const input = await writeDoc([
            { type: 'paragraph', text: 'inline image' },
            { type: 'image', dataBase64: b64, width: 24, height: 24, alt: '1x1 red' },
        ]);
        const out = tmpPath('img-b64.pdf');
        await render(parseArgs(['--input', input, '--output', out]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw.startsWith('%PDF')).toBe(true);
        expect(raw).toContain('/XObject');
    });

    it('resolves a relative src against the --input file directory', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-img-src-'));
        tmp.push(dir);
        await fs.writeFile(path.join(dir, 'pixel.png'), makePng1x1());
        const input = path.join(dir, 'doc.json');
        await fs.writeFile(input, JSON.stringify({
            blocks: [{ type: 'image', src: 'pixel.png', width: 24, height: 24 }],
        }), 'utf8');
        const out = tmpPath('img-src.pdf');
        await render(parseArgs(['--input', input, '--output', out]));
        const raw = (await fs.readFile(out)).toString('latin1');
        expect(raw).toContain('/XObject');
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('revives a JSON number-array data payload', async () => {
        const input = await writeDoc([
            { type: 'image', data: Array.from(makePng1x1()), width: 24, height: 24 },
        ]);
        const out = tmpPath('img-arr.pdf');
        await render(parseArgs(['--input', input, '--output', out]));
        expect((await fs.readFile(out)).toString('latin1')).toContain('/XObject');
    });

    it('unreadable src → CliError E_IO (exit 1)', async () => {
        const input = await writeDoc([
            { type: 'image', src: 'definitely-not-here.png' },
        ]);
        const err = await render(parseArgs(['--input', input, '--output', tmpPath('x.pdf')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).code).toBe(ErrorCode.IO);
    });

    it('invalid base64 → CliError E_INPUT (exit 1)', async () => {
        const input = await writeDoc([
            { type: 'image', dataBase64: '@@not/base64@@' },
        ]);
        const err = await render(parseArgs(['--input', input, '--output', tmpPath('x.pdf')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).code).toBe(ErrorCode.INPUT);
    });

    it('src with path traversal is rejected', async () => {
        const input = await writeDoc([
            { type: 'image', src: '../../etc/secret.png' },
        ]);
        await expect(
            render(parseArgs(['--input', input, '--output', tmpPath('x.pdf')])),
        ).rejects.toThrowError(/traversal/i);
    });
});

describe('render --chunk-size', () => {
    it('--stream --chunk-size output is byte-identical to buffered output', async () => {
        const input = await writeDoc([
            { type: 'heading', text: 'Chunked', level: 1 },
            { type: 'paragraph', text: 'chunk-size parity test '.repeat(50) },
        ]);
        const buffered = tmpPath('buf.pdf');
        const chunked = tmpPath('chunked.pdf');
        await render(parseArgs(['--input', input, '--output', buffered]));
        await render(parseArgs([
            '--input', input, '--output', chunked, '--stream', '--chunk-size', '512',
        ]));
        const a = await fs.readFile(buffered);
        const b = await fs.readFile(chunked);
        expect(b.equals(a)).toBe(true);
    });

    it('rejects non-positive / non-integer values (exit 2)', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        for (const bad of ['0', '-1', 'abc', '2.5']) {
            const err = await render(parseArgs([
                '--input', input, '--output', '-', '--stream', '--chunk-size', bad,
            ])).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(2);
        }
    });

    it('rejects --chunk-size with --stream-page-by-page (exit 2)', async () => {
        const input = await writeDoc([{ type: 'paragraph', text: 'x' }]);
        const err = await render(parseArgs([
            '--input', input, '--output', '-', '--stream-page-by-page', '--chunk-size', '1024',
        ])).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(2);
    });
});
