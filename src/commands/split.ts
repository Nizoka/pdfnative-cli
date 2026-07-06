// `pdfnative split` — split one PDF into multiple PDFs (pdfnative 1.4.0
// page-tree API). With `--pages` each comma-separated segment becomes one
// output document; without it, every page becomes its own single-page PDF.
// Signatures/forms are dropped and encrypted sources rejected (see `merge`).

import { mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { splitPdf, openPdf } from '../core-bridge/index.js';
import type { MergeOptions, PageRange } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, validatePath } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { parseMaxOutputSize } from '../utils/pdfops.js';
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
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (outputDir === undefined) {
        throw new CliError('split requires --output-dir <dir>.', 2);
    }
    validatePath(outputDir);

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let pageCount: number;
    try {
        pageCount = openPdf(pdfBytes).pageCount;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read PDF: ${message}`, 1, ErrorCode.PARSE);
    }

    const ranges: PageRange[] = pagesSpec !== undefined
        ? parsePageRanges(pagesSpec, pageCount)
        : Array.from({ length: pageCount }, (_, i) => ({ start: i, end: i }));

    const prefix = sanitizePrefix(
        prefixRaw ?? (inputPath !== undefined ? basename(inputPath, extname(inputPath)) : 'part'),
    );

    const opts: MergeOptions = {
        dropAnnotations,
        ...(maxOutputSize !== undefined ? { maxOutputSize } : {}),
    };

    if (dryRun) {
        emitStatus({ command: 'split', dryRun: true, parts: ranges.length, outputDir });
        return;
    }

    let parts: Uint8Array[];
    try {
        parts = splitPdf(pdfBytes, ranges, opts);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to split PDF: ${message}`, 1, ErrorCode.PARSE);
    }

    await mkdir(outputDir, { recursive: true });

    // Zero-pad the index so lexical sort matches page order.
    const width = String(parts.length).length;
    const outputs: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const name = `${prefix}-${String(i + 1).padStart(width, '0')}.pdf`;
        const outPath = join(outputDir, name);
        await writeOutput(parts[i] as Uint8Array, outPath);
        outputs.push(outPath);
    }

    emitStatus({ command: 'split', dryRun: false, parts: parts.length, outputDir });
}
