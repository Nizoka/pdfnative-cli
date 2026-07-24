// `pdfnative encrypt` — re-secure a PDF with AES-128/256 encryption (pdfnative
// 1.6.0 page-tree re-encryption). The document is rebuilt from its page tree,
// so — like `merge` — signatures and form fields are dropped (any page-tree
// edit invalidates a signature's /ByteRange). An already-encrypted source can
// be opened with --password for password rotation. Requires a Web Crypto
// CSPRNG; RC4 is never emitted.

import { extractPages, streamExtractPages, openPdf } from '../core-bridge/index.js';
import type { StreamMergeOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, writeStreamingOutput } from '../utils/io.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import {
    parseMaxOutputSize,
    parseChunkSize,
    resolveSourcePassword,
    buildEncryptOptions,
    mapPdfError,
} from '../utils/pdfops.js';

export async function encrypt(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
    const sourcePassword = resolveSourcePassword(args.flags);
    const stream = hasFlag(args.flags, 'stream');
    const chunkSize = parseChunkSize(getStringFlag(args.flags, 'chunk-size'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    // Owner password is required — buildEncryptOptions throws (exit 2) if absent.
    const encryptOptions = buildEncryptOptions(args, getStringFlag(args.flags, 'algorithm'));

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let pageCount: number;
    try {
        pageCount = openPdf(pdfBytes, sourcePassword !== undefined ? { password: sourcePassword } : undefined).pageCount;
    } catch (e) {
        throw mapPdfError(e, 'Failed to read PDF');
    }
    const indices = Array.from({ length: pageCount }, (_, i) => i);

    const opts: { -readonly [K in keyof StreamMergeOptions]: StreamMergeOptions[K] } = {
        dropAnnotations,
        encrypt: encryptOptions,
    };
    if (sourcePassword !== undefined) opts.password = sourcePassword;
    if (maxOutputSize !== undefined) opts.maxOutputSize = maxOutputSize;
    if (chunkSize !== undefined) opts.chunkSize = chunkSize;

    if (dryRun) {
        emitStatus({
            command: 'encrypt',
            dryRun: true,
            pages: pageCount,
            algorithm: encryptOptions.algorithm ?? 'aes128',
            output: outputPath ?? '-',
        });
        return;
    }

    if (stream) {
        try {
            await writeStreamingOutput(streamExtractPages(pdfBytes, indices, opts), outputPath);
        } catch (e) {
            throw mapPdfError(e, 'Failed to encrypt PDF');
        }
        emitStatus({
            command: 'encrypt',
            dryRun: false,
            pages: pageCount,
            algorithm: encryptOptions.algorithm ?? 'aes128',
            streamed: true,
            output: outputPath ?? '-',
        });
        return;
    }

    let out: Uint8Array;
    try {
        out = extractPages(pdfBytes, indices, opts);
    } catch (e) {
        throw mapPdfError(e, 'Failed to encrypt PDF');
    }

    await writeOutput(out, outputPath);
    emitStatus({
        command: 'encrypt',
        dryRun: false,
        pages: pageCount,
        algorithm: encryptOptions.algorithm ?? 'aes128',
        output: outputPath ?? '-',
        bytes: out.length,
    });
}
