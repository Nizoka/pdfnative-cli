// Font registration for `render` (v1.5.0 — moved out of render.ts so
// `doctor` can report the bundled inventory without importing the renderer).
//
// Three sources of fonts, all ending in pdfnative's font registry:
//   --font <shortcut>       a bundled Noto module (allow-list below)
//   --lang a,b,c            the codes whose fontEntries are injected
//   --font-file <path.ttf>  a font program the user ships (v1.5.0, guarded)

import { createRequire } from 'node:module';
import { basename, dirname, extname, join as joinPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    registerFont,
    loadFontData,
    hasFontLoader,
    parseFontData,
    validateFontData,
} from '../core-bridge/index.js';
import type { FontEntry, FontData } from '../core-bridge/index.js';
import { CliError, ErrorCode } from './error.js';
import { readBinaryFileCapped } from './io.js';

/**
 * Allow-list of bundled font shortcuts exposed via `--font <name>`.
 * Each maps to a Noto-* data module shipped with pdfnative under its `fonts/`
 * directory (which is not part of the package `exports` map, so we resolve it
 * via the main entry and import a `file://` URL).
 *
 * Adding to this list is intentional (no auto-discovery) so the CLI surface
 * stays predictable and free from path-based RCE vectors. 31 modules:
 * 4 utility faces + 27 script fonts (pdfnative 1.8.0).
 */
export const BUNDLED_FONT_MODULES: Readonly<Record<string, string>> = Object.freeze({
    // Latin + monochrome / COLRv1 colour emoji
    latin: 'noto-sans-data.js',
    emoji: 'noto-emoji-data.js',
    'color-emoji': 'noto-color-emoji-data.js',
    // Mathematical / technical symbols (pdfnative ≥ 1.5.0). Code points in the
    // math operator / geometric-shape blocks are auto-routed to this font.
    math: 'noto-sans-math-data.js',
    // 27 Unicode scripts (pdfnative ≥ 1.8.0). The shortcut name doubles as the
    // `--lang` code; pdfnative routes each code point to the font whose cmap
    // covers it, so any registered script font is used automatically.
    ar: 'noto-arabic-data.js',
    hy: 'noto-armenian-data.js',
    bn: 'noto-bengali-data.js',
    ru: 'noto-cyrillic-data.js',
    hi: 'noto-devanagari-data.js',
    am: 'noto-ethiopic-data.js',
    ka: 'noto-georgian-data.js',
    el: 'noto-greek-data.js',
    he: 'noto-hebrew-data.js',
    ja: 'noto-jp-data.js',
    km: 'noto-khmer-data.js',
    ko: 'noto-kr-data.js',
    my: 'noto-myanmar-data.js',
    pl: 'noto-polish-data.js',
    zh: 'noto-sc-data.js',
    si: 'noto-sinhala-data.js',
    ta: 'noto-tamil-data.js',
    te: 'noto-telugu-data.js',
    th: 'noto-thai-data.js',
    bo: 'noto-tibetan-data.js',
    tr: 'noto-turkish-data.js',
    vi: 'noto-vietnamese-data.js',
    // pdfnative 1.8.0 — Lao, Tai Tham, New Tai Lue, Tai Le, Cham
    lo: 'noto-lao-data.js',
    nod: 'noto-taitham-data.js',
    khb: 'noto-newtailue-data.js',
    tdd: 'noto-taile-data.js',
    cjm: 'noto-cham-data.js',
});

/** The utility faces that are not scripts. */
const UTILITY_FONTS: readonly string[] = ['latin', 'emoji', 'color-emoji', 'math'];

/** The 27 script codes (everything in the allow-list that is not a utility face). */
export const SCRIPT_CODES: readonly string[] = Object.keys(BUNDLED_FONT_MODULES).filter((k) => !UTILITY_FONTS.includes(k));

/**
 * Language codes that are labels over an existing module: Hausa, Yoruba,
 * Igbo and Swahili are set in Latin with combining marks, which the bundled
 * Noto Sans module anchors (pdfnative 1.8.0 latin-marks shaper). No new
 * font, no new key — the alias resolves before any lookup.
 */
export const FONT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    ha: 'latin',
    yo: 'latin',
    ig: 'latin',
    sw: 'latin',
});

/** Resolve an alias (`yo` → `latin`); other names pass through lower-cased. */
export function resolveFontAlias(raw: string): string {
    const name = raw.trim().toLowerCase();
    return FONT_ALIASES[name] ?? name;
}

/** Split a `--lang a,b,c` value, resolve aliases and de-duplicate, keeping order. */
export function normalizeLangs(raw: string | undefined): readonly string[] {
    if (raw === undefined) return [];
    const out: string[] = [];
    for (const part of raw.split(',')) {
        const name = resolveFontAlias(part);
        if (name.length > 0 && !out.includes(name)) out.push(name);
    }
    return out;
}

let cachedFontsDir: string | null = null;
/** pdfnative's `fonts/` directory, next to its main entry. */
export function resolveFontsDir(): string {
    if (cachedFontsDir !== null) return cachedFontsDir;
    const require = createRequire(import.meta.url);
    // pdfnative's package.json is not exported, but the main entry is. Resolve
    // the main entry (.../dist/index.js) and walk up two levels to the package
    // root, which contains the `fonts/` directory.
    const main = require.resolve('pdfnative');
    cachedFontsDir = joinPath(dirname(dirname(main)), 'fonts');
    return cachedFontsDir;
}

/**
 * Register bundled font shortcuts from `--font` flags. Names are validated
 * against {@link BUNDLED_FONT_MODULES} (after alias resolution). Idempotent
 * across watch re-renders (pdfnative's `registerFont` simply overwrites).
 */
export async function applyFontFlags(fontFlags: readonly string[]): Promise<void> {
    if (fontFlags.length === 0) return;
    // Validate all names BEFORE touching the filesystem so unknown shortcuts
    // surface a CliError rather than a resolution error.
    const resolved: { name: string; fileName: string }[] = [];
    for (const raw of fontFlags) {
        const name = resolveFontAlias(raw);
        if (name.length === 0) continue;
        const fileName = BUNDLED_FONT_MODULES[name];
        if (fileName === undefined) {
            const allowed = Object.keys(BUNDLED_FONT_MODULES).join(', ');
            const aliases = Object.keys(FONT_ALIASES).join(', ');
            throw new CliError(
                `--font "${raw}" is not a recognized bundled font. Allowed: ${allowed} (aliases of latin: ${aliases}).`,
                2,
            );
        }
        resolved.push({ name, fileName });
    }
    if (resolved.length === 0) return;
    const fontsDir = resolveFontsDir();
    for (const { name, fileName } of resolved) {
        const fileUrl = pathToFileURL(joinPath(fontsDir, fileName)).href;
        // The Noto data modules ARE the FontData shape (namespace import).
        registerFont(name, () => import(fileUrl) as Promise<never>);
    }
}

/** Build font entries for registered language codes (bundled or --font-file). */
export async function buildFontEntriesForLangs(
    langs: readonly string[],
    nextRefStart: number,
): Promise<readonly FontEntry[]> {
    if (langs.length === 0) return [];
    const entries: FontEntry[] = [];
    let nextRef = nextRefStart;
    for (const lang of langs) {
        if (!hasFontLoader(lang)) {
            throw new CliError(
                `--lang "${lang}" is not a registered font. ` +
                'Use --font to register a bundled shortcut, --font-file for a font you ship, or register a loader programmatically.',
                2,
            );
        }
        const fontData = await loadFontData(lang);
        if (fontData === null) {
            throw new CliError(`Failed to load font data for --lang "${lang}".`, 1);
        }
        entries.push({ fontData, fontRef: `/F${nextRef}`, lang });
        nextRef++;
    }
    return entries;
}

// ── --font-file: fonts the user ships (v1.5.0) ──────────────────────────
//
// Security posture: a font program is an untrusted binary parsed in-process
// by pdfnative's font compiler (the same code as the `pdfnative-build-font`
// tool). The CLI (1) validates the path against traversal, (2) caps the size
// before reading, (3) checks the sfnt magic and refuses collections and WOFF
// containers, (4) parses inside try/catch and reports the message only, and
// (5) runs pdfnative's validateFontData() before registering. Fonts are never
// loaded from JSON (`--layout`, the document): only from this flag.

/** Size cap for a --font-file program (a CJK Noto face is ~20 MB). */
export const MAX_FONT_FILE_BYTES = 32 * 1024 * 1024;

/** sfnt magic: TrueType (`00 01 00 00`), Apple `true`, CFF-flavoured `OTTO`. */
export function sniffFontFormat(bytes: Uint8Array): 'ttf' | 'otf' | 'ttc' | 'woff' | 'woff2' | null {
    if (bytes.length < 4) return null;
    const tag = String.fromCharCode(bytes[0] as number, bytes[1] as number, bytes[2] as number, bytes[3] as number);
    if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return 'ttf';
    if (tag === 'true') return 'ttf';
    if (tag === 'OTTO') return 'otf';
    if (tag === 'ttcf') return 'ttc';
    if (tag === 'wOFF') return 'woff';
    if (tag === 'wOF2') return 'woff2';
    return null;
}

/** Derive the registry name from a path: basename without extension, `[a-z0-9-]` only. */
export function defaultFontName(filePath: string): string {
    const base = basename(filePath, extname(filePath)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return base.length > 0 ? base : 'custom-font';
}

/** Split `<path>[:name]`, honouring a Windows drive letter (`C:\…`). */
export function parseFontFileSpec(raw: string): { readonly path: string; readonly name: string } {
    const parts = raw.split(':');
    let pathPart = parts[0] ?? '';
    let offset = 1;
    if (pathPart.length === 1 && /^[A-Za-z]$/.test(pathPart) && parts.length > 1) {
        pathPart = `${pathPart}:${parts[1] ?? ''}`;
        offset = 2;
    }
    if (pathPart.length === 0) throw new CliError(`Invalid --font-file value "${raw}".`, 2);
    const namePart = parts.slice(offset).join(':').trim();
    if (namePart.length > 0 && !/^[a-z0-9-]+$/.test(namePart)) {
        throw new CliError(`Invalid --font-file name "${namePart}": use lower-case letters, digits and dashes.`, 2);
    }
    return { path: pathPart, name: namePart.length > 0 ? namePart : defaultFontName(pathPart) };
}

/**
 * Load, validate and register every `--font-file` program. Returns the
 * registry names, which the caller appends to the `--lang` list so the font
 * is embedded (a custom font has no use unless its fontEntries are injected).
 */
export async function loadCustomFonts(specs: readonly string[], quiet: boolean): Promise<readonly string[]> {
    const names: string[] = [];
    for (const raw of specs) {
        const { path, name } = parseFontFileSpec(raw);
        if (BUNDLED_FONT_MODULES[name] !== undefined || FONT_ALIASES[name] !== undefined) {
            throw new CliError(
                `--font-file name "${name}" collides with a bundled font shortcut; pass an explicit name with "${path}:<name>".`,
                2,
            );
        }
        const bytes = await readBinaryFileCapped(path, MAX_FONT_FILE_BYTES, 'font file');
        const format = sniffFontFormat(bytes);
        if (format === 'ttc') {
            throw new CliError(`--font-file "${path}" is a TrueType collection (ttcf); extract one face first.`, 1, ErrorCode.INPUT);
        }
        if (format === 'woff' || format === 'woff2') {
            throw new CliError(`--font-file "${path}" is a ${format.toUpperCase()} container; decompress it to TTF/OTF first.`, 1, ErrorCode.INPUT);
        }
        if (format === null) {
            throw new CliError(`--font-file "${path}" is not a TrueType/OpenType font program (no sfnt signature).`, 1, ErrorCode.INPUT);
        }
        let fontData: FontData;
        try {
            fontData = parseFontData(bytes, { fontName: name }) as unknown as FontData;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new CliError(`--font-file "${path}" could not be parsed: ${message}`, 1, ErrorCode.INPUT);
        }
        const validation = validateFontData(fontData);
        if (!validation.valid) {
            throw new CliError(
                `--font-file "${path}" failed validation: ${validation.errors.join('; ')}`,
                1,
                ErrorCode.INPUT,
            );
        }
        if (!quiet) {
            for (const w of validation.warnings) process.stderr.write(`warning: --font-file "${path}": ${w}\n`);
        }
        registerFont(name, () => Promise.resolve(fontData));
        if (!names.includes(name)) names.push(name);
    }
    return names;
}
