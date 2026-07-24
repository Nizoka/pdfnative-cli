// `pdfnative split` — split one PDF into multiple PDFs (pdfnative page-tree
// API). With `--pages` each comma-separated segment becomes one output
// document; without it, every page becomes its own single-page PDF.
// Signatures/forms are dropped. Encrypted sources are supported with
// --password (v1.6.0); each output can be re-encrypted with --encrypt and
// written at constant memory with --stream (see `merge`).

import { mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { splitPdf, streamSplitPdf, openPdf } from '../core-bridge/index.js';
import type { StreamMergeOptions, PageRange } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, writeStreamingOutput, validatePath } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import {
    parseMaxOutputSize,
    resolveSourcePassword,
    readEncryptTrigger,
    buildEncryptOptions,
    parseChunkSize,
    mapPdfError,
} from '../utils/pdfops.js';
import { parsePageRanges } from '../utils/pages.js';

/** Sanitise a user-supplied filename prefix (strip path separators / dots). */
function sanitizePrefix(raw: string): string {
    const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
    return cleaned.length > 0 ? cleaned : 'part';
}

export async function split(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputDir = getStringFlag(args.flags, 'output-dir');
    const pagesSpec = getStringFlag(args.flags, 'pages');
    const prefixRaw = getStringFlag(args.flags, 'prefix');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
    const password = resolveSourcePassword(args.flags);
    const { enabled: doEncrypt, algoRaw } = readEncryptTrigger(args.flags);
    const encrypt = doEncrypt ? buildEncryptOptions(args, algoRaw) : undefined;
    const stream = hasFlag(args.flags, 'stream');
    const chunkSize = parseChunkSize(getStringFlag(args.flags, 'chunk-size'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (outputDir === undefined) {
        throw new CliError('split requires --output-dir <dir>.', 2);
    }
    validatePath(outputDir);

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let pageCount: number;
    try {
        pageCount = openPdf(pdfBytes, password !== undefined ? { password } : undefined).pageCount;
    } catch (e) {
        throw mapPdfError(e, 'Failed to read PDF');
    }

    const ranges: PageRange[] = pagesSpec !== undefined
        ? parsePageRanges(pagesSpec, pageCount)
        : Array.from({ length: pageCount }, (_, i) => ({ start: i, end: i }));

    const prefix = sanitizePrefix(
        prefixRaw ?? (inputPath !== undefined ? basename(inputPath, extname(inputPath)) : 'part'),
    );

    const opts: { -readonly [K in keyof StreamMergeOptions]: StreamMergeOptions[K] } = {
        dropAnnotations,
    };
    if (maxOutputSize !== undefined) opts.maxOutputSize = maxOutputSize;
    if (password !== undefined) opts.password = password;
    if (encrypt !== undefined) opts.encrypt = encrypt;
    if (chunkSize !== undefined) opts.chunkSize = chunkSize;

    if (dryRun) {
        emitStatus({
            command: 'split',
            dryRun: true,
            parts: ranges.length,
            encrypted: encrypt !== undefined,
            outputDir,
        });
        return;
    }

    await mkdir(outputDir, { recursive: true });
    // Zero-pad the index so lexical sort matches page order.
    const width = String(ranges.length).length;
    const outName = (i: number): string => `${prefix}-${String(i + 1).padStart(width, '0')}.pdf`;

    if (stream) {
        try {
            for await (const part of streamSplitPdf(pdfBytes, ranges, opts)) {
                // writeStreamingOutput fully drains part.pdf before we advance,
                // which streamSplitPdf requires.
                await writeStreamingOutput(part.pdf, join(outputDir, outName(part.index)));
            }
        } catch (e) {
            throw mapPdfError(e, 'Failed to split PDF');
        }
        emitStatus({
            command: 'split',
            dryRun: false,
            parts: ranges.length,
            streamed: true,
            encrypted: encrypt !== undefined,
            outputDir,
        });
        return;
    }

    let parts: Uint8Array[];
    try {
        parts = splitPdf(pdfBytes, ranges, opts);
    } catch (e) {
        throw mapPdfError(e, 'Failed to split PDF');
    }

    for (let i = 0; i < parts.length; i++) {
        await writeOutput(parts[i] as Uint8Array, join(outputDir, outName(i)));
    }

    emitStatus({
        command: 'split',
        dryRun: false,
        parts: parts.length,
        encrypted: encrypt !== undefined,
        outputDir,
    });
}
