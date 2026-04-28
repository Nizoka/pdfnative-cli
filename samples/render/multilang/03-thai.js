#!/usr/bin/env node
// render/multilang/03-thai.js — Render a real Thai-language PDF
//
// Demonstrates how to register pdfnative's bundled Noto Thai font data
// and render a full Thai document. No external font files are needed —
// the font data is shipped with pdfnative as pdfnative/fonts/noto-thai-data.js
//
// Usage:
//   node samples/render/multilang/03-thai.js
//
// Output: samples/output/multilang/03-thai.pdf
//
// How it works:
//   1. registerFonts() registers a lazy loader for the Thai font.
//   2. loadFontData('th') triggers the actual load (Promise, cached after first call).
//   3. The FontEntry is injected into DocumentParams.fontEntries.
//   4. buildDocumentPDFBytes() renders the document — pdfnative automatically
//      selects the correct font per text run based on Unicode script detection.

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

// ── 1. Register the Noto Thai font loader (lazy, cached on first use) ──────
//
// The font data is a pre-processed binary blob shipped inside pdfnative.
// No TTF file on disk, no network fetch — pure package dependency.
registerFonts({
  th: () => import(fontUrl('noto-thai-data.js')),
});

// ── 2. Load the font data (async; cached for subsequent calls) ──────────────
const thaiFont = await loadFontData('th');
if (!thaiFont) {
  process.stderr.write(
    'Error: Thai font data could not be loaded from pdfnative/fonts/noto-thai-data.js\n' +
    'Make sure pdfnative >= 1.0.5 is installed.\n',
  );
  process.exit(1);
}

// ── 3. Read and augment the DocumentParams with the font entry ──────────────
//
// The JSON sample carries the document structure (blocks, metadata, etc.)
// but cannot embed binary font data. We inject fontEntries here.
const raw    = readFileSync(join(__dirname, '03-thai.json'), 'utf-8');
const params = JSON.parse(raw);

params.fontEntries = [
  { fontData: thaiFont, fontRef: '/F3', lang: 'th' },
];

// ── 4. Render ────────────────────────────────────────────────────────────────
//
// buildDocumentPDFBytes is synchronous. pdfnative detects Thai codepoints
// in the text runs and automatically uses the registered /F3 font for them.
// Latin characters continue to use the built-in Helvetica (/F1, /F2).
const pdf = buildDocumentPDFBytes(params);

// ── 5. Write output ──────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, '03-thai.pdf');
writeFileSync(outPath, pdf);

process.stdout.write(`✓ Written: ${outPath}\n`);
process.stdout.write(`  Fonts used: Helvetica (Latin), Noto Sans Thai (/F3)\n`);
