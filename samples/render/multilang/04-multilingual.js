#!/usr/bin/env node
// render/multilang/04-multilingual.js — Render a mixed-script PDF
//
// Demonstrates rendering four writing systems (Latin, Thai, Japanese,
// Arabic, Russian/Cyrillic) in a single PDF using pdfnative's bundled
// Noto Sans font data. No external font files are required.
//
// Usage:
//   node samples/render/multilang/04-multilingual.js
//
// Output: samples/output/multilang/04-multilingual.pdf
//
// Font layout:
//   /F1  Helvetica Regular  — Latin (built-in, no loader needed)
//   /F2  Helvetica Bold     — Latin bold (built-in)
//   /F3  Noto Sans Thai     — pdfnative/fonts/noto-thai-data.js
//   /F4  Noto Sans JP       — pdfnative/fonts/noto-jp-data.js
//   /F5  Noto Sans Arabic   — pdfnative/fonts/noto-arabic-data.js
//   /F6  Noto Sans (Cyril.) — pdfnative/fonts/noto-cyrillic-data.js

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL }             from 'node:url';
import { dirname, join, resolve }                  from 'node:path';

import { registerFonts, loadFontData, buildDocumentPDFBytes } from 'pdfnative';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..', '..', '..');
const outDir    = join(rootDir, 'samples', 'output', 'multilang');

// Locate the pdfnative/fonts/ directory using import.meta.resolve so the
// path works regardless of package manager layout (npm, pnpm, Yarn PnP, …).
const pdfnativeFontsDir = join(
  dirname(fileURLToPath(import.meta.resolve('pdfnative'))),
  '..',
  'fonts',
);
/** @param {string} name */
const fontUrl = (name) => pathToFileURL(join(pdfnativeFontsDir, name)).href;

// ── 1. Register all required font loaders (lazy, cached on first use) ───────
//
// Each entry is a function that returns a Promise<FontData>.
// pdfnative resolves them on demand and caches the result.
registerFonts({
  th: () => import(fontUrl('noto-thai-data.js')),
  ja: () => import(fontUrl('noto-jp-data.js')),
  ar: () => import(fontUrl('noto-arabic-data.js')),
  ru: () => import(fontUrl('noto-cyrillic-data.js')),
});

// ── 2. Load all font data in parallel ────────────────────────────────────────
process.stdout.write('Loading font data…\n');

const [thFont, jaFont, arFont, ruFont] = await Promise.all([
  loadFontData('th'),
  loadFontData('ja'),
  loadFontData('ar'),
  loadFontData('ru'),
]);

/** @type {import('pdfnative').FontEntry[]} */
const fontEntries = [
  thFont && { fontData: thFont, fontRef: '/F3', lang: 'th' },
  jaFont && { fontData: jaFont, fontRef: '/F4', lang: 'ja' },
  arFont && { fontData: arFont, fontRef: '/F5', lang: 'ar' },
  ruFont && { fontData: ruFont, fontRef: '/F6', lang: 'ru' },
].filter(Boolean);

const missing = ['th', 'ja', 'ar', 'ru'].filter(
  (lang, i) => ![thFont, jaFont, arFont, ruFont][i],
);
if (missing.length > 0) {
  process.stderr.write(`Warning: font data not found for: ${missing.join(', ')}\n`);
}

process.stdout.write(
  `Loaded ${fontEntries.length}/4 font(s): ${fontEntries.map(f => f.lang).join(', ')}\n`,
);

// ── 3. Read the DocumentParams and inject font entries ───────────────────────
const raw    = readFileSync(join(__dirname, '04-multilingual.json'), 'utf-8');
const params = JSON.parse(raw);
params.fontEntries = fontEntries;

// ── 4. Render ────────────────────────────────────────────────────────────────
//
// pdfnative iterates each text run, detects the Unicode script of the characters,
// and routes them to the matching FontEntry (Latin → /F1, Thai → /F3, etc.).
// Mixed-script paragraphs (e.g. English and Thai in the same sentence) are
// automatically split into separate font spans.
process.stdout.write('Rendering…\n');
const pdf = buildDocumentPDFBytes(params);

// ── 5. Write output ──────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, '04-multilingual.pdf');
writeFileSync(outPath, pdf);

process.stdout.write(`✓ Written: ${outPath}\n`);
process.stdout.write(
  `  Scripts rendered: Latin + Thai + Japanese + Arabic (RTL) + Russian\n`,
);
