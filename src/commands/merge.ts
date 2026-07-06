// `pdfnative merge` — concatenate multiple PDFs into one (pdfnative 1.4.0
// page-tree API). Rebuilds a fresh, self-contained document: signatures and
// form fields are dropped (any page-tree edit invalidates a signature's
// /ByteRange), and only self-contained URI links are kept. Encrypted sources
// are rejected. See `pdfnative verify` / `sign` for signature workflows.

import { mergePdfs } from '../core-bridge/index.js';
import type { MergeOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readBinaryFile, writeOutput } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { parseMaxOutputSize, collectSourcePaths } from '../utils/pdfops.js';

export async function merge(args: ParsedArgs): Promise<void> {
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dropAnnotations = hasFlag(args.flags, 'drop-annotations');
    const maxOutputSize = parseMaxOutputSize(getStringFlag(args.flags, 'max-output-size'));
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

    const opts: MergeOptions = {
        dropAnnotations,
        ...(maxOutputSize !== undefined ? { maxOutputSize } : {}),
    };

    let merged: Uint8Array;
    try {
        merged = mergePdfs(buffers, opts);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to merge PDFs: ${message}`, 1, ErrorCode.PARSE);
    }

    if (dryRun) {
        emitStatus({ command: 'merge', dryRun: true, sources: sources.length, output: outputPath ?? '-' });
        return;
    }

    await writeOutput(merged, outputPath);
    emitStatus({
        command: 'merge',
        dryRun: false,
        sources: sources.length,
        output: outputPath ?? '-',
        bytes: merged.length,
    });
}
