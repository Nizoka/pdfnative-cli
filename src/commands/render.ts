import { buildDocumentPDFBytes, buildDocumentPDFStream } from '../core-bridge/index.js';
import type { DocumentParams } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, writeStreamingOutput, assertJsonSizeLimit } from '../utils/io.js';
import { CliError } from '../utils/error.js';

const VALID_CONFORMANCE = new Set(['1b', '2b', '3b']);

export async function render(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const useStream = hasFlag(args.flags, 'stream');
    const conformance = getStringFlag(args.flags, 'conformance');

    if (conformance !== undefined && !VALID_CONFORMANCE.has(conformance)) {
        throw new CliError(
            `Invalid --conformance value "${conformance}". Valid values: 1b, 2b, 3b.`,
            2,
        );
    }

    const inputBuf = await readFileOrStdin(inputPath);
    assertJsonSizeLimit(inputBuf);

    let params: DocumentParams;
    try {
        params = JSON.parse(inputBuf.toString('utf8')) as DocumentParams;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse JSON input: ${message}`, 1);
    }

    if (typeof params !== 'object' || params === null) {
        throw new CliError('JSON input must be a DocumentParams object.', 1);
    }

    // Inject --conformance flag into params if provided
    if (conformance !== undefined) {
        (params as unknown as Record<string, unknown>)['pdfaConformance'] = conformance;
    }

    if (useStream) {
        const generator = buildDocumentPDFStream(params);
        await writeStreamingOutput(generator, outputPath);
    } else {
        const pdfBytes = buildDocumentPDFBytes(params);
        await writeOutput(pdfBytes, outputPath);
    }
}
