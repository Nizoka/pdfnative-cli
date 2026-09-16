#!/usr/bin/env tsx
/**
 * pdfnative-cli — Sample corpus generator (v1.5.0)
 * =================================================
 * Drives the BUILT CLI (`node dist/cli.cjs …`, never a globally installed
 * binary) to write every sample into `test-output/samples/` (git-ignored):
 *   1. every `samples/render/<category>/*.json` with the flags of
 *      scripts/lib/sample-plan.ts,
 *   2. the Node driver samples (samples/render/multilang/*.js),
 *   3. the outputs the other commands derive from those renders (page tree,
 *      annotate, fill, metadata, encrypt, sign — scripts/generators/derived.ts).
 *
 * Reproducible: TZ=UTC (helpers/tz.ts), every render pinned with
 * `--creation-date` and SOURCE_DATE_EPOCH, deterministic passwords and the
 * committed test key pair. `npm run verify:samples` then holds the corpus to
 * tests/regression/baselines/samples.sha256.json.
 *
 * Usage:
 *   npm run build && npm run test:generate           # summary line (quiet outside a TTY)
 *   npx tsx scripts/generate-samples.ts --verbose    # the table + each sample's warnings
 *   npx tsx scripts/generate-samples.ts --json       # machine-readable summary
 *   npx tsx scripts/generate-samples.ts --category typography
 *   PDFNATIVE_CLI=/path/to/cli.cjs npx tsx scripts/generate-samples.ts   # another build
 *
 * Exit codes:
 *   0 — every sample written
 *   1 — at least one CLI invocation failed (each is reported; the run continues)
 *   2 — dist/cli.cjs missing, or bad usage
 */

// Must be first: pins process.env.TZ before anything formats a PDF date.
import './helpers/tz.js';

import { existsSync, rmSync } from 'node:fs';

import { createContext, parseOutputMode, printSummary, OUTPUT_DIR } from './helpers/io.js';
import { requireDist } from './helpers/cli.js';
import { generate as generateRender } from './generators/render.js';
import { generate as generateDrivers } from './generators/drivers.js';
import { generate as generateDerived } from './generators/derived.js';

function main(): number {
    const argv = process.argv.slice(2);
    let category: string | null = null;
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--category') {
            category = argv[i + 1] ?? null;
            if (category === null || category.startsWith('--')) {
                process.stderr.write('--category needs a name (a directory under samples/render/, or page-tree, annotate, fill, metadata, encrypt, sign).\n');
                return 2;
            }
            i++;
        } else {
            rest.push(argv[i] as string);
        }
    }
    const mode = parseOutputMode(rest);
    if ('error' in mode) {
        process.stderr.write(`${mode.error}\n`);
        return 2;
    }
    const cli = requireDist();
    const started = Date.now();

    // A stale sample from an earlier layout must never be fingerprinted as
    // this run's: start from an empty corpus (a category filter keeps the rest).
    if (category === null && existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
    const ctx = createContext(OUTPUT_DIR);

    generateRender(ctx, { cli, category, verbose: !mode.quiet });
    generateDrivers(ctx, category);
    generateDerived(ctx, cli, category);

    printSummary(ctx.results, ctx.outputDir, {
        quiet: mode.quiet,
        json: mode.json,
        seconds: (Date.now() - started) / 1000,
        failed: ctx.failed,
    });
    return ctx.failed.length === 0 ? 0 : 1;
}

process.exit(main());
