// render: JPEG 2000 images (v1.6.0, pdfnative 1.9.0) — a JP2 file or a raw
// J2K codestream in an image block or as --watermark-image is passed through
// as /JPXDecode with the colour and opacity its header declares; the CLI
// resolves the bytes (src / dataBase64) and never sniffs the format itself.
// The fixtures are the engine's own minimal codestreams (tests/fixtures/README.md).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TempFiles, FIXTURES, renderTo, renderJson, diagnosticCodes, latin1 } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

const GRAY = join(FIXTURES, 'minimal-gray.jp2');
const RGB = join(FIXTURES, 'minimal-rgb.jp2');
const RGBA = join(FIXTURES, 'minimal-rgba.jp2');
const J2K = join(FIXTURES, 'minimal.j2k');
const LATIN = ['--font', 'latin', '--lang', 'latin', '--no-compress', '--creation-date', '2026-01-01T00:00:00Z'];
const docOf = (blocks: readonly unknown[]): unknown => ({ title: 'JPEG 2000', blocks });
const image = (src: string, extra: Record<string, unknown> = {}): unknown => ({ type: 'image', src, width: 40, height: 40, ...extra });

describe('render: JPEG 2000 pass-through (pdfnative 1.9.0)', { timeout: 60_000 }, () => {
    it('an image block with a .jp2 src embeds /JPXDecode and the header is at least PDF 1.5', async () => {
        const { bytes } = await renderTo(tmp, docOf([{ type: 'paragraph', text: 'A JP2 image.' }, image(RGB)]), LATIN);
        const raw = latin1(bytes);
        expect(raw).toContain('/Filter /JPXDecode');
        expect(raw).toMatch(/^%PDF-1\.[5-7]/);
        expect(raw).not.toContain('/SMaskInData');
    });

    it('a raw .j2k codestream is accepted the same way', async () => {
        const { bytes } = await renderTo(tmp, docOf([image(J2K)]), LATIN);
        expect(latin1(bytes)).toContain('/JPXDecode');
    });

    it('the same bytes inline as dataBase64', async () => {
        const dataBase64 = readFileSync(GRAY).toString('base64');
        const { bytes } = await renderTo(tmp, docOf([{ type: 'image', dataBase64, width: 40, height: 40 }]), LATIN);
        expect(latin1(bytes)).toContain('/JPXDecode');
    });

    it('--watermark-image accepts a JP2 file', async () => {
        const { bytes } = await renderTo(tmp, docOf([{ type: 'paragraph', text: 'Watermarked.' }]), [...LATIN, '--watermark-image', RGB, '--watermark-opacity', '0.5']);
        expect(latin1(bytes)).toContain('/JPXDecode');
    });

    it('an opacity channel writes /SMaskInData 1', async () => {
        const { bytes } = await renderTo(tmp, docOf([image(RGBA)]), LATIN);
        expect(latin1(bytes)).toContain('/SMaskInData 1');
    });

    it('a plain JP2 under --tagged pdfa2b --strict raises nothing; the same file under pdfa1b and the alpha one under pdfa2b are the two diagnostics', async () => {
        const clean = await renderJson(tmp, docOf([image(GRAY)]), [...LATIN, '--tagged', 'pdfa2b', '--strict']);
        expect(diagnosticCodes(clean.envelope)).toEqual([]);
        const pdfa1 = await renderJson(tmp, docOf([image(GRAY)]), [...LATIN, '--tagged', 'pdfa1b']);
        expect(diagnosticCodes(pdfa1.envelope)).toEqual(['PDFA1_JPX_IMAGE']);
        const alpha = await renderJson(tmp, docOf([image(RGBA)]), [...LATIN, '--tagged', 'pdfa2b']);
        expect(diagnosticCodes(alpha.envelope)).toEqual(['PDFA_JPX_IMAGE']);
    });
});
