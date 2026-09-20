#!/usr/bin/env tsx
/**
 * pdfnative-cli — conformance corpus generator (PDF/A + PDF/X, v1.5.0)
 * ======================================================================
 * Drives the BUILT CLI (`node dist/cli.cjs …`) — never a globally installed
 * `pdfnative` binary — to produce a small, deterministic corpus of
 * conformance-claiming documents under `test-output/pdfa/`, covering the
 * PDF/A- and PDF/X-relevant command surface (render + PDF/A samples,
 * attachments, header/footer templates, outline, watermark, table variant,
 * sign, metadata, PDF/X-4 print, annotate). It is a representative sample,
 * not an exhaustive feature matrix. `scripts/validate-pdfa.ts` then runs the
 * PDF/A files through veraPDF and `scripts/validate-pdfx.ts` runs the PDF/X
 * files through pdfnative's validatePdfX().
 *
 * The table itself lives in scripts/lib/pdfa-corpus.ts.
 *
 * Usage:  npm run build && npm run corpus:pdfa
 *         npx tsx scripts/generate-pdfa-corpus.ts [--quiet | --verbose] [--json]
 * Exit:   0 when every file was written, 1 at the first CLI invocation that
 *         fails (its stderr is reproduced), 2 when dist/cli.cjs is missing or
 *         on bad usage.
 *
 * Reproducible: TZ=UTC (helpers/tz.ts), every date pinned, fixture signing
 * key — the manifest records each file's sha256 so a byte change is visible.
 */

// Must be first: pins process.env.TZ before anything formats a PDF date.
import './helpers/tz.js';

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { REPO_ROOT, parseOutputMode } from './helpers/io.js';
import { requireDist, runCli } from './helpers/cli.js';
import { CORPUS, OUT_DIR } from './lib/pdfa-corpus.js';
import type { CorpusFile, CorpusManifest } from './lib/verapdf.js';

function main(): number {
    const mode = parseOutputMode(process.argv.slice(2));
    if ('error' in mode) {
        process.stderr.write(`${mode.error}\n`);
        return 2;
    }
    const { quiet, json } = mode;
    const say = (s: string): void => { if (!json && !quiet) process.stdout.write(`${s}\n`); };

    const cli = requireDist();
    mkdirSync(OUT_DIR, { recursive: true });
    // Prune PDFs left over from an older corpus layout so the validator's
    // "unlisted file" note only ever points at something unexpected. Only
    // top-level *.pdf files are pruned — manifest.json, .specs/ and reports/
    // are never touched.
    const current = new Set(CORPUS.map((e) => e.file));
    for (const stale of readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf') && !current.has(f))) {
        rmSync(join(OUT_DIR, stale));
        say(`  pruned ${stale}`);
    }

    const out = (file: string): string => join(OUT_DIR, file);
    const files: CorpusFile[] = [];
    let totalBytes = 0;
    const started = Date.now();

    for (const entry of CORPUS) {
        entry.before?.();
        const r = runCli(entry.args(out), { env: entry.env?.() }, cli);
        if (r.status !== 0) {
            process.stderr.write(`FAIL  ${entry.file}\n`);
            for (const l of r.stderr.trim().split(/\r?\n/)) process.stderr.write(`      ${l}\n`);
            return 1;
        }
        const dest = out(entry.file);
        if (!existsSync(dest)) {
            process.stderr.write(`FAIL  ${entry.file}\n      CLI exited 0 but wrote no file at ${relative(REPO_ROOT, dest)}.\n`);
            return 1;
        }
        const bytes = readFileSync(dest);
        if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
            process.stderr.write(`FAIL  ${entry.file}\n      output does not start with %PDF-.\n`);
            return 1;
        }
        totalBytes += bytes.length;
        const compliant = entry.expectCompliant !== false;
        const record: CorpusFile = {
            file: entry.file,
            command: entry.command,
            bytes: statSync(dest).size,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            expectPdfAClaim: entry.claims === 'pdfa',
            expectCompliant: entry.claims === 'pdfa' && compliant,
            expectPdfXClaim: entry.claims === 'pdfx',
            expectPdfXCompliant: entry.claims === 'pdfx' && compliant,
        };
        files.push(record);
        const tag = entry.claims === 'none' ? 'no claim' : `${entry.claims === 'pdfa' ? 'PDF/A' : 'PDF/X'}${compliant ? '' : ', NEGATIVE canary'}`;
        say(`  wrote  ${entry.file.padEnd(28)} ${String(bytes.length).padStart(8)} B  (${tag})`);
    }

    const manifest: CorpusManifest = { generatedBy: 'scripts/generate-pdfa-corpus.ts', files };
    writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const pdfa = files.filter((f) => f.expectPdfAClaim);
    const pdfx = files.filter((f) => f.expectPdfXClaim);
    const seconds = (Date.now() - started) / 1000;
    if (json) {
        process.stdout.write(`${JSON.stringify({
            generated: files.length, bytes: totalBytes, seconds,
            pdfa: { claiming: pdfa.length, negatives: pdfa.filter((f) => !f.expectCompliant).length },
            pdfx: { claiming: pdfx.length, negatives: pdfx.filter((f) => !f.expectPdfXCompliant).length },
            outputDir: OUT_DIR, files,
        }, null, 2)}\n`);
    } else {
        process.stdout.write(
            `Conformance corpus: ${files.length} file(s), ${totalBytes} bytes, ${seconds.toFixed(1)} s — `
            + `${pdfa.length} PDF/A (${pdfa.filter((f) => !f.expectCompliant).length} negative), `
            + `${pdfx.length} PDF/X (${pdfx.filter((f) => !f.expectPdfXCompliant).length} negative) → test-output/pdfa/\n`,
        );
    }
    return 0;
}

process.exit(main());
