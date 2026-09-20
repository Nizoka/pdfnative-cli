/**
 * Render every `samples/render/<category>/*.json` through the built CLI.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { REPO_ROOT, SAMPLE_CREATION_ISO, type GenerateContext } from '../helpers/io.js';
import { runCli } from '../helpers/cli.js';
import { planRenderJobs } from '../lib/sample-plan.js';

export interface GeneratorOptions {
    readonly cli: string;
    readonly category: string | null;
    /** Print each sample's stderr warnings (PDFA_* etc.) as they come. */
    readonly verbose: boolean;
}

export function generate(ctx: GenerateContext, opts: GeneratorOptions): void {
    const jobs = planRenderJobs({
        renderDir: join(REPO_ROOT, 'samples', 'render'),
        outputDir: ctx.outputDir,
        creationDate: SAMPLE_CREATION_ISO,
        category: opts.category,
    });
    for (const job of jobs) {
        mkdirSync(dirname(job.output), { recursive: true });
        const r = runCli(job.args, { env: job.env }, opts.cli);
        const label = `${job.category}/${job.file}`;
        if (r.status !== 0) {
            ctx.failed.push(label);
            process.stderr.write(`FAIL  render ${label}\n${r.stderr.trim().split(/\r?\n/).map((l) => `      ${l}`).join('\n')}\n`);
            continue;
        }
        if (opts.verbose && r.stderr.trim().length > 0) {
            // A silent warning is how a non-conformant "PDF/A" slips out.
            for (const line of r.stderr.trim().split(/\r?\n/)) process.stderr.write(`  ${label}: ${line}\n`);
        }
        ctx.record(job.output, relative(ctx.outputDir, job.output).split('\\').join('/'));
    }
}
