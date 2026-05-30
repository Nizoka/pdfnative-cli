// Layout utilities for the `render` command.
//
// Implements the hybrid layout model: high-frequency knobs are CLI flags,
// the full PdfLayoutOptions surface is reachable via --layout <file.json>.
// Precedence: CLI flags > layout file > pdfnative defaults.

import { readFile } from 'node:fs/promises';
import {
    PDF_A_CONFORMANCE_TARGETS,
} from '../core-bridge/index.js';
import type {
    PdfLayoutOptions,
    PageTemplate,
    WatermarkOptions,
    EncryptionOptions,
    PdfAttachment,
    PdfAttachmentRelationship,
} from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from './args.js';
import { validatePath, readBinaryFile } from './io.js';
import { CliError, deprecate } from './error.js';

/**
 * Tagged-mode values accepted by the `--tagged` flag.
 *
 * The PDF/A targets are sourced from pdfnative's `PDF_A_CONFORMANCE_TARGETS`
 * constant (single source of truth) so the CLI never drifts from the set of
 * conformance levels the renderer actually supports.
 */
export const VALID_TAGGED = ['none', ...PDF_A_CONFORMANCE_TARGETS] as const;
export type TaggedValue = (typeof VALID_TAGGED)[number];

/** Built-in named page sizes (points). Matches pdfnative `PAGE_SIZES`. */
const NAMED_PAGE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
    a4:      [595.28, 841.89],
    letter:  [612.00, 792.00],
    legal:   [612.00, 1008.00],
    a3:      [841.89, 1190.55],
    tabloid: [792.00, 1224.00],
    a5:      [419.53, 595.28],
};

const VALID_ENCRYPTION_ALGOS = new Set(['aes128', 'aes256']);
const VALID_PERMISSIONS = new Set(['print', 'copy', 'modify', 'extractText', 'extracttext']);

/**
 * Load a `Partial<PdfLayoutOptions>` JSON file from disk.
 * Returns an empty object when no path is provided.
 *
 * Validates path against directory traversal and JSON shape (must be an object).
 * Binary attachment payloads must be supplied via `--attachment` flag — JSON
 * fields like `attachments[].data` are NOT supported (no path/data injection).
 */
export async function loadLayoutFile(
    filePath: string | undefined,
): Promise<Partial<PdfLayoutOptions>> {
    if (filePath === undefined) return {};
    validatePath(filePath);
    let raw: string;
    try {
        raw = await readFile(filePath, 'utf8');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read --layout file: ${msg}`, 1);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --layout JSON: ${msg}`, 1);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new CliError('--layout file must contain a JSON object.', 1);
    }
    // Strip any attachments[].data — binary payloads must come from --attachment, not JSON.
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.attachments)) {
        obj.attachments = obj.attachments.map((a): unknown => {
            if (typeof a !== 'object' || a === null) return a;
            const rest = { ...(a as Record<string, unknown>) };
            delete rest.data;
            return rest;
        });
    }
    return obj as Partial<PdfLayoutOptions>;
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

/** Build encryption options from CLI flags (or env vars for passwords). */
function buildEncryptionFromFlags(args: ParsedArgs): EncryptionOptions | undefined {
    const ownerFlag = getStringFlag(args.flags, 'encrypt-owner-pass');
    const userFlag = getStringFlag(args.flags, 'encrypt-user-pass');
    const algoFlag = getStringFlag(args.flags, 'encrypt-algorithm');
    const permsFlag = getStringFlag(args.flags, 'encrypt-permissions');

    const owner = process.env.PDFNATIVE_ENCRYPT_OWNER_PASS ?? ownerFlag;
    const user = process.env.PDFNATIVE_ENCRYPT_USER_PASS ?? userFlag;

    if (
        owner === undefined &&
        user === undefined &&
        algoFlag === undefined &&
        permsFlag === undefined
    ) {
        return undefined;
    }
    if (owner === undefined || owner.length === 0) {
        throw new CliError(
            'Encryption requires an owner password. Provide --encrypt-owner-pass <pass> or $PDFNATIVE_ENCRYPT_OWNER_PASS.',
            2,
        );
    }
    const algo = algoFlag ?? 'aes128';
    if (!VALID_ENCRYPTION_ALGOS.has(algo)) {
        throw new CliError(
            `Invalid --encrypt-algorithm "${algo}". Valid: aes128, aes256.`,
            2,
        );
    }
    const opts: { -readonly [K in keyof EncryptionOptions]: EncryptionOptions[K] } = {
        ownerPassword: owner,
        algorithm: algo as 'aes128' | 'aes256',
    };
    if (user !== undefined) opts.userPassword = user;

    if (permsFlag !== undefined) {
        const perms: Record<string, boolean> = {};
        for (const raw of permsFlag.split(',')) {
            const p = raw.trim();
            if (p.length === 0) continue;
            const lower = p.toLowerCase();
            if (!VALID_PERMISSIONS.has(p) && !VALID_PERMISSIONS.has(lower)) {
                throw new CliError(
                    `Invalid permission "${p}" in --encrypt-permissions. Valid: print, copy, modify, extractText.`,
                    2,
                );
            }
            const key =
                lower === 'extracttext' || p === 'extractText' ? 'extractText' : lower;
            perms[key] = true;
        }
        opts.permissions = perms;
    }
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
 * Compose the final `Partial<PdfLayoutOptions>` for a render invocation.
 *
 * Order of precedence (low → high): pdfnative defaults → --layout file → CLI flags.
 * Throws CliError on invalid combinations (e.g. encryption + tagged).
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

    // Validate mutually-exclusive combinations
    const tg = out.tagged;
    if (encryption !== undefined && tg !== undefined && tg !== false) {
        throw new CliError(
            'Encryption is mutually exclusive with --tagged (PDF/A forbids encryption per ISO 19005-1 §6.3.2).',
            2,
        );
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
