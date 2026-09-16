/**
 * The Node driver samples: samples/render/multilang/03-thai.js and
 * 04-multilingual.js import `pdfnative` directly (programmatic
 * registerFonts before the render). They honour PDFNATIVE_SAMPLES_OUT for
 * their output directory and SOURCE_DATE_EPOCH for the creation instant, so
 * the generator can route them into the reproducible corpus.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { REPO_ROOT, cliEnv, type GenerateContext } from '../helpers/io.js';

const DRIVER_DIRS = ['multilang'] as const;

export function generate(ctx: GenerateContext, category: string | null): void {
    for (const dir of DRIVER_DIRS) {
        if (category && category !== dir) continue;
        const categoryDir = join(REPO_ROOT, 'samples', 'render', dir);
        if (!existsSync(categoryDir)) continue;
        const outDir = join(ctx.outputDir, dir);
        mkdirSync(outDir, { recursive: true });
        for (const entry of readdirSync(categoryDir).sort()) {
            if (extname(entry) !== '.js') continue;
            const script = join(categoryDir, entry);
            const r = spawnSync(process.execPath, [script], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                windowsHide: true,
                env: cliEnv({ PDFNATIVE_SAMPLES_OUT: outDir }),
            });
            const label = `${dir}/${entry}`;
            if (r.status !== 0) {
                ctx.failed.push(label);
                process.stderr.write(`FAIL  driver ${label}\n${(r.stderr ?? '').trim()}\n`);
                continue;
            }
            const pdf = join(outDir, entry.replace(/\.js$/, '.pdf'));
            if (!existsSync(pdf)) {
                ctx.failed.push(label);
                process.stderr.write(`FAIL  driver ${label}: no PDF written at ${pdf}\n`);
                continue;
            }
            ctx.record(pdf, `${dir}/${entry.replace(/\.js$/, '.pdf')}`);
        }
    }
}
