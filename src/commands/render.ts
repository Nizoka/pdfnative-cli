import { watchFile, unwatchFile } from 'node:fs';
import { resolve as resolvePath, dirname, join as joinPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
    buildDocumentPDFBytes,
    buildDocumentPDFStream,
    buildDocumentPDFStreamPageByPage,
    buildPDFBytes,
    buildPDFStream,
    buildPDFStreamPageByPage,
    initNodeCompression,
    loadFontData,
    hasFontLoader,
    registerFont,
} from '../core-bridge/index.js';
import type {
    DocumentParams,
    PdfLayoutOptions,
    PdfParams,
    PdfColor,
    FontEntry,
} from '../core-bridge/index.js';
import {
    type ParsedArgs,
    getStringFlag,
    getStringFlagAll,
    getBoolFlag,
    hasFlag,
} from '../utils/args.js';
import {
    readFileOrStdin,
    writeOutput,
    writeStreamingOutput,
    assertJsonSizeLimit,
} from '../utils/io.js';
import { CliError } from '../utils/error.js';
import {
    buildLayoutOptions,
    assertStreamingCompatible,
} from '../utils/layout.js';

const VALID_VARIANTS = new Set(['document', 'table']);

/**
 * Allow-list of bundled font shortcuts exposed via `--font <name>`.
 * Each maps to a Noto-* data module shipped with pdfnative ≥ 1.1.0 under
 * its `fonts/` directory (which is not part of the package `exports` map,
 * so we resolve it via `package.json` and import a `file://` URL).
 *
 * Adding to this list is intentional (no auto-discovery) so the CLI surface
 * stays predictable and free from path-based RCE vectors.
 */
const BUNDLED_FONT_MODULES: Readonly<Record<string, string>> = Object.freeze({
    latin: 'noto-sans-data.js',
    emoji: 'noto-emoji-data.js',
});

let cachedFontsDir: string | null = null;
function resolveFontsDir(): string {
    if (cachedFontsDir !== null) return cachedFontsDir;
    const require = createRequire(import.meta.url);
    // pdfnative's package.json is not exported, but the main entry is. Resolve
    // the main entry (.../dist/index.js) and walk up two levels to the package
    // root, which contains the `fonts/` directory.
    const main = require.resolve('pdfnative');
    cachedFontsDir = joinPath(dirname(dirname(main)), 'fonts');
    return cachedFontsDir;
}

interface DocumentInputShape {
    readonly blocks?: unknown;
    readonly fontEntries?: unknown;
    readonly layout?: unknown;
}

/** Best-effort structural guard for `PdfParams` (table variant). */
function isPdfParamsLike(value: unknown): value is PdfParams {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.title === 'string' &&
        Array.isArray(v.headers) &&
        Array.isArray(v.rows)
    );
}

/** Best-effort structural guard for `DocumentParams`. */
function isDocumentParamsLike(value: unknown): value is DocumentParams {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as DocumentInputShape;
    return Array.isArray(v.blocks);
}

/** Detect TOC blocks (incompatible with --stream). */
function hasTocBlock(params: DocumentParams): boolean {
    for (const b of params.blocks) {
        const block = b as { type?: unknown };
        if (block.type === 'toc') return true;
    }
    return false;
}

// ── Smart-table defaults (pdfnative 1.2.0) ───────────────────────────────

/**
 * CLI-level defaults applied to every document `TableBlock` that does not
 * already specify the corresponding field. Block-level values always win, so
 * a JSON input remains authoritative; these flags only fill the gaps.
 *
 * Table-variant input (`--variant table`, `PdfParams`) does not carry these
 * per-block fields and is therefore unaffected.
 */
const VALID_TABLE_WRAP = new Set(['auto', 'always', 'never']);

interface TableDefaults {
    readonly wrap?: 'auto' | 'always' | 'never';
    readonly repeatHeader?: boolean;
    readonly zebra?: boolean | PdfColor;
    readonly minRowHeight?: number;
    readonly cellPadding?: number;
}

function parseNonNegativeNumber(value: string, flag: string): number {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
        throw new CliError(`Invalid --${flag} value "${value}". Expected a non-negative number.`, 2);
    }
    return n;
}

/** Parse the smart-table default flags, or return undefined when none are set. */
function parseTableDefaults(args: ParsedArgs): TableDefaults | undefined {
    const defaults: { -readonly [K in keyof TableDefaults]: TableDefaults[K] } = {};
    let any = false;

    const wrap = getStringFlag(args.flags, 'table-wrap');
    if (wrap !== undefined) {
        if (!VALID_TABLE_WRAP.has(wrap)) {
            throw new CliError(`Invalid --table-wrap "${wrap}". Valid: auto, always, never.`, 2);
        }
        defaults.wrap = wrap as 'auto' | 'always' | 'never';
        any = true;
    }

    const repeatHeader = getBoolFlag(args.flags, 'repeat-header');
    if (repeatHeader !== undefined) {
        defaults.repeatHeader = repeatHeader;
        any = true;
    }

    const zebraVal = args.flags['zebra'];
    if (zebraVal !== undefined) {
        if (typeof zebraVal === 'boolean') {
            defaults.zebra = zebraVal;
        } else {
            const s = (typeof zebraVal === 'string' ? zebraVal : (zebraVal[0] ?? '')).trim();
            const low = s.toLowerCase();
            if (low === '' || low === 'true' || low === 'on' || low === 'yes' || low === '1') {
                defaults.zebra = true;
            } else if (low === 'false' || low === 'off' || low === 'no' || low === '0') {
                defaults.zebra = false;
            } else {
                // Treat any other value as a PdfColor (e.g. "0.95 0.95 0.98").
                defaults.zebra = s as PdfColor;
            }
        }
        any = true;
    }

    const minRowHeight = getStringFlag(args.flags, 'min-row-height');
    if (minRowHeight !== undefined) {
        defaults.minRowHeight = parseNonNegativeNumber(minRowHeight, 'min-row-height');
        any = true;
    }

    const cellPadding = getStringFlag(args.flags, 'cell-padding');
    if (cellPadding !== undefined) {
        defaults.cellPadding = parseNonNegativeNumber(cellPadding, 'cell-padding');
        any = true;
    }

    return any ? defaults : undefined;
}

/**
 * Return a copy of `params` with the smart-table `defaults` merged into every
 * `TableBlock`. Block-level fields take precedence; only absent fields are
 * filled. Returns `params` unchanged when there are no table blocks.
 */
function applyTableDefaults(params: DocumentParams, defaults: TableDefaults): DocumentParams {
    let touched = false;
    const blocks = params.blocks.map((b) => {
        const block = b as { type?: unknown } & Record<string, unknown>;
        if (block.type !== 'table') return b;
        touched = true;
        const merged: Record<string, unknown> = { ...block };
        for (const [key, value] of Object.entries(defaults)) {
            if (merged[key] === undefined) merged[key] = value;
        }
        return merged as unknown as typeof b;
    });
    if (!touched) return params;
    return { ...params, blocks: blocks as DocumentParams['blocks'] };
}

/** Build font entries for bundled-language codes (e.g. th, ja, ar). */
async function buildFontEntriesForLangs(
    langs: readonly string[],
    nextRefStart: number,
): Promise<readonly FontEntry[]> {
    if (langs.length === 0) return [];
    const entries: FontEntry[] = [];
    let nextRef = nextRefStart;
    for (const lang of langs) {
        if (!hasFontLoader(lang)) {
            throw new CliError(
                `--lang "${lang}" is not a bundled pdfnative font. ` +
                'Use --font to register a bundled font shortcut, or register a loader programmatically.',
                2,
            );
        }
        const fontData = await loadFontData(lang);
        if (fontData === null) {
            throw new CliError(`Failed to load font data for --lang "${lang}".`, 1);
        }
        entries.push({ fontData, fontRef: `/F${nextRef}`, lang });
        nextRef++;
    }
    return entries;
}

/**
 * Register bundled font shortcuts from `--font` flags. Names are validated
 * against {@link BUNDLED_FONT_MODULES}. Idempotent across watch re-renders
 * (pdfnative's `registerFont` simply overwrites existing entries).
 */
async function applyFontFlags(fontFlags: readonly string[]): Promise<void> {
    if (fontFlags.length === 0) return;
    // Validate all names BEFORE touching the filesystem so unknown shortcuts
    // surface a CliError rather than a resolution error.
    const resolved: { name: string; fileName: string }[] = [];
    for (const raw of fontFlags) {
        const name = raw.trim().toLowerCase();
        if (name.length === 0) continue;
        const fileName = BUNDLED_FONT_MODULES[name];
        if (fileName === undefined) {
            const allowed = Object.keys(BUNDLED_FONT_MODULES).join(', ');
            throw new CliError(
                `--font "${raw}" is not a recognized bundled font. Allowed: ${allowed}.`,
                2,
            );
        }
        resolved.push({ name, fileName });
    }
    if (resolved.length === 0) return;
    const fontsDir = resolveFontsDir();
    for (const { name, fileName } of resolved) {
        const fileUrl = pathToFileURL(joinPath(fontsDir, fileName)).href;
        // The Noto data modules ARE the FontData shape (namespace import).
        registerFont(name, () => import(fileUrl) as Promise<never>);
    }
}

/**
 * Deep-merge `override` on top of `base`. Plain objects merge recursively;
 * arrays and primitives are replaced wholesale (override wins). Used by
 * `--template` to layer stdin / `--input` JSON over a template file.
 */
function deepMerge(base: unknown, override: unknown): unknown {
    if (!isPlainObject(base) || !isPlainObject(override)) return override;
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
        result[key] = key in base
            ? deepMerge(base[key], override[key])
            : override[key];
    }
    return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

interface RenderConfig {
    readonly variant: string;
    readonly useStream: boolean;
    readonly usePageStream: boolean;
    readonly inputPath: string | undefined;
    readonly outputPath: string | undefined;
    readonly langs: readonly string[];
    readonly layout: Partial<PdfLayoutOptions>;
    readonly tableDefaults: TableDefaults | undefined;
}

async function loadTemplate(templatePath: string): Promise<unknown> {
    const buf = await readFileOrStdin(templatePath);
    assertJsonSizeLimit(buf);
    try {
        return JSON.parse(buf.toString('utf8'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --template JSON: ${message}`, 1);
    }
}

/** Single render pass. Reused by both one-shot and watch loops. */
async function renderOnce(cfg: RenderConfig, template: unknown): Promise<void> {
    const inputBuf = await readFileOrStdin(cfg.inputPath);
    assertJsonSizeLimit(inputBuf);

    let parsedInput: unknown;
    try {
        parsedInput = JSON.parse(inputBuf.toString('utf8'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse JSON input: ${message}`, 1);
    }

    if (template !== undefined) {
        parsedInput = deepMerge(template, parsedInput);
    }

    if (cfg.variant === 'table') {
        if (!isPdfParamsLike(parsedInput)) {
            throw new CliError(
                'JSON input must be a PdfParams object (with title, headers, rows) when --variant table is used.',
                1,
            );
        }
        if (cfg.usePageStream) {
            const generator = buildPDFStreamPageByPage(parsedInput, cfg.layout);
            await writeStreamingOutput(generator, cfg.outputPath);
        } else if (cfg.useStream) {
            const generator = buildPDFStream(parsedInput, cfg.layout);
            await writeStreamingOutput(generator, cfg.outputPath);
        } else {
            const pdfBytes = buildPDFBytes(parsedInput, cfg.layout);
            await writeOutput(pdfBytes, cfg.outputPath);
        }
        return;
    }

    // variant === 'document'
    if (!isDocumentParamsLike(parsedInput)) {
        throw new CliError(
            'JSON input must be a DocumentParams object (with a "blocks" array).',
            1,
        );
    }

    let params: DocumentParams = parsedInput;

    if (cfg.tableDefaults !== undefined) {
        params = applyTableDefaults(params, cfg.tableDefaults);
    }

    if (cfg.langs.length > 0) {
        const existing = (params.fontEntries ?? []) as readonly FontEntry[];
        // /F1 = Helvetica, /F2 = Bold; user fonts start at /F3 + (existing count).
        const fontEntries = await buildFontEntriesForLangs(cfg.langs, 3 + existing.length);
        params = { ...params, fontEntries: [...existing, ...fontEntries] };
    }

    // Merge layout: params.layout (JSON-embedded, lowest priority) is the base;
    // CLI flags / --layout file (already in `layout`) override on top.
    // pdfnative uses `layoutOptions ?? params.layout` — an empty object from
    // the CLI side is not nullish, so params.layout would be silently dropped
    // without this explicit merge.
    const effectiveLayout: Partial<PdfLayoutOptions> =
        params.layout !== undefined && params.layout !== null
            ? { ...params.layout, ...cfg.layout }
            : cfg.layout;

    if (cfg.useStream && hasTocBlock(params)) {
        throw new CliError(
            '--stream is incompatible with TOC blocks (multi-pass pagination required).',
            2,
        );
    }

    if (cfg.usePageStream) {
        // Page-by-page streaming assembles the full PDF, then chunks it at PDF
        // object boundaries — so TOC blocks and {pages} placeholders are fully
        // supported (unlike single-pass --stream).
        const generator = buildDocumentPDFStreamPageByPage(params, effectiveLayout);
        await writeStreamingOutput(generator, cfg.outputPath);
    } else if (cfg.useStream) {
        const generator = buildDocumentPDFStream(params, effectiveLayout);
        await writeStreamingOutput(generator, cfg.outputPath);
    } else {
        const pdfBytes = buildDocumentPDFBytes(params, effectiveLayout);
        await writeOutput(pdfBytes, cfg.outputPath);
    }
}

export async function render(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const useStream = hasFlag(args.flags, 'stream');
    const usePageStream = hasFlag(args.flags, 'stream-page-by-page');
    const useWatch = hasFlag(args.flags, 'watch');
    const variant = getStringFlag(args.flags, 'variant') ?? 'document';
    const langsRaw = getStringFlag(args.flags, 'lang');
    const templatePath = getStringFlag(args.flags, 'template');
    const fontFlags = getStringFlagAll(args.flags, 'font');
    const tableDefaults = parseTableDefaults(args);

    if (!VALID_VARIANTS.has(variant)) {
        throw new CliError(
            `Invalid --variant "${variant}". Valid: document, table.`,
            2,
        );
    }

    if (useStream && usePageStream) {
        throw new CliError(
            'Use either --stream or --stream-page-by-page, not both.',
            2,
        );
    }

    if (useWatch) {
        if (inputPath === undefined) {
            throw new CliError('--watch requires --input <file> (cannot watch stdin).', 2);
        }
        if (outputPath === undefined || outputPath === '-') {
            throw new CliError('--watch requires --output <file> (cannot stream to stdout).', 2);
        }
    }

    const layout = await buildLayoutOptions(args);
    if (useStream) assertStreamingCompatible(layout);

    if (layout.compress === true) {
        // Required once per process for FlateDecode in Node ESM.
        await initNodeCompression();
    }

    // Register --font shortcuts before any --lang resolution happens.
    await applyFontFlags(fontFlags);

    const langs = langsRaw === undefined
        ? []
        : langsRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    const template = templatePath !== undefined ? await loadTemplate(templatePath) : undefined;

    const cfg: RenderConfig = {
        variant,
        useStream,
        usePageStream,
        inputPath,
        outputPath,
        langs,
        layout,
        tableDefaults,
    };

    // Initial render (always runs, even in --watch mode).
    await renderOnce(cfg, template);

    if (!useWatch || inputPath === undefined) return;

    // Watch loop: 200 ms debounce, stderr-only logs. Re-render errors are
    // reported and the watcher stays alive (renderOnce never escapes here).
    const absInput = resolvePath(inputPath);
    process.stderr.write(`watching ${absInput} (Ctrl+C to stop)\n`);

    let timer: NodeJS.Timeout | null = null;
    let busy = false;

    const onChange = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (busy) return;
            busy = true;
            const stamp = new Date().toISOString();
            renderOnce(cfg, template)
                .then(() => {
                    process.stderr.write(`[${stamp}] re-rendered ${outputPath ?? '-'}\n`);
                })
                .catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    process.stderr.write(`[${stamp}] render failed: ${msg}\n`);
                })
                .finally(() => {
                    busy = false;
                });
        }, 200);
    };

    watchFile(absInput, { interval: 200 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) onChange();
    });

    // Block until SIGINT/SIGTERM.
    await new Promise<void>((resolve) => {
        const stop = (): void => {
            unwatchFile(absInput);
            if (timer !== null) clearTimeout(timer);
            resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    });
}
