// Page-selector parsing for the `split` and `extract` commands.
//
// Users express page selections in a familiar, 1-based syntax (like qpdf /
// pdftk): a comma-separated list of single pages and inclusive ranges, e.g.
//   "1,3,5-7"   → pages 1, 3, 5, 6, 7
//   "2-4"       → pages 2, 3, 4
// pdfnative's page-tree API is 0-based, so these helpers validate against the
// document page count and return 0-based indices / ranges.
//
// Pure and dependency-free — the CLI's zero-dep contract holds.

import { CliError } from './error.js';
import type { PageRange } from '../core-bridge/index.js';

/** Upper bound on distinct tokens in a selector, to bound parsing work. */
const MAX_TOKENS = 10_000;

interface ParsedToken {
    readonly start: number; // 1-based
    readonly end: number; // 1-based, inclusive
}

/** Split a selector string into validated 1-based (start,end) tokens. */
function tokenize(spec: string, pageCount: number): ParsedToken[] {
    const trimmed = spec.trim();
    if (trimmed.length === 0) {
        throw new CliError('Empty page selector. Expected e.g. "1,3,5-7".', 2);
    }
    const parts = trimmed.split(',');
    if (parts.length > MAX_TOKENS) {
        throw new CliError(`Page selector has too many segments (max ${MAX_TOKENS}).`, 2);
    }
    const tokens: ParsedToken[] = [];
    for (const raw of parts) {
        const part = raw.trim();
        if (part.length === 0) {
            throw new CliError(`Invalid page selector "${spec}": empty segment.`, 2);
        }
        const dash = part.indexOf('-');
        let start: number;
        let end: number;
        if (dash === -1) {
            start = end = parsePageNumber(part, spec);
        } else {
            start = parsePageNumber(part.slice(0, dash), spec);
            end = parsePageNumber(part.slice(dash + 1), spec);
        }
        if (end < start) {
            throw new CliError(
                `Invalid page range "${part}" in "${spec}": end (${end}) is before start (${start}).`,
                2,
            );
        }
        if (start < 1 || end > pageCount) {
            throw new CliError(
                `Page range "${part}" is out of bounds for a ${pageCount}-page document (valid: 1-${pageCount}).`,
                2,
            );
        }
        tokens.push({ start, end });
    }
    return tokens;
}

function parsePageNumber(value: string, spec: string): number {
    const n = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(n) || String(n) !== value.trim()) {
        throw new CliError(`Invalid page number "${value}" in selector "${spec}".`, 2);
    }
    return n;
}

/**
 * Parse a page selector into an ordered list of 0-based page indices.
 * Order is preserved and duplicates are kept (extract semantics).
 */
export function parsePageList(spec: string, pageCount: number): number[] {
    const tokens = tokenize(spec, pageCount);
    const indices: number[] = [];
    for (const { start, end } of tokens) {
        for (let p = start; p <= end; p++) indices.push(p - 1);
    }
    return indices;
}

/**
 * Parse a page selector into a list of 0-based inclusive {@link PageRange}s,
 * one per comma-separated segment (split semantics — each segment becomes a
 * separate output document).
 */
export function parsePageRanges(spec: string, pageCount: number): PageRange[] {
    const tokens = tokenize(spec, pageCount);
    return tokens.map(({ start, end }) => ({ start: start - 1, end: end - 1 }));
}
