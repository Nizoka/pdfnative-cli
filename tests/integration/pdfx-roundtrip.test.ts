// render --pdfx → inspect --check pdfx → annotate → check fails → metadata keeps the claim.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { inspect } from '../../src/commands/inspect.js';
import { annotate } from '../../src/commands/annotate.js';
import { metadata } from '../../src/commands/metadata.js';
import { compare } from '../../src/commands/compare.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { TempFiles, SYNTHETIC_CMYK_ICC, MINIMAL_DOC, renderTo, captured } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanup();
});

const PDFX = ['--pdfx', 'pdfx4', '--output-intent-icc', SYNTHETIC_CMYK_ICC, '--font', 'latin', '--lang', 'latin', '--trapped', 'false', '--strict', '--creation-date', '2026-01-01T00:00:00Z'];
const DOC = { ...MINIMAL_DOC, layout: { print: { bleed: 8.5 } } };

describe('PDF/X-4 round trip', () => {
    it('render → check passes → link annotation → check fails (PDFX annotations)', async () => {
        const { output } = await renderTo(tmp, DOC, PDFX, 'pdfx.pdf');
        await captured(() => inspect(parseArgs(['--input', output, '--check', 'pdfx'])));

        const notes = await tmp.json('notes.json', [{ page: 1, type: 'link', rect: [72, 700, 300, 720], url: 'https://pdfnative.dev' }]);
        const linked = tmp.path('linked.pdf');
        await captured(() => annotate(parseArgs(['--input', output, '--output', linked, '--annotations', notes])));
        try {
            await captured(() => inspect(parseArgs(['--input', linked, '--check', 'pdfx'])));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(CliError);
            expect((e as CliError).code).toBe(ErrorCode.CHECK_FAILED);
        }
    });

    it('an incremental metadata update drops the PDF/X identification (pdfnative 1.8.0 limit) — the check reports it', async () => {
        // PdfModifier.updateMetadata re-issues the XMP packet without the
        // pdfxid / xmpMM / pdf:Trapped properties PDF/X-4 requires, so a
        // metadata edit on a press file is no longer PDF/X-4. The CLI surfaces
        // it rather than hiding it; tracked in ROADMAP as an upstream gap.
        const { output } = await renderTo(tmp, DOC, PDFX, 'pdfx.pdf');
        const updated = tmp.path('updated.pdf');
        await captured(() => metadata(parseArgs(['--input', output, '--output', updated, '--title', 'Press run 42', '--mod-date', '2026-01-02T00:00:00Z'])));
        const { stdout } = await captured(() => inspect(parseArgs(['--input', updated, '--format', 'json', '--pdfx'])));
        const doc = JSON.parse(stdout) as { pdfxConformance: string | null; pdfx: { valid: boolean; errors: string[] }; metadata: { title: string } };
        expect(doc.metadata.title).toBe('Press run 42');
        expect(doc.pdfxConformance).toBeNull();
        expect(doc.pdfx.valid).toBe(false);
        expect(doc.pdfx.errors.some((e) => e.includes('GTS_PDFXVersion'))).toBe(true);
        await expect(captured(() => inspect(parseArgs(['--input', updated, '--check', 'pdfx'])))).rejects.toMatchObject({ code: ErrorCode.CHECK_FAILED });
    });

    it('two pinned PDF/X renders compare equal', async () => {
        const a = await renderTo(tmp, DOC, PDFX, 'a.pdf');
        const b = await renderTo(tmp, DOC, PDFX, 'b.pdf');
        expect(a.bytes.equals(b.bytes)).toBe(true);
        await expect(captured(() => compare(parseArgs([a.output, b.output, '--format', 'json'])))).resolves.toBeDefined();
    });
});
