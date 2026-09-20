// render: typography flags + layout.typography passthrough, CMYK colours,
// the 27-script allow-list, reproducible dates and the table-variant fonts
// (v1.5.0, pdfnative 1.8.0).

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { extractText, setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { TempFiles, MINIMAL_DOC, renderTo, withJsonEnvelope, sha256, pageCount } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    delete process.env['SOURCE_DATE_EPOCH'];
    await tmp.cleanup();
});

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(6);

function longDoc(sections: number, repeat = 1): { title: string; blocks: unknown[] } {
    const blocks: unknown[] = [];
    for (let i = 0; i < sections; i++) {
        blocks.push({ type: 'heading', text: `Section ${i + 1}`, level: 2 });
        blocks.push({ type: 'paragraph', text: LOREM.repeat(repeat), align: 'justify' });
    }
    return { title: 'Typography', blocks };
}

describe('render typography (layout.typography, pdfnative 1.8.0)', () => {
    it('--split-paragraphs lets paragraphs break across pages: never more pages than atomic paragraphs', async () => {
        // Twelve ~15-line paragraphs: at least one straddles a page boundary, so
        // the split layout differs from the atomic one (which moves it whole).
        const atomic = await renderTo(tmp, longDoc(12, 2), ['--font', 'latin', '--lang', 'latin', '--creation-date', '2026-01-01T00:00:00Z'], 'atomic.pdf');
        const split = await renderTo(tmp, longDoc(12, 2), ['--font', 'latin', '--lang', 'latin', '--split-paragraphs', '--creation-date', '2026-01-01T00:00:00Z'], 'split.pdf');
        expect(pageCount(split.bytes)).toBeLessThanOrEqual(pageCount(atomic.bytes));
        expect(sha256(split.bytes)).not.toBe(sha256(atomic.bytes));
    });

    it('layout.typography in the document JSON is forwarded (keepHeadingsWithNext true ≡ { minLines: 2 })', async () => {
        const a = await renderTo(tmp, { ...longDoc(6), layout: { typography: { splitParagraphs: true, keepHeadingsWithNext: true } } }, ['--creation-date', '2026-01-01T00:00:00Z'], 'a.pdf');
        const b = await renderTo(tmp, { ...longDoc(6), layout: { typography: { splitParagraphs: true, keepHeadingsWithNext: { minLines: 2 } } } }, ['--creation-date', '2026-01-01T00:00:00Z'], 'b.pdf');
        expect(sha256(a.bytes)).toBe(sha256(b.bytes));
    });

    it('a typography flag merges INTO the document\'s typography object instead of replacing it', async () => {
        const doc = { ...longDoc(6), layout: { typography: { splitParagraphs: true } } };
        const merged = await renderTo(tmp, doc, ['--keep-headings-with-next', '--creation-date', '2026-01-01T00:00:00Z'], 'merged.pdf');
        const explicit = await renderTo(tmp, { ...longDoc(6), layout: { typography: { splitParagraphs: true, keepHeadingsWithNext: true } } }, ['--creation-date', '2026-01-01T00:00:00Z'], 'explicit.pdf');
        expect(sha256(merged.bytes)).toBe(sha256(explicit.bytes));
    });

    it('--kerning needs a registered font: bytes differ with --font latin, identical without', async () => {
        const doc = { title: 'AVAWAY', blocks: [{ type: 'paragraph', text: 'AVAWAY To Ye WAVE' }] };
        const off = await renderTo(tmp, doc, ['--font', 'latin', '--lang', 'latin', '--creation-date', '2026-01-01T00:00:00Z'], 'off.pdf');
        const on = await renderTo(tmp, doc, ['--font', 'latin', '--lang', 'latin', '--kerning', '--creation-date', '2026-01-01T00:00:00Z'], 'on.pdf');
        expect(sha256(on.bytes)).not.toBe(sha256(off.bytes));
        const base14Off = await renderTo(tmp, doc, ['--creation-date', '2026-01-01T00:00:00Z'], 'b14off.pdf');
        const base14On = await renderTo(tmp, doc, ['--kerning', '--creation-date', '2026-01-01T00:00:00Z'], 'b14on.pdf');
        expect(sha256(base14On.bytes)).toBe(sha256(base14Off.bytes));
    });

    it('--font-features tnum on Noto Sans raises TYPOGRAPHY_FEATURE_INEFFECTIVE (warning; --strict → E_CHECK_FAILED)', async () => {
        const doc = { title: 'Figures', blocks: [{ type: 'paragraph', text: 'Figures 0123456789' }] };
        const input = await tmp.json('in.json', doc);
        const output = tmp.path('out.pdf');
        const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, '--font', 'latin', '--lang', 'latin', '--font-features', 'tnum'])));
        const diagnostics = envelope.diagnostics as { code: string; severity: string }[];
        expect(diagnostics.some((d) => d.code === 'TYPOGRAPHY_FEATURE_INEFFECTIVE' && d.severity === 'warning')).toBe(true);
        try {
            await render(parseArgs(['--input', input, '--output', tmp.path('strict.pdf'), '--font', 'latin', '--lang', 'latin', '--font-features', 'tnum', '--strict']));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.CHECK_FAILED);
        }
    });

    it('--font-features tnum --dry-run reports TYPOGRAPHY_FEATURE_INEFFECTIVE in the dry-run envelope (v1.5.0 pre-flight)', async () => {
        const doc = { title: 'Figures', blocks: [{ type: 'paragraph', text: 'Figures 0123456789' }] };
        const input = await tmp.json('in.json', doc);
        const output = tmp.path('never.pdf');
        const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, '--dry-run', '--font', 'latin', '--lang', 'latin', '--font-features', 'tnum'])));
        expect(envelope).toMatchObject({ ok: true, dryRun: true });
        const diagnostics = envelope.diagnostics as { code: string }[];
        expect(diagnostics.some((d) => d.code === 'TYPOGRAPHY_FEATURE_INEFFECTIVE')).toBe(true);
        await expect(fs.stat(output)).rejects.toThrow();
    });

    it('--font-features onum renders old-style figures with Noto Sans (no diagnostic)', async () => {
        const doc = { title: 'Figures', blocks: [{ type: 'paragraph', text: 'Figures 0123456789' }] };
        const { stderr, bytes } = await renderTo(tmp, doc, ['--font', 'latin', '--lang', 'latin', '--font-features', 'onum,smcp']);
        expect(stderr).not.toContain('TYPOGRAPHY_FEATURE_INEFFECTIVE');
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects a malformed --font-features tag with a usage error', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        for (const bad of ['tabular', 'on um', '']) {
            await expect(render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--font-features', bad]))).rejects.toMatchObject({ exitCode: 2 });
        }
    });

    it('punctuationSpacing fr and unitBinding via --layout are accepted and change the bytes', async () => {
        const doc = { title: 'FR', blocks: [{ type: 'paragraph', text: 'Prix : 150 € ; livraison en 12 kg ! Vraiment ?' }] };
        const layout = await tmp.json('layout.json', { typography: { punctuationSpacing: 'fr', unitBinding: true, bindShortWords: true, opticalMargins: true, metrics: 'exact' } });
        const plain = await renderTo(tmp, doc, ['--font', 'latin', '--lang', 'latin', '--creation-date', '2026-01-01T00:00:00Z'], 'plain.pdf');
        const typo = await renderTo(tmp, doc, ['--font', 'latin', '--lang', 'latin', '--layout', layout, '--creation-date', '2026-01-01T00:00:00Z'], 'typo.pdf');
        expect(sha256(typo.bytes)).not.toBe(sha256(plain.bytes));
        const text = extractText(new Uint8Array(typo.bytes)).map((p) => p.text).join('\n');
        expect(text).toContain('150');
    });
});

describe('render CMYK colours (pdfnative 1.8.0)', () => {
    it('a [c, m, y, k] paragraph colour emits a DeviceCMYK fill operator', async () => {
        const doc = { title: 'CMYK', blocks: [{ type: 'paragraph', text: 'Rich black', color: [0, 0, 0, 100] }] };
        const { bytes } = await renderTo(tmp, doc);
        expect(bytes.toString('latin1')).toMatch(/0 0 0 1 k/);
    });

    it('a "c m y k" operand string is accepted on --watermark-color', async () => {
        const doc = { title: 'CMYK', blocks: [{ type: 'paragraph', text: 'Watermarked' }] };
        const { bytes } = await renderTo(tmp, doc, ['--watermark-text', 'DRAFT', '--watermark-color', '0 1 1 0']);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(bytes.toString('latin1')).toMatch(/0 1 1 0 (k|K)\b/);
    });
});

describe('render --font: 27 scripts + aliases (pdfnative 1.8.0)', () => {
    it.each([
        ['lo', 'ສະບາຍດີ ໂລກ'],
        ['nod', 'ᨲᩫ᩠ᩅᨾᩮᩬᩥᨦ'],
        ['khb', 'ᦎᦸᧈᦑᦸᧈ'],
        ['tdd', 'ᥖᥭᥰ ᥘᥫᥴ'],
        ['cjm', 'ꨌꩌ ꨭꨌꨯꨱꨭ'],
    ])('registers %s and renders a paragraph in that script', async (code, text) => {
        const { bytes, stderr } = await renderTo(tmp, { title: code, blocks: [{ type: 'paragraph', text }] }, ['--font', code, '--lang', code]);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(stderr).not.toContain('PDFA_');
        // The script font is embedded (a TrueType subset), not a base-14 fallback.
        expect(bytes.toString('latin1')).toContain('/FontFile2');
    });

    it.each(['ha', 'yo', 'ig', 'sw'])('--lang %s aliases to latin and renders composed tone marks', async (code) => {
        const { bytes } = await renderTo(tmp, { title: code, blocks: [{ type: 'paragraph', text: 'Ẹ káàbọ̀ — Ọ̀tọ̀ ìjọ' }] }, ['--font', 'latin', '--lang', code]);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('the allow-list error names 27 script codes', async () => {
        const input = await tmp.json('in.json', MINIMAL_DOC);
        try {
            await render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--font', 'klingon']));
            expect.unreachable();
        } catch (e) {
            const message = (e as CliError).message;
            const allowed = /Allowed: ([^(]+)/.exec(message)?.[1] ?? '';
            const codes = allowed.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
            expect(codes).toHaveLength(31);
            expect(codes).toContain('cjm');
        }
    });

    it('--variant table --lang latin --tagged pdfa2b --strict passes: the table variant embeds fonts (v1.5.0)', async () => {
        const table = {
            docTitle: 'Table PDF/A', title: 'Ledger', infoItems: [], balanceText: '', countText: '',
            headers: ['Item', 'Qty'], rows: [{ type: 'data', pointed: false, cells: ['Widget', '2'] }], footerText: 'x',
        };
        const { bytes, stderr } = await renderTo(tmp, table, ['--variant', 'table', '--tagged', 'pdfa2b', '--font', 'latin', '--lang', 'latin', '--strict']);
        expect(bytes.toString('latin1')).toContain('pdfaid:part');
        expect(stderr).not.toContain('PDFA_NO_FONT_ENTRIES');
    });
});

describe('render --creation-date / SOURCE_DATE_EPOCH (reproducible output)', () => {
    const DOC = { title: 'Repro', blocks: [{ type: 'paragraph', text: 'Pinned on {date}.' }] };
    const PIN = ['--creation-date', '2026-01-01T00:00:00Z', '--header-right', '{date}'];

    it('pins /CreationDate in UTC and the {date} placeholder', async () => {
        const { bytes } = await renderTo(tmp, DOC, PIN);
        const raw = bytes.toString('latin1');
        expect(raw).toContain("D:20260101000000+00'00'");
        const text = extractText(new Uint8Array(bytes)).map((p) => p.text).join('\n');
        expect(text).toMatch(/2026/);
        expect(text).not.toContain(String(new Date().getUTCFullYear() + 1));
    });

    it('two pinned renders are byte-identical, under different TZ values', async () => {
        const prevTz = process.env['TZ'];
        try {
            process.env['TZ'] = 'Europe/Paris';
            const a = await renderTo(tmp, DOC, PIN, 'a.pdf');
            process.env['TZ'] = 'America/Los_Angeles';
            const b = await renderTo(tmp, DOC, PIN, 'b.pdf');
            expect(sha256(a.bytes)).toBe(sha256(b.bytes));
        } finally {
            if (prevTz === undefined) delete process.env['TZ']; else process.env['TZ'] = prevTz;
        }
    });

    it('SOURCE_DATE_EPOCH pins the instant when the flag is absent (via the process default)', async () => {
        // The dispatcher applies the env; in-process tests set the default the same way.
        setDefaultCreationDate(new Date(1767225600 * 1000));
        const a = await renderTo(tmp, DOC, ['--header-right', '{date}'], 'a.pdf');
        const b = await renderTo(tmp, DOC, PIN, 'b.pdf');
        expect(sha256(a.bytes)).toBe(sha256(b.bytes));
    });

    it('the flag wins over the process default and layout.creationDate wins over the default too', async () => {
        setDefaultCreationDate(new Date('2020-02-02T02:02:02Z'));
        const flag = await renderTo(tmp, DOC, PIN, 'flag.pdf');
        expect(flag.bytes.toString('latin1')).toContain("D:20260101000000+00'00'");
        const json = await renderTo(tmp, { ...DOC, layout: { creationDate: '2026-01-01T00:00:00Z' } }, ['--header-right', '{date}'], 'json.pdf');
        expect(sha256(json.bytes)).toBe(sha256(flag.bytes));
    });

    it('--json envelope reports the pinned creationDate; absent otherwise', async () => {
        const input = await tmp.json('in.json', DOC);
        const pinned = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', tmp.path('p.pdf'), '--creation-date', '2026-01-01T00:00:00Z'])));
        expect(pinned.envelope.creationDate).toBe('2026-01-01T00:00:00.000Z');
        const free = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', tmp.path('f.pdf')])));
        expect(free.envelope).not.toHaveProperty('creationDate');
    });

    it('an invalid --creation-date or layout.creationDate is rejected', async () => {
        const input = await tmp.json('in.json', DOC);
        await expect(render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--creation-date', 'tomorrow']))).rejects.toMatchObject({ exitCode: 2 });
        const bad = await tmp.json('bad.json', { ...DOC, layout: { creationDate: 'not-a-date' } });
        await expect(render(parseArgs(['--input', bad, '--output', tmp.path('x.pdf')]))).rejects.toMatchObject({ code: ErrorCode.INPUT });
    });

    it('encrypted output is never byte-identical (CSPRNG file key) — the documented limit', async () => {
        const a = await renderTo(tmp, DOC, [...PIN, '--encrypt', '--owner-password', 'pw'], 'a.pdf');
        const b = await renderTo(tmp, DOC, [...PIN, '--encrypt', '--owner-password', 'pw'], 'b.pdf');
        expect(sha256(a.bytes)).not.toBe(sha256(b.bytes));
    });

    it('a --layout file above the 50 MB cap is refused before parsing', async () => {
        const big = tmp.path('big.json');
        const handle = await fs.open(big, 'w');
        await handle.truncate(50 * 1024 * 1024 + 1);
        await handle.close();
        const input = await tmp.json('in.json', DOC);
        await expect(render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--layout', big]))).rejects.toThrow(/50 MB/);
    });

    it('/ActualText on tagged output: extract-text returns the source text of a shaped run (pdfnative 1.8.0)', async () => {
        const { bytes, stderr } = await renderTo(tmp, { title: 'Thai', blocks: [{ type: 'paragraph', text: 'น้ำ' }] }, ['--font', 'th', '--font', 'latin', '--lang', 'th,latin', '--tagged', 'pdfa2b']);
        expect(stderr).not.toContain('PDFA_NO_FONT_ENTRIES');
        const text = extractText(new Uint8Array(bytes)).map((p) => p.text).join('');
        expect(text).toContain('น้ำ');
    });

    it('without a pin the date is the wall clock, written in UTC — never a local offset (pdfnative 1.8.0)', async () => {
        const { bytes } = await renderTo(tmp, DOC, [], 'a.pdf');
        expect(bytes.toString('latin1')).toMatch(/\/CreationDate \(D:\d{14}\+00'00'\)/);
    });
});
