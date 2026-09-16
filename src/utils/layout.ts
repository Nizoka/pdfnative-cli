// Layout utilities for the `render` command.
//
// Implements the hybrid layout model: high-frequency knobs are CLI flags,
// the full PdfLayoutOptions surface is reachable via --layout <file.json>.
// Precedence: CLI flags > layout file > pdfnative defaults.

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import {
    PDF_A_CONFORMANCE_TARGETS,
    PDF_X_CONFORMANCE_TARGETS,
} from '../core-bridge/index.js';
import type {
    PdfLayoutOptions,
    PageTemplate,
    WatermarkOptions,
    EncryptionOptions,
    PdfAttachment,
    PdfAttachmentRelationship,
    LayoutDebugOptions,
    TypographyOptions,
    CustomOutputIntent,
    PdfXConformanceTarget,
} from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag, getBoolFlag } from './args.js';
import { validatePath, readBinaryFile, readBinaryFileCapped, assertJsonSizeLimit } from './io.js';
import { CliError, ErrorCode, deprecate } from './error.js';
import {
    normalizeEncryptAlgo,
    readEncryptTrigger,
    parsePermissions,
    firstNonEmpty,
} from './pdfops.js';
import { parseIsoDate } from './reproducible.js';

/**
 * Tagged-mode values accepted by the `--tagged` flag.
 *
 * The PDF/A targets are sourced from pdfnative's `PDF_A_CONFORMANCE_TARGETS`
 * constant (single source of truth) so the CLI never drifts from the set of
 * conformance levels the renderer actually supports.
 */
export const VALID_TAGGED = ['none', ...PDF_A_CONFORMANCE_TARGETS] as const;
export type TaggedValue = (typeof VALID_TAGGED)[number];

/** PDF/X targets accepted by `--pdfx` (pdfnative 1.8.0 `PDF_X_CONFORMANCE_TARGETS`). */
export const VALID_PDFX: readonly string[] = [...PDF_X_CONFORMANCE_TARGETS];

/** Size cap for an ICC profile passed via --output-intent-icc (press profiles are a few MB). */
export const MAX_ICC_PROFILE_BYTES = 16 * 1024 * 1024;

/**
 * The layout keys that are objects a caller may spread across two layers
 * (a document's `layout`, a `--layout` file, the flags). They merge one
 * level deep instead of replacing each other, so a `typography` object in
 * the document JSON survives a `--kerning` flag. Kept to the two objects
 * v1.5.0 adds flags for; `print`, `viewerPreferences` and the rest keep
 * their replace semantics (byte-identical to 1.4.0).
 */
export const NESTED_LAYOUT_KEYS: readonly string[] = ['typography', 'outputIntent'];

/** Built-in named page sizes (points). Matches pdfnative `PAGE_SIZES`. */
const NAMED_PAGE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
    a4:      [595.28, 841.89],
    letter:  [612.00, 792.00],
    legal:   [612.00, 1008.00],
    a3:      [841.89, 1190.55],
    tabloid: [792.00, 1224.00],
    a5:      [419.53, 595.28],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Revive the values JSON cannot carry natively in a layout object, and strip
 * the ones the CLI never accepts from JSON:
 *   - `attachments[].data` is removed — binary payloads must come from
 *     `--attachment <path>` so the path guard applies (no data injection).
 *   - `outputIntent.iccProfile` number[] → Uint8Array (pdfnative validates
 *     the ICC header — `acsp` signature, size field, colour space — before
 *     embedding; ICC profiles are not executable payloads).
 *   - `creationDate` ISO string → Date (pdfnative 1.8.0 pins the creation
 *     instant, the `{date}` placeholder and the trailer /ID from it).
 * Applied to a `--layout` file AND to the document JSON's `layout` key, so
 * both routes behave the same.
 */
export function reviveLayoutJson(input: Record<string, unknown>): Record<string, unknown> {
    const obj: Record<string, unknown> = { ...input };
    if (Array.isArray(obj.attachments)) {
        obj.attachments = obj.attachments.map((a): unknown => {
            if (typeof a !== 'object' || a === null) return a;
            const rest = { ...(a as Record<string, unknown>) };
            delete rest.data;
            return rest;
        });
    }
    const oi = obj.outputIntent;
    if (isPlainObject(oi) && Array.isArray(oi.iccProfile)) {
        obj.outputIntent = { ...oi, iccProfile: Uint8Array.from(oi.iccProfile as readonly number[]) };
    }
    if (typeof obj.creationDate === 'string') {
        const date = new Date(obj.creationDate);
        if (Number.isNaN(date.getTime())) {
            throw new CliError(
                `layout.creationDate "${obj.creationDate}" is not an ISO 8601 instant.`,
                1,
                ErrorCode.INPUT,
            );
        }
        obj.creationDate = date;
    }
    return obj;
}

/**
 * Load a `Partial<PdfLayoutOptions>` JSON file from disk.
 * Returns an empty object when no path is provided.
 *
 * Validates path against directory traversal, the 50 MB JSON cap and the
 * JSON shape (must be an object), then revives the JSON-only values.
 */
export async function loadLayoutFile(
    filePath: string | undefined,
): Promise<Partial<PdfLayoutOptions>> {
    if (filePath === undefined) return {};
    validatePath(filePath);
    let raw: Buffer;
    try {
        raw = await readFile(filePath);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read --layout file: ${msg}`, 1);
    }
    assertJsonSizeLimit(raw);
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.toString('utf8'));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --layout JSON: ${msg}`, 1);
    }
    if (!isPlainObject(parsed)) {
        throw new CliError('--layout file must contain a JSON object.', 1);
    }
    return reviveLayoutJson(parsed) as Partial<PdfLayoutOptions>;
}

/**
 * Layer `override` on top of `base`: the keys in {@link NESTED_LAYOUT_KEYS}
 * merge one level deep when both sides are objects; every other key is
 * replaced by the override (the historical shallow-spread semantics).
 */
export function mergeNestedLayout(
    base: Partial<PdfLayoutOptions>,
    override: Partial<PdfLayoutOptions>,
): Partial<PdfLayoutOptions> {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>), ...(override as Record<string, unknown>) };
    const b = base as Record<string, unknown>;
    const o = override as Record<string, unknown>;
    for (const key of NESTED_LAYOUT_KEYS) {
        if (isPlainObject(b[key]) && isPlainObject(o[key])) {
            out[key] = { ...b[key], ...o[key] };
        }
    }
    return out as Partial<PdfLayoutOptions>;
}

/** Parse the `--debug-layout` flag into `PdfLayoutOptions.debug`, or undefined.
 *  Bare `--debug-layout` → `true` (full overlay). A value is a comma list of
 *  `margins` / `content` / `cells` mapping to the LayoutDebugOptions boxes. */
function parseDebugLayout(args: ParsedArgs): boolean | LayoutDebugOptions | undefined {
    const raw = args.flags['debug-layout'];
    if (raw === undefined) return undefined;
    if (typeof raw === 'boolean') return raw ? true : undefined;
    const value = (typeof raw === 'string' ? raw : (raw[0] ?? '')).trim();
    if (value === '' || value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return undefined;
    const opts: { -readonly [K in keyof LayoutDebugOptions]: LayoutDebugOptions[K] } = {};
    for (const token of value.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)) {
        if (token === 'margins') opts.showMargins = true;
        else if (token === 'content' || token === 'bounds') opts.showContentBounds = true;
        else if (token === 'cells') opts.showCells = true;
        else {
            throw new CliError(
                `Invalid --debug-layout token "${token}". Valid: margins, content, cells.`,
                2,
            );
        }
    }
    return opts;
}

/** Parse `WxH` (e.g. `595.28x841.89`) into `[w, h]` or return null. */
function parsePageSizePair(value: string): readonly [number, number] | null {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(value.trim());
    if (m === null) return null;
    return [Number.parseFloat(m[1] as string), Number.parseFloat(m[2] as string)];
}

/** Parse `--page-size` into `{ pageWidth, pageHeight }`. */
function parsePageSize(value: string): { pageWidth: number; pageHeight: number } {
    const lower = value.toLowerCase();
    const named = NAMED_PAGE_SIZES[lower];
    if (named !== undefined) {
        return { pageWidth: named[0], pageHeight: named[1] };
    }
    const pair = parsePageSizePair(value);
    if (pair !== null) {
        return { pageWidth: pair[0], pageHeight: pair[1] };
    }
    const valid = Object.keys(NAMED_PAGE_SIZES).join(', ');
    throw new CliError(
        `Invalid --page-size value "${value}". Expected one of: ${valid}, or WxH (points).`,
        2,
    );
}

/** Parse `--margin` (uniform N or `t,r,b,l`). */
function parseMargin(value: string): { t: number; r: number; b: number; l: number } {
    const parts = value.split(',').map((p) => p.trim());
    const nums = parts.map((p) => {
        const n = Number.parseFloat(p);
        if (!Number.isFinite(n) || n < 0) {
            throw new CliError(`Invalid --margin value "${value}".`, 2);
        }
        return n;
    });
    if (nums.length === 1) {
        const v = nums[0] as number;
        return { t: v, r: v, b: v, l: v };
    }
    if (nums.length === 4) {
        return {
            t: nums[0] as number,
            r: nums[1] as number,
            b: nums[2] as number,
            l: nums[3] as number,
        };
    }
    throw new CliError(`Invalid --margin "${value}". Expected N or T,R,B,L.`, 2);
}

/** Parse `--tagged` into a `PdfLayoutOptions['tagged']` value. */
function parseTagged(value: string): PdfLayoutOptions['tagged'] {
    const v = value.toLowerCase();
    if (v === 'none') return false;
    if ((VALID_TAGGED as readonly string[]).includes(v)) {
        return v as Exclude<TaggedValue, 'none'>;
    }
    throw new CliError(
        `Invalid --tagged value "${value}". Valid: ${VALID_TAGGED.join(', ')}.`,
        2,
    );
}

/** Convert deprecated `--conformance 1b|2b|3b` to a `--tagged` value. */
function conformanceToTagged(value: string): PdfLayoutOptions['tagged'] {
    const validShort = new Set(['1b', '2b', '3b']);
    if (!validShort.has(value)) {
        throw new CliError(
            `Invalid --conformance value "${value}". Valid: 1b, 2b, 3b.`,
            2,
        );
    }
    return ('pdfa' + value) as Exclude<TaggedValue, 'none'>;
}

/**
 * Parse `--pdfx [target]` (pdfnative 1.8.0). A bare flag selects the only
 * target, `pdfx4`; `none` clears a target inherited from the layout file.
 */
export function parsePdfx(raw: string | boolean): PdfXConformanceTarget | false {
    if (raw === true) return 'pdfx4';
    if (raw === false) return false;
    const v = raw.trim().toLowerCase();
    if (v === '' ) return 'pdfx4';
    if (v === 'none') return false;
    if (VALID_PDFX.includes(v)) return v as PdfXConformanceTarget;
    throw new CliError(`Invalid --pdfx value "${raw}". Valid: ${VALID_PDFX.join(', ')}, none.`, 2);
}

/** Parse `--trapped true|false|unknown` into the /Info /Trapped name. */
export function parseTrapped(raw: string): 'True' | 'False' | 'Unknown' {
    const v = raw.trim().toLowerCase();
    if (v === 'true') return 'True';
    if (v === 'false') return 'False';
    if (v === 'unknown') return 'Unknown';
    throw new CliError(`Invalid --trapped value "${raw}". Valid: true, false, unknown.`, 2);
}

interface HeaderFooterFlags {
    readonly left?: string;
    readonly center?: string;
    readonly right?: string;
}

function buildPageTemplate(parts: HeaderFooterFlags): PageTemplate | undefined {
    if (parts.left === undefined && parts.center === undefined && parts.right === undefined) {
        return undefined;
    }
    const tpl: { -readonly [K in keyof PageTemplate]: PageTemplate[K] } = {};
    if (parts.left !== undefined) tpl.left = parts.left;
    if (parts.center !== undefined) tpl.center = parts.center;
    if (parts.right !== undefined) tpl.right = parts.right;
    return tpl;
}

/**
 * Build encryption options from CLI flags (or env vars for passwords).
 *
 * Two flag vocabularies are accepted, so `render` matches merge/split/extract:
 *   - Unified (preferred): `--encrypt [aes-128|aes-256]`, `--owner-password`,
 *     `--user-password`, `--permissions`.
 *   - Legacy (still supported): `--encrypt-algorithm`, `--encrypt-owner-pass`,
 *     `--encrypt-user-pass`, `--encrypt-permissions`.
 * Env vars ($PDFNATIVE_ENCRYPT_OWNER_PASS / _USER_PASS) win over both; an empty
 * value is treated as absent. The unified value wins over the legacy alias.
 */
function buildEncryptionFromFlags(args: ParsedArgs): EncryptionOptions | undefined {
    const { enabled: encryptTriggered, algoRaw: unifiedAlgo } = readEncryptTrigger(args.flags);
    const legacyAlgo = getStringFlag(args.flags, 'encrypt-algorithm');
    const permsRaw = firstNonEmpty(
        getStringFlag(args.flags, 'permissions'),
        getStringFlag(args.flags, 'encrypt-permissions'),
    );
    const owner = firstNonEmpty(
        process.env.PDFNATIVE_ENCRYPT_OWNER_PASS,
        getStringFlag(args.flags, 'owner-password'),
        getStringFlag(args.flags, 'encrypt-owner-pass'),
    );
    const user = firstNonEmpty(
        process.env.PDFNATIVE_ENCRYPT_USER_PASS,
        getStringFlag(args.flags, 'user-password'),
        getStringFlag(args.flags, 'encrypt-user-pass'),
    );

    const requested =
        encryptTriggered ||
        legacyAlgo !== undefined ||
        owner !== undefined ||
        user !== undefined ||
        permsRaw !== undefined;
    if (!requested) return undefined;

    if (owner === undefined) {
        throw new CliError(
            'Encryption requires an owner password. Provide --owner-password <pass> or $PDFNATIVE_ENCRYPT_OWNER_PASS.',
            2,
        );
    }
    const opts: { -readonly [K in keyof EncryptionOptions]: EncryptionOptions[K] } = {
        ownerPassword: owner,
        algorithm: normalizeEncryptAlgo(unifiedAlgo ?? legacyAlgo),
    };
    if (user !== undefined) opts.userPassword = user;
    const perms = parsePermissions(permsRaw);
    if (perms !== undefined) opts.permissions = perms;
    return opts;
}

/** Build watermark options from CLI flags. */
async function buildWatermarkFromFlags(
    args: ParsedArgs,
): Promise<WatermarkOptions | undefined> {
    const text = getStringFlag(args.flags, 'watermark-text');
    const opacity = getStringFlag(args.flags, 'watermark-opacity');
    const angle = getStringFlag(args.flags, 'watermark-angle');
    const color = getStringFlag(args.flags, 'watermark-color');
    const fontSize = getStringFlag(args.flags, 'watermark-font-size');
    const imagePath = getStringFlag(args.flags, 'watermark-image');
    const position = getStringFlag(args.flags, 'watermark-position');

    if (
        text === undefined &&
        imagePath === undefined &&
        opacity === undefined &&
        angle === undefined &&
        color === undefined &&
        fontSize === undefined &&
        position === undefined
    ) {
        return undefined;
    }

    const wm: { -readonly [K in keyof WatermarkOptions]: WatermarkOptions[K] } = {};

    if (text !== undefined) {
        const t: Record<string, unknown> = { text };
        if (opacity !== undefined) t.opacity = parseUnit(opacity, 'watermark-opacity', 0, 1);
        if (angle !== undefined) t.angle = parseFloatFlag(angle, 'watermark-angle');
        // PdfColor passes through as given: hex, "r g b", or a CMYK "c m y k"
        // operand string (pdfnative 1.8.0 parses four values as DeviceCMYK).
        if (color !== undefined) t.color = color;
        if (fontSize !== undefined) t.fontSize = parseFloatFlag(fontSize, 'watermark-font-size');
        wm.text = t as unknown as WatermarkOptions['text'];
    }
    if (imagePath !== undefined) {
        const data = await readBinaryFile(imagePath);
        const img: Record<string, unknown> = { data };
        if (opacity !== undefined && text === undefined) {
            img.opacity = parseUnit(opacity, 'watermark-opacity', 0, 1);
        }
        wm.image = img as unknown as WatermarkOptions['image'];
    }
    if (position !== undefined) {
        if (position !== 'background' && position !== 'foreground') {
            throw new CliError(
                `Invalid --watermark-position "${position}". Valid: background, foreground.`,
                2,
            );
        }
        wm.position = position;
    }
    return wm;
}

function parseFloatFlag(value: string, flag: string): number {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) {
        throw new CliError(`Invalid --${flag} value "${value}".`, 2);
    }
    return n;
}

function parseUnit(value: string, flag: string, min: number, max: number): number {
    const n = parseFloatFlag(value, flag);
    if (n < min || n > max) {
        throw new CliError(`--${flag} must be between ${min} and ${max} (got ${value}).`, 2);
    }
    return n;
}

/** Load PDF/A-3 attachments from `--attachment <path>` (repeatable). */
async function loadAttachmentsFromFlags(
    args: ParsedArgs,
): Promise<readonly PdfAttachment[] | undefined> {
    const paths = getStringFlagAll(args.flags, 'attachment');
    if (paths.length === 0) return undefined;
    const out: PdfAttachment[] = [];
    for (const raw of paths) {
        // Syntax: <path>[:mime[:relationship[:description]]]
        //
        // Windows paths start with a drive letter followed by a colon (e.g. C:\…).
        // A naïve split(':') would truncate the path at the drive-letter colon.
        // Guard: if the first token is a single ASCII letter we are looking at a
        // Windows drive letter — re-join it with the next token before extracting
        // the optional mime/rel/desc parts.
        const parts = raw.split(':');
        let pathPart = parts[0] ?? '';
        let offset = 1;

        if (pathPart.length === 1 && /^[A-Za-z]$/.test(pathPart) && parts.length > 1) {
            // Re-join drive letter with the rest of the path segment.
            pathPart = `${pathPart}:${parts[1] ?? ''}`;
            offset = 2;
        }

        if (pathPart.length === 0) {
            throw new CliError(`Invalid --attachment value "${raw}".`, 2);
        }

        const mimePart = parts[offset];
        const relPart  = parts[offset + 1];
        const descPart = parts[offset + 2];

        const data = await readBinaryFile(pathPart);
        const filename = pathPart.split(/[/\\]/).pop() ?? 'attachment';
        const mime = mimePart && mimePart.length > 0 ? mimePart : 'application/octet-stream';
        const att: { -readonly [K in keyof PdfAttachment]: PdfAttachment[K] } = {
            filename,
            data,
            mimeType: mime,
        };
        if (relPart !== undefined && relPart.length > 0) {
            att.relationship = relPart as PdfAttachmentRelationship;
        }
        if (descPart !== undefined && descPart.length > 0) {
            att.description = descPart;
        }
        out.push(att);
    }
    return out;
}

/**
 * Build `layout.outputIntent` from `--output-intent-icc <file.icc>` and
 * `--output-intent-id <string>` (pdfnative 1.8.0: RGB, CMYK or Gray
 * profiles; PDF/X-4 needs a `prtr` output profile). The ICC bytes are
 * size-capped here and header-validated by the engine (`acsp` signature,
 * size field, colour space). Merges into an outputIntent inherited from the
 * layout file: only the fields given as flags are replaced.
 */
async function buildOutputIntentFromFlags(
    args: ParsedArgs,
    existing: CustomOutputIntent | undefined,
): Promise<CustomOutputIntent | undefined> {
    const iccPath = getStringFlag(args.flags, 'output-intent-icc');
    const id = getStringFlag(args.flags, 'output-intent-id');
    if (iccPath === undefined && id === undefined) return existing;
    if (iccPath === undefined && existing === undefined) {
        throw new CliError('--output-intent-id needs an ICC profile: pass --output-intent-icc <file.icc> (or outputIntent.iccProfile in --layout).', 2);
    }
    const out: { -readonly [K in keyof CustomOutputIntent]: CustomOutputIntent[K] } = {
        ...(existing ?? { iccProfile: new Uint8Array(0), outputConditionIdentifier: '' }),
    };
    if (iccPath !== undefined) {
        out.iccProfile = await readBinaryFileCapped(iccPath, MAX_ICC_PROFILE_BYTES, 'ICC profile');
        if (id === undefined && (existing?.outputConditionIdentifier === undefined || existing.outputConditionIdentifier === '')) {
            out.outputConditionIdentifier = basename(iccPath, extname(iccPath));
        }
    }
    if (id !== undefined) {
        if (id.trim().length === 0) throw new CliError('--output-intent-id must not be empty.', 2);
        out.outputConditionIdentifier = id.trim();
    }
    return out;
}

const FONT_FEATURE_TAG = /^[a-z0-9]{4}$/i;

/**
 * The high-frequency typography flags (pdfnative 1.8.0 `layout.typography`).
 * Everything else — widows/orphans counts, unit binding, punctuation
 * spacing, optical margins, metrics, hyphenation language — is reachable
 * through `layout.typography` in the document JSON or a --layout file.
 */
export function buildTypographyFromFlags(args: ParsedArgs): Partial<TypographyOptions> | undefined {
    const out: { -readonly [K in keyof TypographyOptions]: TypographyOptions[K] } = {};
    let any = false;
    const split = getBoolFlag(args.flags, 'split-paragraphs');
    if (split !== undefined) { out.splitParagraphs = split; any = true; }
    const keep = getBoolFlag(args.flags, 'keep-headings-with-next');
    if (keep !== undefined) { out.keepHeadingsWithNext = keep; any = true; }
    const kerning = getBoolFlag(args.flags, 'kerning');
    if (kerning !== undefined) { out.kerning = kerning; any = true; }
    const features = getStringFlag(args.flags, 'font-features');
    if (features !== undefined) {
        const tags = features.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        if (tags.length === 0) throw new CliError('--font-features expects a comma-separated list of OpenType feature tags (e.g. onum,smcp).', 2);
        for (const tag of tags) {
            if (!FONT_FEATURE_TAG.test(tag)) {
                throw new CliError(`Invalid --font-features tag "${tag}": an OpenType feature tag is four ASCII letters or digits (e.g. tnum, onum, smcp).`, 2);
            }
        }
        out.fontFeatures = tags.map((t) => t.toLowerCase());
        any = true;
    }
    return any ? out : undefined;
}

/**
 * Compose the final `Partial<PdfLayoutOptions>` for a render invocation.
 *
 * Order of precedence (low → high): pdfnative defaults → --layout file → CLI flags.
 * Throws CliError on invalid combinations (e.g. encryption + tagged, pdfx + tagged).
 */
export async function buildLayoutOptions(
    args: ParsedArgs,
): Promise<Partial<PdfLayoutOptions>> {
    const layoutPath = getStringFlag(args.flags, 'layout');
    const fromFile = await loadLayoutFile(layoutPath);
    const out: Record<string, unknown> = { ...fromFile };

    // --page-size
    const pageSize = getStringFlag(args.flags, 'page-size');
    if (pageSize !== undefined) {
        const { pageWidth, pageHeight } = parsePageSize(pageSize);
        out.pageWidth = pageWidth;
        out.pageHeight = pageHeight;
    }

    // --margin
    const margin = getStringFlag(args.flags, 'margin');
    if (margin !== undefined) {
        out.margins = parseMargin(margin);
    }

    // --compress
    if (hasFlag(args.flags, 'compress')) {
        out.compress = true;
    }

    // --debug-layout (pdfnative 1.5.0 layout.debug overlay). A bare flag turns
    // on the full overlay; a comma list selects boxes: margins, content, cells.
    const debug = parseDebugLayout(args);
    if (debug !== undefined) {
        out.debug = debug;
    }

    // --max-blocks (pdfnative 1.3.0 layout.maxBlocks; default DEFAULT_MAX_BLOCKS = 100000)
    const maxBlocks = getStringFlag(args.flags, 'max-blocks');
    if (maxBlocks !== undefined) {
        const n = Number.parseInt(maxBlocks, 10);
        if (!Number.isInteger(n) || n <= 0 || String(n) !== maxBlocks.trim()) {
            throw new CliError(
                `Invalid --max-blocks value "${maxBlocks}". Expected a positive integer.`,
                2,
            );
        }
        out.maxBlocks = n;
    }

    // --creation-date (v1.5.0, reproducible output). The flag wins over a
    // creationDate in the layout file; SOURCE_DATE_EPOCH is applied
    // process-wide by the dispatcher and therefore ranks below the file.
    const creationDate = getStringFlag(args.flags, 'creation-date');
    if (creationDate !== undefined) {
        out.creationDate = parseIsoDate(creationDate, 'creation-date');
    }

    // --tagged / deprecated --conformance
    const tagged = getStringFlag(args.flags, 'tagged');
    const conformance = getStringFlag(args.flags, 'conformance');
    if (tagged !== undefined && conformance !== undefined) {
        throw new CliError(
            'Use either --tagged or --conformance, not both. Prefer --tagged.',
            2,
        );
    }
    if (tagged !== undefined) {
        out.tagged = parseTagged(tagged);
    } else if (conformance !== undefined) {
        deprecate('conformance', '--tagged pdfa<level>');
        out.tagged = conformanceToTagged(conformance);
    }

    // --pdfx [pdfx4] (pdfnative 1.8.0 PDF/X-4 claim)
    const pdfxRaw = args.flags['pdfx'];
    if (pdfxRaw !== undefined) {
        const target = parsePdfx(typeof pdfxRaw === 'boolean' ? pdfxRaw : (typeof pdfxRaw === 'string' ? pdfxRaw : (pdfxRaw[0] ?? '')));
        if (target === false) delete out.pdfx;
        else out.pdfx = target;
    }

    // --header-* / --footer-*
    const header = buildPageTemplate({
        left: getStringFlag(args.flags, 'header-left'),
        center: getStringFlag(args.flags, 'header-center'),
        right: getStringFlag(args.flags, 'header-right'),
    });
    if (header !== undefined) out.headerTemplate = header;

    const footer = buildPageTemplate({
        left: getStringFlag(args.flags, 'footer-left'),
        center: getStringFlag(args.flags, 'footer-center'),
        right: getStringFlag(args.flags, 'footer-right'),
    });
    if (footer !== undefined) out.footerTemplate = footer;

    // --watermark-*
    const watermark = await buildWatermarkFromFlags(args);
    if (watermark !== undefined) out.watermark = watermark;

    // --encrypt-*
    const encryption = buildEncryptionFromFlags(args);
    if (encryption !== undefined) out.encryption = encryption;

    // --attachment (repeatable)
    const attachments = await loadAttachmentsFromFlags(args);
    if (attachments !== undefined) out.attachments = attachments;

    // --output-intent-icc / --output-intent-id (merge into the file's outputIntent)
    const outputIntent = await buildOutputIntentFromFlags(args, fromFile.outputIntent);
    if (outputIntent !== undefined) out.outputIntent = outputIntent;

    // Typography flags merge into the file's typography object (one level).
    const typography = buildTypographyFromFlags(args);
    if (typography !== undefined) {
        out.typography = { ...(fromFile.typography ?? {}), ...typography };
    }

    // Validate mutually-exclusive combinations
    const tg = out.tagged;
    if (encryption !== undefined && tg !== undefined && tg !== false) {
        throw new CliError(
            'Encryption is mutually exclusive with --tagged (PDF/A forbids encryption per ISO 19005-1 §6.3.2).',
            2,
        );
    }
    if (out.pdfx !== undefined) {
        if (tg !== undefined && tg !== false) {
            throw new CliError(
                '--pdfx and --tagged are mutually exclusive: pdfnative writes one conformance claim per file (PDF/X-4 or PDF/A).',
                2,
            );
        }
        if (out.encryption !== undefined) {
            throw new CliError(
                '--pdfx is mutually exclusive with encryption (PDF/X forbids encryption, ISO 15930-7).',
                2,
            );
        }
    }

    return out as Partial<PdfLayoutOptions>;
}

/**
 * Validate streaming-incompatible flag combinations.
 * Streaming requires single-pass page emission, so:
 *   - {pages} placeholder in any header/footer template
 *   - TOC blocks (caller must check separately on params.blocks)
 * are rejected.
 */
export function assertStreamingCompatible(layout: Partial<PdfLayoutOptions>): void {
    const check = (tpl: PageTemplate | undefined, label: string): void => {
        if (tpl === undefined) return;
        for (const part of [tpl.left, tpl.center, tpl.right]) {
            if (part !== undefined && part.includes('{pages}')) {
                throw new CliError(
                    `--stream is incompatible with the {pages} placeholder in --${label}-* (total page count not known until full render).`,
                    2,
                );
            }
        }
    };
    check(layout.headerTemplate, 'header');
    check(layout.footerTemplate, 'footer');
}
