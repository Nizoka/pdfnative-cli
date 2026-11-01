// schema: the v1.5.0 shape changes (no new subject — 19 stay 19).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema, SUBJECTS } from '../../src/commands/schema.js';
import { parseArgs } from '../../src/utils/args.js';
import { captured } from '../helpers/cli-harness.js';

type Doc = Record<string, unknown>;
const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')) as { version: string };

async function subject(name: string): Promise<Doc> {
    const { stdout } = await captured(() => schema(parseArgs([name])));
    return JSON.parse(stdout) as Doc;
}

const props = (doc: Doc, ...path: string[]): Doc => {
    let cur: Doc = doc;
    for (const key of path) cur = cur[key] as Doc;
    return cur;
};

describe('schema (v1.5.0 shapes)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('still declares 19 subjects and versions every $id with the package version', async () => {
        expect(SUBJECTS).toHaveLength(19);
        const doc = await subject('inspect');
        expect(doc.$id).toContain(`/${pkg.version}/`);
    });

    it('inspect requires pdfxConformance and documents pdfx + --iso-dates', async () => {
        const doc = await subject('inspect');
        expect(doc.required).toContain('pdfxConformance');
        expect(props(doc, 'properties', 'pdfxConformance').type).toEqual(['string', 'null']);
        expect(props(doc, 'properties', 'pdfx', 'properties')).toHaveProperty('valid');
        expect(String(props(doc, 'properties', 'metadata', 'properties', 'creationDate').description)).toContain('--iso-dates');
    });

    it('inspect-summary requires pdfx', async () => {
        const doc = await subject('inspect-summary');
        expect(doc.required).toEqual(['pages', 'encrypted', 'signatures', 'pdfa', 'pdfx']);
    });

    it('status pins the additive pdfx, tagged, direction, actualText, creationDate and timestamp.timeoutMs fields and the thirteen diagnostic codes', async () => {
        const doc = await subject('status');
        expect(props(doc, 'properties', 'pdfx').enum).toEqual(['pdfx4']);
        expect(props(doc, 'properties', 'tagged').enum).toEqual(['pdfa1b', 'pdfa2b', 'pdfa2u', 'pdfa3b']);
        expect(props(doc, 'properties', 'direction').enum).toEqual(['auto', 'ltr', 'rtl']);
        expect(props(doc, 'properties', 'actualText').type).toBe('boolean');
        expect(props(doc, 'properties', 'creationDate').format).toBe('date-time');
        expect(props(doc, 'properties', 'timestamp', 'properties')).toHaveProperty('timeoutMs');
        const description = String(props(doc, 'properties', 'diagnostics').description);
        for (const code of ['PDFA_NO_FONT_ENTRIES', 'PDFA_UNEMBEDDED_FORM_FONT', 'PDFA_DEVICE_CMYK_IMAGE', 'PDFA_DEVICE_CMYK_CONTENT', 'PDFA_ICC_PROFILE_VERSION', 'PDFX_NO_FONT_ENTRIES', 'PDFX_DEVICE_CMYK', 'PDFX_ANNOTATIONS', 'TYPOGRAPHY_FEATURE_INEFFECTIVE', 'PDFA_GLYPH_WITHOUT_UNICODE', 'PDFA1_JPX_IMAGE', 'PDFA_JPX_IMAGE', 'TEXT_GLYPH_NOT_COVERED']) {
            expect(description).toContain(code);
        }
    });

    it('render documents typography, pdfx, colourBars, creationDate, CMYK and spot colours, direction, JPEG 2000 and the 32 scripts', async () => {
        const doc = await subject('render');
        const document = (doc.oneOf as Doc[])[0] as Doc;
        const layout = String(props(document, 'properties', 'layout').description);
        for (const token of ['typography', 'pdfx', 'colourBars', 'creationDate', 'hyphenationLanguage', 'punctuationSpacing', 'spotColours', 'direction', 'actualText', 'pdfa2u']) expect(layout).toContain(token);
        const blocks = String(props(document, 'properties', 'blocks').description);
        for (const token of ['[c, m, y, k]', '{spot', '{inks', 'JPEG 2000', '/JPXDecode', 'direction']) expect(blocks).toContain(token);
        expect(String(props(document, 'properties', 'fontEntries').description)).toContain('cjm');
        expect(String(props(document, 'properties', 'fontEntries').description)).toContain('ml');
        const table = (doc.oneOf as Doc[])[1] as Doc;
        expect(props(table, 'properties')).toHaveProperty('fontEntries');
    });

    it('annotate accepts the link type with a url', async () => {
        const doc = await subject('annotate');
        const item = ((doc.oneOf as Doc[])[0] as Doc).items as Doc;
        expect((props(item, 'properties', 'type').enum as string[])).toContain('link');
        expect(props(item, 'properties')).toHaveProperty('url');
    });

    it('verify documents timestampDigest', async () => {
        const doc = await subject('verify');
        const sig = props(doc, 'properties', 'signatures', 'items', 'properties');
        expect(sig).toHaveProperty('timestampDigest');
    });

    it('the manifest lists the new flags and the extra global flag', async () => {
        const doc = await subject('manifest');
        expect(doc.globalFlags).toContain('--creation-date');
        const commands = doc.commands as { name: string; flags: string[] }[];
        const flagsOf = (name: string): string[] => commands.find((c) => c.name === name)?.flags ?? [];
        for (const f of ['--pdfx', '--output-intent-icc', '--output-intent-id', '--trapped', '--font-file', '--split-paragraphs', '--keep-headings-with-next', '--kerning', '--font-features']) expect(flagsOf('render')).toContain(f);
        for (const f of ['--pdfx', '--iso-dates']) expect(flagsOf('inspect')).toContain(f);
        expect(flagsOf('sign')).toContain('--timestamp-timeout');
        expect((doc.errorCodes as string[]).length).toBe(12);
    });
});
