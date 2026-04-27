import { openPdf } from '../core-bridge/index.js';
import type { PdfReader } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag } from '../utils/args.js';
import { readFileOrStdin } from '../utils/io.js';
import { CliError } from '../utils/error.js';

interface InspectResult {
    readonly version: string;
    readonly pageCount: number;
    readonly encrypted: boolean;
    readonly pdfaConformance: string | null;
    readonly signatures: number;
    readonly metadata: {
        readonly title: string | null;
        readonly author: string | null;
        readonly creationDate: string | null;
        readonly subject: string | null;
        readonly producer: string | null;
    };
}

/**
 * Safely extract a string value from a PDF info dictionary entry.
 * Returns null if the value is not a plain string (e.g. hex strings, refs, binary blobs).
 */
function safeInfoString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    // Strip surrounding PDF literal string parens if present
    const trimmed = value.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        return trimmed.slice(1, -1);
    }
    // Filter out binary/non-printable content (no raw bytes in output — OWASP)
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        return null;
    }
    return trimmed || null;
}

function extractVersion(reader: PdfReader): string {
    // Version is in the %PDF-X.Y header (first bytes of the file)
    const header = new TextDecoder('ascii', { fatal: false }).decode(
        reader.bytes.slice(0, 20),
    );
    const match = /^%PDF-(\d+\.\d+)/.exec(header);
    return match !== null ? match[1] : 'unknown';
}

function extractEncrypted(reader: PdfReader): boolean {
    const trailer = reader.trailer;
    return trailer.get('Encrypt') !== undefined;
}

function extractPdfaConformance(reader: PdfReader): string | null {
    // PDF/A conformance is declared in XMP metadata.
    // We check the catalog -> Metadata stream for pdfaid:conformance and pdfaid:part.
    try {
        const catalog = reader.getCatalog();
        const metaRef = catalog.get('Metadata');
        if (metaRef === undefined) return null;
        const metaObj = reader.resolveValue(metaRef);
        if (
            typeof metaObj !== 'object' ||
            metaObj === null ||
            !('streamData' in metaObj)
        ) {
            return null;
        }
        const decoded = reader.decodeStream(
            metaObj as Parameters<PdfReader['decodeStream']>[0],
        );
        const xmp = new TextDecoder('utf-8', { fatal: false }).decode(decoded);
        const partMatch = /pdfaid:part[^>]*>(\d+)</.exec(xmp);
        const confMatch = /pdfaid:conformance[^>]*>([A-Za-z]+)</.exec(xmp);
        if (partMatch !== null && confMatch !== null) {
            return `${partMatch[1]}${confMatch[1].toLowerCase()}`;
        }
    } catch {
        // Non-critical — conformance detection is best-effort
    }
    return null;
}

function countSignatures(reader: PdfReader): number {
    // Signatures are AcroForm fields with /FT /Sig
    try {
        const catalog = reader.getCatalog();
        const acroRef = catalog.get('AcroForm');
        if (acroRef === undefined) return 0;
        const acro = reader.resolveValue(acroRef);
        if (!(acro instanceof Map)) return 0;
        const fieldsVal = acro.get('Fields');
        if (!Array.isArray(fieldsVal)) return 0;
        let count = 0;
        for (const ref of fieldsVal) {
            const field = reader.resolveValue(ref as Parameters<PdfReader['resolveValue']>[0]);
            if (field instanceof Map && field.get('FT') === '/Sig') {
                count++;
            }
        }
        return count;
    } catch {
        return 0;
    }
}

export async function inspect(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const format = getStringFlag(args.flags, 'format', 'f') ?? 'json';

    if (format !== 'json' && format !== 'text') {
        throw new CliError(`Invalid --format value "${format}". Valid values: json, text.`, 2);
    }

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    let reader: PdfReader;
    try {
        reader = openPdf(pdfBytes);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to read PDF: ${message}`, 1);
    }

    const info = reader.getInfo();
    const result: InspectResult = {
        version: extractVersion(reader),
        pageCount: reader.pageCount,
        encrypted: extractEncrypted(reader),
        pdfaConformance: extractPdfaConformance(reader),
        signatures: countSignatures(reader),
        metadata: {
            title: info !== null ? safeInfoString(info.get('Title')) : null,
            author: info !== null ? safeInfoString(info.get('Author')) : null,
            creationDate: info !== null ? safeInfoString(info.get('CreationDate')) : null,
            subject: info !== null ? safeInfoString(info.get('Subject')) : null,
            producer: info !== null ? safeInfoString(info.get('Producer')) : null,
        },
    };

    if (format === 'json') {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
        // Human-readable text table
        const lines = [
            `Version:        ${result.version}`,
            `Pages:          ${result.pageCount}`,
            `Encrypted:      ${result.encrypted ? 'yes' : 'no'}`,
            `PDF/A:          ${result.pdfaConformance ?? 'none'}`,
            `Signatures:     ${result.signatures}`,
            `Title:          ${result.metadata.title ?? '—'}`,
            `Author:         ${result.metadata.author ?? '—'}`,
            `Created:        ${result.metadata.creationDate ?? '—'}`,
            `Subject:        ${result.metadata.subject ?? '—'}`,
            `Producer:       ${result.metadata.producer ?? '—'}`,
        ];
        process.stdout.write(lines.join('\n') + '\n');
    }
}
