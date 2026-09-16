/**
 * pdfnative-cli — the sample plan (pure)
 * =======================================
 * Which `samples/render/**\/*.json` documents are rendered, with which flags
 * and environment. One table, consumed by scripts/generate-samples.ts and
 * unit-tested in tests/tools/sample-plan.test.ts, so the baseline in
 * tests/regression/baselines/samples.sha256.json and the documented sample
 * recipes cannot drift apart. (Until v1.5.0 this table lived in
 * samples/run-all.js, which spawned a globally installed binary through a
 * shell; the generator now drives dist/cli.cjs directly.)
 */

import { readdirSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/**
 * Per-category extra CLI flags. Categories not listed here render with the
 * default DocumentParams variant and no extra flags.
 */
export const CATEGORY_FLAGS: Readonly<Record<string, readonly string[]>> = {
    'table-variant': ['--variant', 'table'],
    'headers-footers': [
        '--header-left', '{title}',
        '--header-right', '{date}',
        '--footer-center', 'Page {page} of {pages}',
    ],
    // pdfa / attachments: PDF/A conformance requires embedded fonts (ISO 19005
    // §6.2.11.4.1 / §6.3.4) — --font latin --lang latin embeds the bundled
    // Latin font; without it the claim fails veraPDF (PDFA_NO_FONT_ENTRIES).
    pdfa: ['--font', 'latin', '--lang', 'latin'],
    attachments: [
        '--tagged', 'pdfa3b',
        '--font', 'latin',
        '--lang', 'latin',
        // The payload path is filled in by the planner (absolute, per checkout).
    ],
    // v1.5.0 — typography needs a registered font for kerning, OpenType
    // features and the narrow no-break space of the French preset.
    typography: ['--font', 'latin', '--lang', 'latin'],
    // v1.5.0 — the reproducible pair prints the pinned {date}.
    reproducible: ['--header-right', '{date}'],
};

/**
 * Categories whose JSON samples are intentionally skipped: they require
 * multi-file orchestration or interactive input (e.g. --watch).
 */
export const SKIP_CATEGORIES: ReadonlySet<string> = new Set(['watch', 'template']);

/**
 * Individual JSON files that are *not* renderable documents through the
 * plain CLI pass: an OutlineItem[] tree consumed by --outline, and the two
 * multilang documents their Node driver scripts render (samples/render/
 * multilang/03-thai.js, 04-multilingual.js — see scripts/generators/drivers.ts).
 */
export const SKIP_FILES: ReadonlySet<string> = new Set(['02-outline-tree.json', '03-thai.json', '04-multilingual.json']);

/** Per-file overrides (within a category). */
export const FILE_FLAGS: Readonly<Record<string, readonly string[]>> = {
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
    // font/04 — the five scripts pdfnative 1.8.0 added (v1.5.0).
    '04-new-scripts-1.8.json': [
        '--font', 'lo', '--font', 'nod', '--font', 'khb', '--font', 'tdd', '--font', 'cjm', '--font', 'latin',
        '--lang', 'lo,nod,khb,tdd,cjm,latin',
    ],
    // multilang/ — 01/02 through the CLI (03/04 are driver-rendered).
    '01-thai.json': ['--font', 'th', '--font', 'latin', '--lang', 'th,latin'],
    '02-japanese.json': ['--font', 'ja', '--font', 'latin', '--lang', 'ja,latin'],
    '05-lao.json': ['--font', 'lo', '--font', 'latin', '--lang', 'lo,latin'],
    '06-tai-tham-cham.json': ['--font', 'nod', '--font', 'khb', '--font', 'tdd', '--font', 'cjm', '--font', 'latin', '--lang', 'nod,khb,tdd,cjm,latin'],
    '07-african-latin.json': ['--font', 'latin', '--lang', 'ha,yo,ig,sw'],
    // outline/ — 01 derives bookmarks from headings via --outline auto.
    '01-headings.json': ['--outline', 'auto'],
    // math/ — register the bundled math font so symbols render as real glyphs.
    '01-math.json': ['--font', 'latin', '--font', 'math'],
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
    // print/ — 05 is the PDF/X-4 press file (v1.5.0): output profile, fonts
    // embedded, trapping state known, strict so a regression fails loudly.
    '05-pdfx4.json': [
        '--pdfx', 'pdfx4',
        '--output-intent-id', 'Synthetic CMYK (pdfnative test profile)',
        '--trapped', 'false',
        '--font', 'latin', '--lang', 'latin',
        '--strict',
        // --output-intent-icc is filled in by the planner (absolute path).
    ],
};

/**
 * Files that must NOT receive the planner's `--creation-date` flag: their
 * point is to prove the SOURCE_DATE_EPOCH fallback alone pins the bytes.
 */
export const ENV_PINNED_FILES: ReadonlySet<string> = new Set(['02-source-date-epoch.json']);

/**
 * Deterministic passwords for the encryption samples. The fingerprint lib
 * (scripts/lib/sample-fingerprint.ts ENCRYPTED_SAMPLES) opens the files with
 * these; a change here is a rebaseline.
 */
export const PASSWORDS = {
    owner: 'sample-owner',
    user: 'sample-user',
    rotatedOwner: 'rotated-owner',
    mergedOwner: 'merged-owner',
} as const;

/** Per-category child environment. */
export const CATEGORY_ENV: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    encryption: {
        PDFNATIVE_ENCRYPT_OWNER_PASS: PASSWORDS.owner,
        PDFNATIVE_ENCRYPT_USER_PASS: PASSWORDS.user,
    },
};

export interface RenderJob {
    readonly category: string;
    /** File name of the JSON document (`01-minimal.json`). */
    readonly file: string;
    readonly input: string;
    /** `test-output/samples/<category>/<stem>.pdf` */
    readonly output: string;
    /** The full CLI argv, `render` included. */
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
}

export interface PlanOptions {
    readonly renderDir: string;
    readonly outputDir: string;
    /** ISO instant passed as --creation-date (except ENV_PINNED_FILES). */
    readonly creationDate: string;
    /** Only this category (a `--category` filter), or null. */
    readonly category?: string | null;
}

/** Discover every renderable sample and build its invocation. */
export function planRenderJobs(opts: PlanOptions): RenderJob[] {
    const jobs: RenderJob[] = [];
    if (!existsSync(opts.renderDir)) return jobs;
    const categories = readdirSync(opts.renderDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    for (const category of categories) {
        if (opts.category && category !== opts.category) continue;
        if (SKIP_CATEGORIES.has(category)) continue;
        const categoryDir = join(opts.renderDir, category);
        const files = readdirSync(categoryDir, { withFileTypes: true })
            .filter((e) => e.isFile() && extname(e.name) === '.json' && !SKIP_FILES.has(e.name))
            .map((e) => e.name)
            .sort();
        for (const file of files) {
            const stem = basename(file, '.json');
            const input = join(categoryDir, file);
            const output = join(opts.outputDir, category, `${stem}.pdf`);
            const args = ['render', '--input', input, '--output', output, ...(CATEGORY_FLAGS[category] ?? []), ...(FILE_FLAGS[file] ?? [])];
            if (category === 'attachments') {
                args.push('--attachment', `${join(opts.renderDir, 'attachments', 'invoice.xml')}:application/xml:Source:Structured invoice payload`);
            }
            if (file === '05-pdfx4.json') {
                args.push('--output-intent-icc', join(opts.renderDir, 'print', 'synthetic-cmyk.icc'));
            }
            if (!ENV_PINNED_FILES.has(file)) args.push('--creation-date', opts.creationDate);
            jobs.push({ category, file, input, output, args, env: CATEGORY_ENV[category] ?? {} });
        }
    }
    return jobs;
}
