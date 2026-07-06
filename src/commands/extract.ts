// `pdfnative extract` — extract a subset of pages from a PDF into a new PDF
// (pdfnative 1.4.0 page-tree API). Page order follows the `--pages` selector
// and pages may repeat. Signatures/forms are dropped and encrypted sources
// rejected (see `merge`).

import { extractPages, openPdf } from '../core-bridge/index.js';
import type { MergeOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { parseMaxOutputSize } from '../utils/pdfops.js';
import { parsePageList } from '../utils/pages.js';

export async function extract(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const pagesSpec = getStringFlag(args.flags, 'pages');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    if (pagesSpec === undefined) {
        throw new CliError('extract requires --pages <selector> (e.g. "1,3,5-7").', 2);
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let pageCount: number;
    try {
        pageCount = openPdf(pdfBytes).pageCount;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read PDF: ${message}`, 1, ErrorCode.PARSE);
    }

    const indices = parsePageList(pagesSpec, pageCount);

    const opts: MergeOptions = {
        dropAnnotations,
        ...(maxOutputSize !== undefined ? { maxOutputSize } : {}),
    };

    if (dryRun) {
        emitStatus({ command: 'extract', dryRun: true, pages: indices.length, output: outputPath ?? '-' });
        return;
    }

    let extracted: Uint8Array;
    try {
        extracted = extractPages(pdfBytes, indices, opts);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to extract pages: ${message}`, 1, ErrorCode.PARSE);
    }

    await writeOutput(extracted, outputPath);
    emitStatus({
        command: 'extract',
        dryRun: false,
        pages: indices.length,
        output: outputPath ?? '-',
        bytes: extracted.length,
    });
}
