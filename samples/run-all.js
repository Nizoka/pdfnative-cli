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

  const result = spawnSync('pdfnative', ['render', '--input', job.input, '--output', job.output], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

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
