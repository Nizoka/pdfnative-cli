#!/usr/bin/env node
// streaming/01-large-document.js
//
// Demonstrates streaming PDF generation via `pdfnative render --stream`.
// Builds a 200-section technical document in memory and pipes stdout
// directly to a file — never buffering the whole PDF in Node.js.
//
// Prerequisites:
//   - pdfnative-cli installed globally: npm install -g pdfnative-cli
//   - Node.js >= 20
//
// Usage:
//   node samples/streaming/01-large-document.js
//
// Output: samples/output/streaming/01-large-document.pdf

import { spawn }       from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..', '..');
const outDir    = join(rootDir, 'samples', 'output', 'streaming');

mkdirSync(outDir, { recursive: true });

const outFile = join(outDir, '01-large-document.pdf');

// ── Build a large document payload ─────────────────────────────────────────

const SECTION_COUNT = 200;

/** @returns {import('pdfnative').DocumentBlock[]} */
function buildBlocks() {
  /** @type {import('pdfnative').DocumentBlock[]} */
  const blocks = [
    { type: 'heading', text: 'Large Document — Streaming Demo', level: 1 },
    {
      type: 'paragraph',
      text: `This document contains ${SECTION_COUNT} sections generated programmatically. ` +
            'It demonstrates the streaming render path: the PDF is written incrementally ' +
            'to stdout and piped directly to disk without buffering the entire file in memory.',
    },
    { type: 'spacer', height: 16 },
    { type: 'toc', title: 'Contents', maxLevel: 2 },
    { type: 'pageBreak' },
  ];

  for (let i = 1; i <= SECTION_COUNT; i++) {
    blocks.push({ type: 'heading', text: `Section ${i}: Topic ${i}`, level: 2 });
    blocks.push({
      type: 'paragraph',
      text: `Section ${i} body. Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
            `Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua (section ${i}).`,
    });
    blocks.push({
      type: 'list',
      style: 'bullet',
      items: [
        `Item ${i}.A — First key point for section ${i}`,
        `Item ${i}.B — Second key point for section ${i}`,
        `Item ${i}.C — Third key point with additional context for section ${i}`,
      ],
    });
    if (i < SECTION_COUNT) {
      blocks.push({ type: 'spacer', height: 8 });
    }
  }

  return blocks;
}

/** @type {{ title: string; blocks: object[]; layout: object; footerText: string }} */
const payload = {
  title: 'Large Document — Streaming Demo',
  footerText: 'Streaming Demo — pdfnative-cli',
  layout: {
    compress: true,
    margins: { t: 40, r: 40, b: 40, l: 40 },
  },
  metadata: {
    author: 'pdfnative-cli',
    subject: `${SECTION_COUNT}-section streaming demonstration`,
    keywords: 'streaming, large, demo',
  },
  blocks: buildBlocks(),
};

const jsonInput = JSON.stringify(payload);

// ── Spawn the CLI with --stream ─────────────────────────────────────────────

process.stdout.write(`→ Streaming ${SECTION_COUNT} sections to ${outFile}…\n`);

const child = spawn('pdfnative', ['render', '--stream'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const output = createWriteStream(outFile);

child.stdout.pipe(output);

child.stdin.write(jsonInput);
child.stdin.end();

child.on('close', (code) => {
  if (code !== 0) {
    process.stderr.write(`pdfnative exited with code ${code}\n`);
    process.exit(1);
  }
  output.on('finish', () => {
    process.stdout.write(`  ✓ Written: ${outFile}\n`);
  });
});

child.on('error', (err) => {
  process.stderr.write(`Failed to start pdfnative: ${err.message}\n`);
  process.exit(1);
});
