// render --font-file <path.ttf>[:name] (v1.5.0). The TTF exercised here is
// decoded at test time from a bundled pdfnative module's ttfBase64 (Noto
// Sans Hebrew, the smallest), so no font binary is committed.

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { resolveFontsDir } from '../../src/utils/fonts.js';
import { extractText } from '../../src/core-bridge/index.js';
import { TempFiles, renderTo, withJsonEnvelope } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
let ttfPath = '';

beforeAll(async () => {
    const mod = await import(pathToFileURL(join(resolveFontsDir(), 'noto-hebrew-data.js')).href) as { default?: { ttfBase64: string }; ttfBase64?: string };
    const b64 = (mod.default ?? mod).ttfBase64;
    if (typeof b64 !== 'string') throw new Error('noto-hebrew-data.js has no ttfBase64');
    ttfPath = await tmp.bytes('NotoSansHebrew-Test.ttf', Buffer.from(b64, 'base64'));
});

afterEach(() => vi.restoreAllMocks());

const HEBREW = { title: 'Hebrew', blocks: [{ type: 'paragraph', text: 'שלום עולם' }] };

describe('render --font-file', () => {
    it('registers a user-shipped TTF, embeds it and renders the text', async () => {
        const { bytes, stderr } = await renderTo(tmp, HEBREW, ['--font-file', ttfPath]);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(stderr).not.toContain('warning: [');
        // The module name derives from the basename: notosanshebrew-test → registered as a lang.
        expect(bytes.toString('latin1')).toContain('/FontFile2');
        // Extraction returns the glyph run in visual (right-to-left) order.
        const text = extractText(new Uint8Array(bytes)).map((p) => p.text).join('');
        expect(text.includes('שלום') || text.includes('םולש')).toBe(true);
    });

    it('accepts an explicit name and lets --lang reference it', async () => {
        const { bytes } = await renderTo(tmp, HEBREW, ['--font-file', `${ttfPath}:brand`, '--lang', 'brand']);
        expect(bytes.toString('latin1')).toContain('/FontFile2');
    });

    it('is reproducible with --creation-date', async () => {
        const a = await renderTo(tmp, HEBREW, ['--font-file', `${ttfPath}:brand`, '--creation-date', '2026-01-01T00:00:00Z'], 'a.pdf');
        const b = await renderTo(tmp, HEBREW, ['--font-file', `${ttfPath}:brand`, '--creation-date', '2026-01-01T00:00:00Z'], 'b.pdf');
        expect(a.bytes.equals(b.bytes)).toBe(true);
    });

    it('--dry-run validates and registers the font without writing', async () => {
        const input = await tmp.json('in.json', HEBREW);
        const output = tmp.path('out.pdf');
        const { envelope } = await withJsonEnvelope(() => render(parseArgs(['--input', input, '--output', output, '--font-file', ttfPath, '--dry-run'])));
        expect(envelope).toMatchObject({ ok: true, dryRun: true });
        await expect(fs.stat(output)).rejects.toThrow();
    });

    it('rejects a non-font file with E_INPUT and never loads a font from JSON', async () => {
        const bogus = await tmp.bytes('bogus.ttf', new TextEncoder().encode('not a font at all'));
        const input = await tmp.json('in.json', HEBREW);
        try {
            await render(parseArgs(['--input', input, '--output', tmp.path('x.pdf'), '--font-file', bogus]));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.INPUT);
        }
        // A `fontFile` key in the document JSON is not a loading path: only the flag registers fonts.
        const { bytes } = await renderTo(tmp, { ...HEBREW, fontFile: '../evil.ttf' });
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
        expect(bytes.toString('latin1')).not.toContain('/FontFile2');
    });
});
