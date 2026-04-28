import {
    buildDocumentPDFBytes,
    buildDocumentPDFStream,
    buildPDFBytes,
    buildPDFStream,
    initNodeCompression,
    loadFontData,
    hasFontLoader,
} from '../core-bridge/index.js';
import type {
    DocumentParams,
    PdfLayoutOptions,
    PdfParams,
    FontEntry,
} from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
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

/** Build font entries for bundled-language codes (e.g. th, ja, ar). */
async function buildFontEntriesForLangs(
    langs: readonly string[],
): Promise<readonly FontEntry[]> {
    if (langs.length === 0) return [];
    const entries: FontEntry[] = [];
    let nextRef = 3; // /F1 = Helvetica, /F2 = Bold; user fonts start at /F3
    for (const lang of langs) {
        if (!hasFontLoader(lang)) {
            throw new CliError(
                `--lang "${lang}" is not a bundled pdfnative font. ` +
                'Register a loader programmatically before invoking the CLI to use a custom font.',
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

export async function render(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const useStream = hasFlag(args.flags, 'stream');
    const variant = getStringFlag(args.flags, 'variant') ?? 'document';
    const langsRaw = getStringFlag(args.flags, 'lang');

    if (!VALID_VARIANTS.has(variant)) {
        throw new CliError(
            `Invalid --variant "${variant}". Valid: document, table.`,
            2,
        );
    }

    const layout = await buildLayoutOptions(args);
    if (useStream) assertStreamingCompatible(layout);

    if (layout.compress === true) {
        // Required once per process for FlateDecode in Node ESM.
        await initNodeCompression();
    }

    const inputBuf = await readFileOrStdin(inputPath);
    assertJsonSizeLimit(inputBuf);

    let parsedInput: unknown;
    try {
        parsedInput = JSON.parse(inputBuf.toString('utf8'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse JSON input: ${message}`, 1);
    }

    if (variant === 'table') {
        if (!isPdfParamsLike(parsedInput)) {
            throw new CliError(
                'JSON input must be a PdfParams object (with title, headers, rows) when --variant table is used.',
                1,
            );
        }
        if (useStream) {
            const generator = buildPDFStream(parsedInput, layout);
            await writeStreamingOutput(generator, outputPath);
        } else {
            const pdfBytes = buildPDFBytes(parsedInput, layout);
            await writeOutput(pdfBytes, outputPath);
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

    // --lang: append bundled font entries (merged with any from JSON).
    if (langsRaw !== undefined) {
        const langs = langsRaw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const fontEntries = await buildFontEntriesForLangs(langs);
        const existing = (params.fontEntries ?? []) as readonly FontEntry[];
        params = { ...params, fontEntries: [...existing, ...fontEntries] };
    }

    // Merge layout: params.layout (JSON-embedded, lowest priority) is the base;
    // CLI flags / --layout file (already in `layout`) override on top.
    // This is required because pdfnative uses `layoutOptions ?? params.layout` —
    // an empty object ({}) from the CLI side is not nullish, so params.layout
    // would be silently dropped without this explicit merge.
    const effectiveLayout: Partial<PdfLayoutOptions> =
        params.layout !== undefined && params.layout !== null
            ? { ...params.layout, ...layout }
            : layout;

    if (useStream && hasTocBlock(params)) {
        throw new CliError(
            '--stream is incompatible with TOC blocks (multi-pass pagination required).',
            2,
        );
    }

    if (useStream) {
        const generator = buildDocumentPDFStream(params, effectiveLayout);
        await writeStreamingOutput(generator, outputPath);
    } else {
        const pdfBytes = buildDocumentPDFBytes(params, effectiveLayout);
        await writeOutput(pdfBytes, outputPath);
    }
}
