// `pdfnative decrypt` — remove encryption from a PDF, emitting a plaintext copy
// (pdfnative 1.6.0 transparent decryption + page-tree rebuild). Provide the
// document password via --password (or $PDFNATIVE_PASSWORD). Like `merge`, the
// page-tree rebuild drops signatures and form fields. An unencrypted input is
// passed through (rebuilt) unchanged in security terms.

import { extractPages, streamExtractPages, openPdf } from '../core-bridge/index.js';
import type { StreamMergeOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, writeStreamingOutput } from '../utils/io.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { parseMaxOutputSize, parseChunkSize, resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';

export async function decrypt(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
    const password = resolveSourcePassword(args.flags);
    const stream = hasFlag(args.flags, 'stream');
    const chunkSize = parseChunkSize(getStringFlag(args.flags, 'chunk-size'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let pageCount: number;
    try {
        pageCount = openPdf(pdfBytes, password !== undefined ? { password } : undefined).pageCount;
    } catch (e) {
        throw mapPdfError(e, 'Failed to read PDF');
    }
    const indices = Array.from({ length: pageCount }, (_, i) => i);

    // No `encrypt` option → output is unencrypted.
    const opts: { -readonly [K in keyof StreamMergeOptions]: StreamMergeOptions[K] } = { dropAnnotations };
    if (password !== undefined) opts.password = password;
    if (maxOutputSize !== undefined) opts.maxOutputSize = maxOutputSize;
    if (chunkSize !== undefined) opts.chunkSize = chunkSize;

    if (dryRun) {
        emitStatus({ command: 'decrypt', dryRun: true, pages: pageCount, output: outputPath ?? '-' });
        return;
    }

    if (stream) {
        try {
            await writeStreamingOutput(streamExtractPages(pdfBytes, indices, opts), outputPath);
        } catch (e) {
            throw mapPdfError(e, 'Failed to decrypt PDF');
        }
        emitStatus({ command: 'decrypt', dryRun: false, pages: pageCount, streamed: true, output: outputPath ?? '-' });
        return;
    }

    let out: Uint8Array;
    try {
        out = extractPages(pdfBytes, indices, opts);
    } catch (e) {
        throw mapPdfError(e, 'Failed to decrypt PDF');
    }

    await writeOutput(out, outputPath);
    emitStatus({
        command: 'decrypt',
        dryRun: false,
        pages: pageCount,
        output: outputPath ?? '-',
        bytes: out.length,
    });
}
