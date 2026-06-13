#!/usr/bin/env node
// run-all.js — Cross-platform sample runner
//
// Renders every JSON sample in samples/render/**/*.json to
// samples/output/<category>/<name>.pdf, then reports a summary.
//
// Prerequisites:
//   - pdfnative-cli installed globally: npm install -g pdfnative-cli
//   - Node.js >= 20
//
// Usage (from the repo root):
//   node samples/run-all.js
//
// Flags:
//   --category <name>   Only process samples in samples/render/<name>/
//   --clean             Delete samples/output/ before running

import { spawnSync }      from 'node:child_process';
import { readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath }  from 'node:url';
import { dirname, join, basename, extname, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER_DIR = join(__dirname, 'render');
const OUTPUT_DIR = join(__dirname, 'output');

// Per-category extra CLI flags (v0.2.0+). Categories not listed here render with
// the default DocumentParams variant and no extra flags.
const CATEGORY_FLAGS = {
  'table-variant':   ['--variant', 'table'],
  'headers-footers': [
    '--header-left',   '{title}',
    '--header-right',  '{date}',
    '--footer-center', 'Page {page} of {pages}',
  ],
  encryption: [], // file-name-driven (see FILE_FLAGS): aes128 vs aes256 per file.
  attachments: [
    '--tagged',     'pdfa3b',
    '--attachment', join(__dirname, 'render', 'attachments', 'invoice.xml')
                    + ':application/xml:Source:Structured invoice payload',
  ],
  multilang: [], // file-name-driven; resolved below
  // v0.3.0+ font samples are file-name-driven (see FILE_FLAGS): each JSON in
  // font/ registers a different set of bundled fonts, so no category-wide flag
  // applies — e.g. 02-new-scripts.json must NOT inherit the Latin-only flags,
  // otherwise its non-Latin scripts render as .notdef tofu.
  font:     [],
};

// Categories whose JSON samples are intentionally skipped by run-all because
// they require multi-file orchestration or interactive input (e.g. --watch).
const SKIP_CATEGORIES = new Set(['watch', 'template']);

/** Per-file overrides (within a category). */
// Note: --lang <code> for non-Latin scripts requires the matching bundled font
// to be registered first via --font (see samples/render/font/ and
// samples/render/multilang/ for guidance). Each font/ sample registers exactly
// the fonts its content needs so it renders real glyphs out of the box.
const FILE_FLAGS = {
  // document/ — 06 caps the block ceiling as a large-report guard.
  '06-max-blocks.json': ['--max-blocks', '10000'],
  // font/ — each sample registers a different bundled font set.
  '01-latin.json': ['--font', 'latin', '--lang', 'latin'],
  '02-new-scripts.json': [
    '--font', 'te', '--font', 'si', '--font', 'km', '--font', 'my',
    '--font', 'bo', '--font', 'am', '--font', 'color-emoji',
    '--lang', 'te,si,km,my,bo,am,color-emoji',
  ],
  '03-emoji.json': ['--font', 'emoji', '--lang', 'emoji'],
  // encryption/ — algorithm differs per file (passwords come from CATEGORY_ENV).
  '01-aes128-protected.json': ['--encrypt-algorithm', 'aes128', '--encrypt-permissions', 'print'],
  '02-aes256-protected.json': ['--encrypt-algorithm', 'aes256', '--encrypt-permissions', 'print'],
  // watermark/ — 03 layers the stamp on entirely from the CLI.
  '03-cli-flags.json': [
    '--watermark-text', 'CONFIDENTIAL',
    '--watermark-opacity', '0.15',
    '--watermark-angle', '45',
    '--watermark-color', '#FF3B30',
    '--watermark-font-size', '64',
    '--watermark-position', 'background',
  ],
};

// Per-category env-var bootstrap (e.g. encryption passwords).
const CATEGORY_ENV = {
  encryption: {
    PDFNATIVE_ENCRYPT_OWNER_PASS: process.env.PDFNATIVE_ENCRYPT_OWNER_PASS ?? 'owner-secret',
    PDFNATIVE_ENCRYPT_USER_PASS:  process.env.PDFNATIVE_ENCRYPT_USER_PASS  ?? 'open-sesame',
  },
};

// ── CLI flags ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const categoryFilter = (() => {
  const i = argv.indexOf('--category');
  return i !== -1 ? argv[i + 1] : null;
})();
const doClean = argv.includes('--clean');

if (doClean && existsSync(OUTPUT_DIR)) {
  process.stdout.write('→ Cleaning samples/output/ …\n');
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Discover sample files ──────────────────────────────────────────────────

/** @type {{ category: string; input: string; output: string }[]} */
const jobs = [];

for (const category of readdirSync(RENDER_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)) {

  if (categoryFilter && category !== categoryFilter) continue;
  if (SKIP_CATEGORIES.has(category)) continue;

  const categoryDir = join(RENDER_DIR, category);
  const outCategoryDir = join(OUTPUT_DIR, category);
  mkdirSync(outCategoryDir, { recursive: true });

  for (const entry of readdirSync(categoryDir, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.json') continue;
    const stem = basename(entry.name, '.json');
    jobs.push({
      category,
      input:  join(categoryDir, entry.name),
      output: join(outCategoryDir, `${stem}.pdf`),
    });
  }
}

if (jobs.length === 0) {
  process.stderr.write('No JSON samples found.\n');
  process.exit(1);
}

// ── Run jobs ───────────────────────────────────────────────────────────────

const PAD = 52;
let passed = 0;
let failed = 0;

process.stdout.write(`\nRendering ${jobs.length} sample(s)…\n\n`);

for (const job of jobs) {
  const label = relative(__dirname, job.input).replace(/\\/g, '/');
  process.stdout.write(`  ${label.padEnd(PAD)}`);

  const extraCategoryFlags = CATEGORY_FLAGS[job.category] ?? [];
  const extraFileFlags     = FILE_FLAGS[basename(job.input)] ?? [];
  const env = {
    ...process.env,
    ...(CATEGORY_ENV[job.category] ?? {}),
  };
  const result = spawnSync(
    'pdfnative',
    ['render', '--input', job.input, '--output', job.output, ...extraCategoryFlags, ...extraFileFlags],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env,
    },
  );

  if (result.status === 0) {
    process.stdout.write('✓\n');
    passed++;
  } else {
    process.stdout.write('✗\n');
    const err = (result.stderr ?? '').trim();
    if (err) process.stderr.write(`    Error: ${err}\n`);
    failed++;
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

process.stdout.write(`\n${'─'.repeat(PAD + 4)}\n`);
process.stdout.write(`  ${passed} passed`);
if (failed > 0) process.stdout.write(`, ${failed} FAILED`);
process.stdout.write(`\n  Output: ${OUTPUT_DIR}\n\n`);

if (failed > 0) process.exit(1);

// ── Node.js driver scripts (multilang and similar) ─────────────────────────
//
// Some samples cannot be rendered by the pdfnative CLI alone because they
// require programmatic font loader registration (registerFonts) before the
// render call. These are implemented as standalone Node.js scripts that import
// pdfnative directly. They live alongside the JSON samples in their category.

/** @type {string[]} */
const NODE_DRIVER_DIRS = ['multilang'];

/** @type {{ script: string }[]} */
const driverJobs = [];

for (const category of NODE_DRIVER_DIRS) {
  if (categoryFilter && category !== categoryFilter) continue;

  const categoryDir = join(RENDER_DIR, category);
  if (!existsSync(categoryDir)) continue;

  for (const entry of readdirSync(categoryDir, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.js') continue;
    driverJobs.push({ script: join(categoryDir, entry.name) });
  }
}

if (driverJobs.length > 0) {
  process.stdout.write(`\nRunning ${driverJobs.length} Node.js driver script(s)…\n\n`);

  let driverPassed = 0;
  let driverFailed = 0;

  for (const job of driverJobs) {
    const label = relative(__dirname, job.script).replace(/\\/g, '/');
    process.stdout.write(`  ${label.padEnd(PAD)}`);

    const result = spawnSync('node', [job.script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    if (result.status === 0) {
      process.stdout.write('✓\n');
      driverPassed++;
    } else {
      process.stdout.write('✗\n');
      const err = (result.stderr ?? '').trim();
      if (err) process.stderr.write(`    Error: ${err}\n`);
      driverFailed++;
    }
  }

  process.stdout.write(`\n${'─'.repeat(PAD + 4)}\n`);
  process.stdout.write(`  ${driverPassed} passed`);
  if (driverFailed > 0) {
    process.stdout.write(`, ${driverFailed} FAILED`);
    process.stdout.write(`\n  Output: ${OUTPUT_DIR}\n\n`);
    process.exit(1);
  }
  process.stdout.write(`\n  Output: ${OUTPUT_DIR}\n\n`);
}
