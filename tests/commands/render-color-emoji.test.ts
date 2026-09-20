// render --font color-emoji: COLRv1 colour glyphs through the CLI (engine
// 1.8.0) — skin-tone modifiers, ZWJ sequences and flags are ONE colour form
// each, and the glyphs whose alpha ramps 1.8.0 fixed still draw as vector
// forms. A colour glyph is a Form XObject named /CEm<n>, painted with `Do`.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setDefaultCreationDate } from '../../src/core-bridge/index.js';
import { TempFiles, renderTo, latin1, pageCount } from '../helpers/cli-harness.js';

const tmp = new TempFiles();
afterEach(async () => {
    vi.restoreAllMocks();
    setDefaultCreationDate(null);
    await tmp.cleanup();
});

const ARGS = ['--font', 'color-emoji', '--lang', 'color-emoji', '--no-compress', '--creation-date', '2026-01-01T00:00:00Z'] as const;
const cp = (...points: number[]): string => String.fromCodePoint(...points);
const ZWJ = 0x200D;
const VS16 = 0xFE0F;

const THUMBS_UP = 0x1F44D;
const TONES = [0x1F3FB, 0x1F3FC, 0x1F3FD, 0x1F3FE, 0x1F3FF] as const;
const RAINBOW_FLAG = cp(0x1F3F3, VS16, ZWJ, 0x1F308);
const FLAG_FR = cp(0x1F1EB, 0x1F1F7);
const WOMAN_TECHNOLOGIST = cp(0x1F469, ZWJ, 0x1F4BB);
/** Glyphs named by the 1.8.0 alpha-ramp fix. */
const ALPHA_RAMP = [0x1F469, 0x1F468, 0x1F9D1, 0x1F60A, 0x1F30D, 0x1F382] as const;

async function colourForms(text: string, name = 'emoji.pdf'): Promise<{ draws: number; forms: number; raw: string; bytes: Buffer }> {
    const { bytes } = await renderTo(tmp, { title: 'Emoji', blocks: [{ type: 'paragraph', text }] }, ARGS, name);
    const raw = latin1(bytes);
    const draws = (raw.match(/\/CEm[0-9]+ Do/g) ?? []).length;
    const forms = new Set(raw.match(/\/CEm[0-9]+(?= Do)/g) ?? []).size;
    return { draws, forms, raw, bytes };
}

describe('render --font color-emoji (engine 1.8.0)', { timeout: 60_000 }, () => {
    it.each(TONES.map((tone) => [tone.toString(16).toUpperCase(), tone] as const))('a gesture with skin tone U+%s is one colour form, not a base plus a swatch', async (_hex, tone) => {
        const { draws } = await colourForms(cp(THUMBS_UP, tone));
        expect(draws).toBe(1);
    });

    it('the five tones of one gesture are five different colour forms', async () => {
        const { draws, forms } = await colourForms([cp(THUMBS_UP), ...TONES.map((t) => cp(THUMBS_UP, t))].join(' '));
        expect(draws).toBe(6);
        expect(forms).toBe(6);
    });

    it.each([
        ['a ZWJ sequence (rainbow flag)', RAINBOW_FLAG],
        ['a regional-indicator flag', FLAG_FR],
        ['a profession ZWJ sequence', WOMAN_TECHNOLOGIST],
    ])('%s is one colour form', async (_label, text) => {
        const { draws, bytes } = await colourForms(text);
        expect(draws).toBe(1);
        expect(pageCount(bytes)).toBe(1);
    });

    it('the glyphs of the 1.8.0 alpha-ramp fix draw as vector forms with shadings, never as an image', async () => {
        const { draws, forms, raw } = await colourForms(ALPHA_RAMP.map((c) => cp(c)).join(' '));
        expect(draws).toBe(ALPHA_RAMP.length);
        expect(forms).toBe(ALPHA_RAMP.length);
        expect(raw).toMatch(/\/ShadingType [23]/);
        expect(raw).not.toContain('/Subtype /Image');
    });

    it('a toned base outside the bundled set falls back to the untoned emoji: still one form, the modifier draws nothing', async () => {
        const runner = await colourForms(cp(0x1F3C3), 'runner.pdf');
        const toned = await colourForms(cp(0x1F3C3, 0x1F3FD), 'runner-toned.pdf');
        expect(toned.draws).toBe(runner.draws);
    });
});
