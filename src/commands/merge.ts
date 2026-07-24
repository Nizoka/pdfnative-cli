// `pdfnative merge` — concatenate multiple PDFs into one (pdfnative page-tree
// API). Rebuilds a fresh, self-contained document: signatures and form fields
// are dropped (any page-tree edit invalidates a signature's /ByteRange), and
// only self-contained URI links are kept. Encrypted sources are supported with
// --password (v1.6.0); the output can be re-encrypted with --encrypt and
// streamed at constant memory with --stream. See `verify` / `sign` for
// signature workflows.

import { mergePdfs, streamMergedPdfs } from '../core-bridge/index.js';
import type { StreamMergeOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readBinaryFile, writeOutput, writeStreamingOutput } from '../utils/io.js';
import { CliError } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import {
    parseMaxOutputSize,
    collectSourcePaths,
    resolveSourcePassword,
    readEncryptTrigger,
    buildEncryptOptions,
    parseChunkSize,
    mapPdfError,
} from '../utils/pdfops.js';

export async function merge(args: ParsedArgs): Promise<void> {
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
    const password = resolveSourcePassword(args.flags);
    const { enabled: doEncrypt, algoRaw } = readEncryptTrigger(args.flags);
    const encrypt = doEncrypt ? buildEncryptOptions(args, algoRaw) : undefined;
    const stream = hasFlag(args.flags, 'stream');
    const chunkSize = parseChunkSize(getStringFlag(args.flags, 'chunk-size'));
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    const sources = collectSourcePaths(args.positionals, getStringFlagAll(args.flags, 'input'));
    if (sources.length < 2) {
        throw new CliError(
            'merge requires at least two input PDFs (positional paths or repeated --input).',
            2,
        );
    }
    if (sources.length > 50) {
        throw new CliError(`merge supports at most 50 sources (got ${sources.length}).`, 2);
    }

    const buffers: Uint8Array[] = [];
    for (const path of sources) {
        buffers.push(await readBinaryFile(path));
    }

    const opts: { -readonly [K in keyof StreamMergeOptions]: StreamMergeOptions[K] } = {
        dropAnnotations,
    };
    if (maxOutputSize !== undefined) opts.maxOutputSize = maxOutputSize;
    if (password !== undefined) opts.password = password;
    if (encrypt !== undefined) opts.encrypt = encrypt;
    if (chunkSize !== undefined) opts.chunkSize = chunkSize;

    if (dryRun) {
        emitStatus({
            command: 'merge',
            dryRun: true,
            sources: sources.length,
            encrypted: encrypt !== undefined,
            output: outputPath ?? '-',
        });
        return;
    }

    if (stream) {
        try {
            await writeStreamingOutput(streamMergedPdfs(buffers, opts), outputPath);
        } catch (e) {
            throw mapPdfError(e, 'Failed to merge PDFs');
        }
        emitStatus({
            command: 'merge',
            dryRun: false,
            sources: sources.length,
            streamed: true,
            encrypted: encrypt !== undefined,
            output: outputPath ?? '-',
        });
        return;
    }

    let merged: Uint8Array;
    try {
        merged = mergePdfs(buffers, opts);
    } catch (e) {
        throw mapPdfError(e, 'Failed to merge PDFs');
    }

    await writeOutput(merged, outputPath);
    emitStatus({
        command: 'merge',
        dryRun: false,
        sources: sources.length,
        encrypted: encrypt !== undefined,
        output: outputPath ?? '-',
        bytes: merged.length,
    });
}
