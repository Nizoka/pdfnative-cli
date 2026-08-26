import { watchFile, unwatchFile } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath, dirname, isAbsolute, join as joinPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
    buildDocumentPDFBytes,
    buildDocumentPDFStream,
    buildDocumentPDFStreamPageByPage,
    buildDocumentPDFStreamTrue,
    buildPDFBytes,
    buildPDFStream,
    buildPDFStreamPageByPage,
    buildPDFStreamTrue,
    initNodeCompression,
    loadFontData,
    hasFontLoader,
    registerFont,
    inspectDocumentLayout,
} from '../core-bridge/index.js';
import type {
    DocumentParams,
    PdfLayoutOptions,
    PdfParams,
    PdfColor,
    FontEntry,
    OutlineItem,
    PdfDiagnosticHandler,
    StreamOptions,
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
    validatePath,
} from '../utils/io.js';
import { parseChunkSize } from '../utils/pdfops.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun, isJsonMode } from '../utils/agent.js';
import { serializeJson } from '../utils/projection.js';
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
    // Latin + monochrome / COLRv1 colour emoji
    latin: 'noto-sans-data.js',
    emoji: 'noto-emoji-data.js',
    'color-emoji': 'noto-color-emoji-data.js',
    // Mathematical / technical symbols (pdfnative ≥ 1.5.0). Code points in the
    // math operator / geometric-shape blocks are auto-routed to this font.
    math: 'noto-sans-math-data.js',
    // 22 Unicode scripts (pdfnative ≥ 1.3.0). The shortcut name doubles as the
    // `--lang` code; pdfnative routes each code point to the font whose cmap
    // covers it, so any registered script font is used automatically.
    ar: 'noto-arabic-data.js',
    hy: 'noto-armenian-data.js',
    bn: 'noto-bengali-data.js',
    ru: 'noto-cyrillic-data.js',
    hi: 'noto-devanagari-data.js',
    am: 'noto-ethiopic-data.js',
    ka: 'noto-georgian-data.js',
    el: 'noto-greek-data.js',
    he: 'noto-hebrew-data.js',
    ja: 'noto-jp-data.js',
    km: 'noto-khmer-data.js',
    ko: 'noto-kr-data.js',
    my: 'noto-myanmar-data.js',
    pl: 'noto-polish-data.js',
    zh: 'noto-sc-data.js',
    si: 'noto-sinhala-data.js',
    ta: 'noto-tamil-data.js',
    te: 'noto-telugu-data.js',
    th: 'noto-thai-data.js',
    bo: 'noto-tibetan-data.js',
    tr: 'noto-turkish-data.js',
    vi: 'noto-vietnamese-data.js',
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

// ── Conformance diagnostics + build-error mapping (pdfnative 1.7.0) ──────

/** True when the global `--quiet`/`-q` flag is active (set by index.ts). */
function isQuiet(): boolean {
    return process.env['PDFNATIVE_QUIET'] === '1';
}

/** One diagnostic captured for the `--json` status envelope. */
interface CollectedDiagnostic {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
}

/**
 * Map errors thrown by pdfnative's builders to stable CLI error codes:
 *   - strict-mode PDF/A diagnostic escalations (prefixed `pdfnative: ` by
 *     `createDiagnosticEmitter`, thrown before the first output byte) →
 *     exit 1 / `E_CHECK_FAILED` — a conformance check failed, by request.
 *   - option-validation errors (`print.*` from validatePrintOptions —
 *     including `print.userUnit` under pdfa1b — `chart:` from the chart
 *     validators, `outputIntent.*` from the ICC profile guard) →
 *     exit 1 / `E_INPUT` — the input JSON/layout asked for something invalid.
 *   - anything else is rethrown unchanged (envelope default: `E_RUNTIME`).
 */
function mapBuildError(e: unknown, strict: boolean): never {
    if (e instanceof CliError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    if (strict && message.startsWith('pdfnative:')) {
        throw new CliError(message, 1, ErrorCode.CHECK_FAILED);
    }
    if (
        message.startsWith('print.') ||
        message.startsWith('chart:') ||
        message.startsWith('outputIntent.')
    ) {
        throw new CliError(message, 1, ErrorCode.INPUT);
    }
    throw e instanceof Error ? e : new Error(message);
}

// ── Image-block payload resolution (CLI JSON convenience) ────────────────

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decode an image block `dataBase64` payload; invalid base64 → E_INPUT. */
function decodeImageBase64(b64: string): Uint8Array {
    const cleaned = b64.replace(/\s+/g, '');
    if (cleaned.length === 0 || cleaned.length % 4 !== 0 || !BASE64_RE.test(cleaned)) {
        throw new CliError(
            'Invalid base64 payload in image block "dataBase64".',
            1,
            ErrorCode.INPUT,
        );
    }
    const buf = Buffer.from(cleaned, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Resolve document `image` blocks whose payload arrives as a file path
 * (`src`), base64 (`dataBase64`), or a JSON number array (`data`) into the
 * `data: Uint8Array` shape pdfnative's `ImageBlock` requires. `src` and
 * `dataBase64` are removed from the block after resolution.
 *
 * Security: `src` is only ever read from the user's own local input JSON —
 * the same trust model as `--attachment <path>` — and passes through the
 * same `validatePath` traversal guard. Relative paths resolve against the
 * directory of the `--input` file (or the cwd when reading stdin).
 *
 * `DocumentBlock` has no nested block containers (list items nest text, not
 * blocks), so a flat pass over `params.blocks` covers every image block.
 */
async function resolveImageBlocks(
    params: DocumentParams,
    baseDir: string,
): Promise<DocumentParams> {
    let touched = false;
    const blocks: unknown[] = [];
    for (const b of params.blocks) {
        const block = b as { type?: unknown } & Record<string, unknown>;
        if (block.type !== 'image' || block.data instanceof Uint8Array) {
            blocks.push(b);
            continue;
        }
        const { src, dataBase64, data } = block;
        const resolved: Record<string, unknown> = { ...block };
        delete resolved.src;
        delete resolved.dataBase64;
        if (Array.isArray(data)) {
            // JSON round-trip of a Uint8Array — revive it.
            resolved.data = Uint8Array.from(data as number[]);
        } else if (typeof dataBase64 === 'string') {
            if (typeof src === 'string') {
                throw new CliError(
                    'Image block cannot carry both "src" and "dataBase64" — provide a single payload source.',
                    1,
                    ErrorCode.INPUT,
                );
            }
            resolved.data = decodeImageBase64(dataBase64);
        } else if (typeof src === 'string') {
            validatePath(src);
            const abs = isAbsolute(src) ? src : resolvePath(baseDir, src);
            try {
                const buf = await readFile(abs);
                resolved.data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new CliError(
                    `Failed to read image block src "${src}": ${msg}`,
                    1,
                    ErrorCode.IO,
                );
            }
        } else {
            throw new CliError(
                'Image block requires a payload: "data" (byte array), "dataBase64" (base64 string), or "src" (image file path).',
                1,
                ErrorCode.INPUT,
            );
        }
        touched = true;
        blocks.push(resolved);
    }
    if (!touched) return params;
    return { ...params, blocks: blocks as unknown as DocumentParams['blocks'] };
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
    readonly useStreamTrue: boolean;
    readonly inputPath: string | undefined;
    readonly outputPath: string | undefined;
    readonly langs: readonly string[];
    readonly layout: Partial<PdfLayoutOptions>;
    readonly tableDefaults: TableDefaults | undefined;
    readonly outline: readonly OutlineItem[] | 'auto' | undefined;
    readonly inspectLayout: boolean;
    readonly pretty: boolean;
    readonly dryRun: boolean;
    /** `--chunk-size` (bytes) for --stream / --stream-true StreamOptions. */
    readonly chunkSize: number | undefined;
}

/** Parse `--outline`: `auto` selects heading-derived bookmarks; any other value
 *  is a path to a JSON file holding an `OutlineItem[]` tree. */
async function loadOutline(
    spec: string,
): Promise<readonly OutlineItem[] | 'auto'> {
    if (spec.trim().toLowerCase() === 'auto') return 'auto';
    const buf = await readFileOrStdin(spec);
    assertJsonSizeLimit(buf);
    let parsed: unknown;
    try {
        parsed = JSON.parse(buf.toString('utf8'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --outline JSON: ${message}`, 1, ErrorCode.PARSE);
    }
    if (!Array.isArray(parsed)) {
        throw new CliError(
            '--outline file must be a JSON array of OutlineItem objects (or use --outline auto).',
            1,
            ErrorCode.INPUT,
        );
    }
    return parsed as readonly OutlineItem[];
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

    // Conformance diagnostics (pdfnative 1.7.0): always install a sink so
    // warnings reach stderr (never console.warn) and the --json envelope.
    // JSON layouts cannot carry functions, so this never clobbers user config.
    // In strict mode the library ignores the handler — diagnostics throw
    // before the first output byte instead (mapped to E_CHECK_FAILED below).
    const diagnostics: CollectedDiagnostic[] = [];
    const onDiagnostic: PdfDiagnosticHandler = (d) => {
        diagnostics.push({ code: d.code, severity: d.severity, message: d.message });
        if (!isQuiet()) {
            process.stderr.write(`warning: [${d.code}] ${d.message}\n`);
        }
    };
    const diagnosticsField = (): Record<string, unknown> =>
        diagnostics.length > 0 ? { diagnostics } : {};

    // --chunk-size → StreamOptions for the single-pass streaming builders.
    const streamOpts: StreamOptions | undefined =
        cfg.chunkSize !== undefined ? { chunkSize: cfg.chunkSize } : undefined;

    if (cfg.variant === 'table') {
        if (!isPdfParamsLike(parsedInput)) {
            throw new CliError(
                'JSON input must be a PdfParams object (with title, headers, rows) when --variant table is used.',
                1,
                ErrorCode.INPUT,
            );
        }
        if (cfg.dryRun) {
            emitStatus({ command: 'render', variant: 'table', dryRun: true, output: cfg.outputPath ?? '-' });
            return;
        }
        const tableLayout: Partial<PdfLayoutOptions> = { ...cfg.layout, onDiagnostic };
        let bytes: number | null = null;
        try {
            if (cfg.usePageStream) {
                const generator = buildPDFStreamPageByPage(parsedInput, tableLayout);
                await writeStreamingOutput(generator, cfg.outputPath);
            } else if (cfg.useStreamTrue) {
                const generator = buildPDFStreamTrue(parsedInput, tableLayout, streamOpts);
                await writeStreamingOutput(generator, cfg.outputPath);
            } else if (cfg.useStream) {
                const generator = buildPDFStream(parsedInput, tableLayout, streamOpts);
                await writeStreamingOutput(generator, cfg.outputPath);
            } else {
                const pdfBytes = buildPDFBytes(parsedInput, tableLayout);
                bytes = pdfBytes.length;
                await writeOutput(pdfBytes, cfg.outputPath);
            }
        } catch (e) {
            mapBuildError(e, tableLayout.strict === true);
        }
        emitStatus({
            command: 'render', variant: 'table', dryRun: false,
            output: cfg.outputPath ?? '-', bytes,
            ...diagnosticsField(),
        });
        return;
    }

    // variant === 'document'
    if (!isDocumentParamsLike(parsedInput)) {
        throw new CliError(
            'JSON input must be a DocumentParams object (with a "blocks" array).',
            1,
            ErrorCode.INPUT,
        );
    }

    let params: DocumentParams = parsedInput;

    if (cfg.tableDefaults !== undefined) {
        params = applyTableDefaults(params, cfg.tableDefaults);
    }

    // Image blocks: resolve `src` / `dataBase64` / number-array payloads to
    // the `data: Uint8Array` the builder expects. Relative `src` paths are
    // resolved against the --input file's directory (cwd for stdin input).
    const imageBaseDir = cfg.inputPath !== undefined
        ? dirname(resolvePath(cfg.inputPath))
        : process.cwd();
    params = await resolveImageBlocks(params, imageBaseDir);

    // --outline (pdfnative 1.4.0 bookmarks). Flag wins over any JSON-embedded
    // outline so the CLI stays authoritative.
    if (cfg.outline !== undefined) {
        params = { ...params, outline: cfg.outline as DocumentParams['outline'] };
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
    // without this explicit merge. A `strict` set in the user's JSON survives
    // (the CLI only ever layers `strict: true` on top, never `false`).
    const effectiveLayout: Partial<PdfLayoutOptions> = {
        ...(params.layout ?? {}),
        ...cfg.layout,
        onDiagnostic,
    };

    // --inspect-layout (pdfnative 1.5.0): emit the deterministic layout report
    // as JSON instead of rendering a PDF. A read-only pre-flight for agents.
    if (cfg.inspectLayout) {
        let report: unknown;
        try {
            report = inspectDocumentLayout(params, effectiveLayout);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new CliError(`Failed to inspect layout: ${message}`, 1, ErrorCode.INPUT);
        }
        const pretty = cfg.pretty || !isJsonMode();
        await writeOutput(
            new TextEncoder().encode(serializeJson(report, pretty) + '\n'),
            cfg.outputPath,
        );
        emitStatus({ command: 'render', variant: 'document', inspectLayout: true, output: cfg.outputPath ?? '-' });
        return;
    }

    if (cfg.useStream && hasTocBlock(params)) {
        throw new CliError(
            '--stream is incompatible with TOC blocks (multi-pass pagination required).',
            2,
        );
    }
    if (cfg.useStreamTrue && hasTocBlock(params)) {
        throw new CliError(
            '--stream-true is incompatible with TOC blocks (multi-pass pagination required).',
            2,
        );
    }

    if (cfg.dryRun) {
        emitStatus({ command: 'render', variant: 'document', dryRun: true, output: cfg.outputPath ?? '-' });
        return;
    }

    let bytes: number | null = null;
    try {
        if (cfg.usePageStream) {
            // Page-by-page streaming assembles the full PDF, then chunks it at PDF
            // object boundaries — so TOC blocks and {pages} placeholders are fully
            // supported (unlike single-pass --stream).
            const generator = buildDocumentPDFStreamPageByPage(params, effectiveLayout);
            await writeStreamingOutput(generator, cfg.outputPath);
        } else if (cfg.useStreamTrue) {
            // True constant-memory streaming: parts are emitted and freed as they
            // go, so the joined binary never materialises. Same constraints as
            // --stream (no TOC, no {pages}); byte-identical to buildDocumentPDFBytes.
            const generator = buildDocumentPDFStreamTrue(params, effectiveLayout, streamOpts);
            await writeStreamingOutput(generator, cfg.outputPath);
        } else if (cfg.useStream) {
            const generator = buildDocumentPDFStream(params, effectiveLayout, streamOpts);
            await writeStreamingOutput(generator, cfg.outputPath);
        } else {
            const pdfBytes = buildDocumentPDFBytes(params, effectiveLayout);
            bytes = pdfBytes.length;
            await writeOutput(pdfBytes, cfg.outputPath);
        }
    } catch (e) {
        mapBuildError(e, effectiveLayout.strict === true);
    }
    emitStatus({
        command: 'render', variant: 'document', dryRun: false,
        output: cfg.outputPath ?? '-', bytes,
        ...diagnosticsField(),
    });
}

export async function render(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const useStream = hasFlag(args.flags, 'stream');
    const usePageStream = hasFlag(args.flags, 'stream-page-by-page');
    const useStreamTrue = hasFlag(args.flags, 'stream-true');
    const useWatch = hasFlag(args.flags, 'watch');
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();
    const variant = getStringFlag(args.flags, 'variant') ?? 'document';
    const langsRaw = getStringFlag(args.flags, 'lang');
    const templatePath = getStringFlag(args.flags, 'template');
    const fontFlags = getStringFlagAll(args.flags, 'font');
    const tableDefaults = parseTableDefaults(args);
    const outlineSpec = getStringFlag(args.flags, 'outline');
    const inspectLayout = hasFlag(args.flags, 'inspect-layout');
    const pretty = hasFlag(args.flags, 'pretty');
    const strict = hasFlag(args.flags, 'strict');
    const chunkSize = parseChunkSize(getStringFlag(args.flags, 'chunk-size'));

    if (!VALID_VARIANTS.has(variant)) {
        throw new CliError(
            `Invalid --variant "${variant}". Valid: document, table.`,
            2,
        );
    }

    if ([useStream, usePageStream, useStreamTrue].filter(Boolean).length > 1) {
        throw new CliError(
            'Use only one of --stream, --stream-page-by-page, or --stream-true.',
            2,
        );
    }

    // --chunk-size targets the single-pass streaming builders (StreamOptions).
    // Page-by-page streaming cuts chunks at PDF object boundaries by design,
    // so a byte-size override would be a silent no-op — reject it explicitly.
    if (chunkSize !== undefined && usePageStream) {
        throw new CliError(
            '--chunk-size is not supported with --stream-page-by-page (chunks are cut at PDF object boundaries). Use --stream or --stream-true.',
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

    let layout = await buildLayoutOptions(args);
    // --strict only ever layers `strict: true` on top — a `strict` already set
    // in a --layout file (or the input JSON's `layout`) is never overwritten.
    if (strict) layout = { ...layout, strict: true };
    if (useStream || useStreamTrue) assertStreamingCompatible(layout);

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
    const outline = outlineSpec !== undefined ? await loadOutline(outlineSpec) : undefined;

    if (inspectLayout && variant !== 'document') {
        throw new CliError('--inspect-layout is only available for the document variant.', 2);
    }

    const cfg: RenderConfig = {
        variant,
        useStream,
        usePageStream,
        useStreamTrue,
        inputPath,
        outputPath,
        langs,
        layout,
        tableDefaults,
        outline,
        inspectLayout,
        pretty,
        dryRun,
        chunkSize,
    };

    // Initial render (always runs, even in --watch mode).
    await renderOnce(cfg, template);

    if (dryRun || !useWatch || inputPath === undefined) return;

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
