// `pdfnative schema [subject]` — print a JSON Schema for a CLI input/output
// shape so autonomous agents (and humans) can self-validate before invoking
// the CLI.
//
// Schemas are CLI-scoped: they describe the TOP-LEVEL shape the CLI accepts or
// emits, not every nested pdfnative block type (those live in pdfnative and its
// docs). They are hand-authored and versioned via a `$id` that embeds the CLI
// version, so drift is detectable and a test pins the contract.
//
// Philosophy: zero runtime deps, pure data. No validation engine is bundled —
// the CLI only PRODUCES schemas; callers validate with their own tooling.

import type { ParsedArgs } from '../utils/args.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { cliVersion } from '../utils/version.js';
import { COMMANDS, GLOBAL_FLAGS } from './completion.js';

type JsonSchema = Readonly<Record<string, unknown>>;

/** Every `schema` subject, in listing order — also read by scripts/gate.ts (smoke) and verify:docs. */
export const SUBJECTS = [
    'render',
    'inspect',
    'verify',
    'batch',
    'annotate',
    'extract-text',
    'fill',
    'form-export',
    'inspect-summary',
    'verify-summary',
    'batch-summary',
    'govern-verify',
    'metadata',
    'ltv-data',
    'compare',
    'batch-manifest',
    'status',
    'manifest',
    'doctor',
] as const;
type Subject = (typeof SUBJECTS)[number];

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ID_BASE = 'https://pdfnative.dev/schema/cli';

function id(subject: Subject): string {
    return `${ID_BASE}/${cliVersion()}/${subject}.schema.json`;
}

function renderSchema(): JsonSchema {
    const documentVariant: JsonSchema = {
        type: 'object',
        title: 'DocumentParams',
        description: 'Free-form document input (default variant). The blocks array '
            + 'is validated by pdfnative; see pdfnative docs for block types.',
        required: ['blocks'],
        properties: {
            blocks: {
                type: 'array',
                description: 'Ordered document blocks (heading, paragraph, table, list, '
                    + 'spacer, pageBreak, image, link, toc, barcode, svg, formField, '
                    + 'chart). Chart blocks support 9 kinds (bar, barH, line, pie, '
                    + 'donut, stackedBar, stackedBarH, area, scatter) plus xValues, '
                    + 'yAxis "left"|"right", axis.scale "linear"|"log", axis2, xAxis '
                    + '{type: "category"|"linear"|"time"}, dataLabels, labelStride and '
                    + 'labelRotation (pdfnative 1.7.0). Image blocks accept "src" (a '
                    + 'path resolved against the --input JSON\'s directory), '
                    + '"dataBase64" (inline base64 JPEG/PNG), or "data" (byte array) — '
                    + 'the CLI resolves them to bytes before rendering. Paragraph '
                    + 'blocks accept align "left"|"right"|"center"|"justify", '
                    + 'keepWithNext and splittable; heading blocks keepWithNext; text '
                    + 'may carry soft hyphens U+00AD (pdfnative 1.8.0). Every colour '
                    + 'field (PdfColor) accepts hex "#rrggbb", "r g b" (0–1), [r, g, b] '
                    + '(0–255), or CMYK as "c m y k" operands (0–1) / [c, m, y, k] '
                    + 'percent — emitted as DeviceCMYK (pdfnative 1.8.0).',
                items: { type: 'object' },
            },
            layout: {
                type: 'object',
                description: 'PdfLayoutOptions overrides. Includes print production '
                    + '(print: {bleed, trimBox, bleedBox, artBox, cropBox, marks: true | '
                    + '{colourBars: true | {tints, size}}, userUnit}), outputIntent '
                    + '({iccProfile: number[], outputConditionIdentifier, registryName, '
                    + 'info} — an RGB, CMYK or Gray ICC profile; a prtr output profile '
                    + 'for PDF/X-4; the CLI also reads one from --output-intent-icc), '
                    + 'viewerPreferences (duplex, pickTrayByPDFSize, printPageRange '
                    + '[[first,last]…], numCopies), strict (escalate diagnostics to '
                    + 'errors), tagged (PDF/A level), pdfx ("pdfx4" — mutually '
                    + 'exclusive with tagged and encryption; needs outputIntent, '
                    + 'embedded fonts and metadata.trapped True|False), creationDate '
                    + '(ISO 8601 string, revived to a Date; pins /CreationDate, '
                    + 'xmp:CreateDate, {date} and the trailer /ID for byte-identical '
                    + 'output) and typography ({splitParagraphs, orphans, widows, '
                    + 'keepHeadingsWithNext: boolean | {minLines}, unitBinding: '
                    + 'boolean | {units}, bindShortWords: boolean | {maxLength, '
                    + 'words}, punctuationSpacing: "fr" | "fr-CA" | rules[], '
                    + 'opticalMargins, metrics: "approximate" | "exact", fontFeatures: '
                    + 'string[], kerning, hyphenationLanguage}) — pdfnative 1.8.0. '
                    + 'The nested typography and outputIntent objects merge one level '
                    + 'deep with the --layout file and the flags.',
            },
            metadata: {
                type: 'object',
                description: 'Document metadata → /Info + XMP (pdfnative 1.7.0). '
                    + 'trapped is load-bearing under layout.pdfx: PDF/X requires True '
                    + 'or False (Unknown throws); --trapped overrides it.',
                properties: {
                    author: { type: 'string' },
                    subject: { type: 'string' },
                    keywords: { type: 'string' },
                    trapped: { type: 'string', enum: ['True', 'False', 'Unknown'] },
                },
            },
            fontEntries: {
                type: 'array',
                description: 'Pre-registered font entries (usually set via --font/--lang; '
                    + '--font <code> registers a bundled module — 27 scripts: ar, hy, bn, '
                    + 'ru, hi, am, ka, el, he, ja, km, ko, my, pl, zh, si, ta, te, th, bo, '
                    + 'tr, vi, lo, nod, khb, tdd, cjm, plus latin, emoji, color-emoji, '
                    + 'math; ha, yo, ig, sw alias latin — and --font-file <path.ttf> '
                    + 'registers a font you ship).',
                items: { type: 'object' },
            },
        },
    };
    const tableVariant: JsonSchema = {
        type: 'object',
        title: 'PdfParams',
        description: 'Table-centric input (use with `render --variant table`). Since '
            + 'v1.5.0 --lang injects fontEntries on this path too, so a --tagged / '
            + '--pdfx claim can be conformant.',
        required: ['title', 'headers', 'rows'],
        properties: {
            title: { type: 'string' },
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array' } },
            fontEntries: { type: 'array', items: { type: 'object' } },
            metadata: {
                type: 'object',
                description: 'Document metadata → /Info + XMP (pdfnative 1.7.0).',
                properties: {
                    author: { type: 'string' },
                    subject: { type: 'string' },
                    keywords: { type: 'string' },
                    trapped: { type: 'string', enum: ['True', 'False', 'Unknown'] },
                },
            },
        },
    };
    return {
        $schema: DRAFT,
        $id: id('render'),
        title: 'pdfnative-cli render input',
        description: 'JSON accepted on stdin or via --input by `pdfnative render`. '
            + 'One of two variants depending on --variant.',
        oneOf: [documentVariant, tableVariant],
    };
}

function inspectSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('inspect'),
        title: 'pdfnative-cli inspect output',
        description: 'JSON emitted by `pdfnative inspect --format json`.',
        type: 'object',
        required: ['version', 'pageCount', 'encrypted', 'pdfaConformance', 'pdfxConformance', 'signatures', 'metadata'],
        additionalProperties: false,
        properties: {
            version: { type: 'string' },
            pageCount: { type: 'integer', minimum: 0 },
            encrypted: { type: 'boolean' },
            pdfaConformance: { type: ['string', 'null'] },
            pdfxConformance: {
                type: ['string', 'null'],
                description: 'The XMP pdfxid:GTS_PDFXVersion claim (e.g. "PDF/X-4"), or null (v1.5.0).',
            },
            signatures: {
                description: 'Signature count, or — with `inspect --signatures` '
                    + '(pdfnative 1.7.0) — the detailed signature-field list (never '
                    + 'the signature bytes).',
                oneOf: [
                    { type: 'integer', minimum: 0 },
                    {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                fieldName: { type: ['string', 'null'] },
                                subFilter: { type: 'string' },
                                byteRange: { type: 'array', items: { type: 'integer' } },
                                isDocTimestamp: { type: 'boolean' },
                                isPlaceholder: { type: 'boolean' },
                                sigObjNum: { type: 'integer' },
                                contentsLength: { type: 'integer' },
                            },
                        },
                    },
                ],
            },
            metadata: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    title: { type: ['string', 'null'] },
                    author: { type: ['string', 'null'] },
                    creationDate: {
                        type: ['string', 'null'],
                        description: 'The raw PDF date string (D:YYYYMMDDHHmmSS+HH\'mm\'), or '
                            + 'ISO 8601 with --iso-dates (v1.5.0).',
                    },
                    modDate: {
                        type: ['string', 'null'],
                        description: '/Info /ModDate — the raw PDF date string, or ISO 8601 '
                            + 'with --iso-dates (v1.5.0, additive).',
                    },
                    subject: { type: ['string', 'null'] },
                    producer: { type: ['string', 'null'] },
                    trapped: { type: 'string', enum: ['True', 'False', 'Unknown'] },
                },
            },
            pages: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        index: { type: 'integer' },
                        width: { type: ['number', 'null'] },
                        height: { type: ['number', 'null'] },
                        rotation: { type: 'number' },
                        annotations: { type: 'integer' },
                        formFields: { type: 'integer' },
                        cropBox: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } },
                        trimBox: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } },
                        bleedBox: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } },
                        artBox: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } },
                        userUnit: { type: 'number' },
                    },
                },
            },
            pageLabels: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        startPage: { type: 'integer', minimum: 0 },
                        style: { type: ['string', 'null'] },
                        prefix: { type: ['string', 'null'] },
                        start: { type: ['integer', 'null'] },
                    },
                },
            },
            encryption: {
                type: ['object', 'null'],
                description: 'Present with `inspect --encryption` (pdfnative 1.6.0).',
                properties: {
                    algorithm: { type: 'string', enum: ['rc4-40', 'rc4-128', 'aes128', 'aes256'] },
                    revision: { type: 'integer' },
                    authenticatedAs: { type: 'string', enum: ['user', 'owner'] },
                },
            },
            formFields: {
                type: 'array',
                description: 'Present with `inspect --form-fields` (pdfnative 1.6.0).',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        type: {
                            type: 'string',
                            enum: ['text', 'checkbox', 'radio', 'dropdown', 'listbox', 'button', 'signature', 'unknown'],
                        },
                        value: { type: ['string', 'array', 'boolean', 'null'] },
                        readOnly: { type: 'boolean' },
                        required: { type: 'boolean' },
                        options: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
            annotations: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1 },
                        subtype: { type: 'string' },
                        contents: { type: ['string', 'null'] },
                        title: { type: ['string', 'null'] },
                        url: { type: ['string', 'null'] },
                    },
                },
            },
            pdfua: {
                type: 'object',
                properties: {
                    valid: { type: 'boolean' },
                    errors: { type: 'array', items: { type: 'string' } },
                    warnings: { type: 'array', items: { type: 'string' } },
                },
            },
            pdfx: {
                type: 'object',
                description: 'Present with `inspect --pdfx` / `--check pdfx` (v1.5.0): '
                    + 'pdfnative 1.8.0 validatePdfX(), the structural ISO 15930-7 '
                    + 'prerequisites — not a certified preflight; veraPDF does not '
                    + 'cover PDF/X.',
                properties: {
                    valid: { type: 'boolean' },
                    errors: { type: 'array', items: { type: 'string' } },
                    warnings: { type: 'array', items: { type: 'string' } },
                },
            },
            verbose: {
                type: 'object',
                properties: {
                    trailerKeys: { type: 'array', items: { type: 'string' } },
                    catalogKeys: { type: 'array', items: { type: 'string' } },
                    objectCount: { type: 'integer' },
                    xmpMetadata: { type: ['string', 'null'] },
                },
            },
        },
    };
}

function verifySchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('verify'),
        title: 'pdfnative-cli verify output',
        description: 'JSON emitted by `pdfnative verify --format json`.',
        type: 'object',
        required: ['signatures', 'allValid'],
        additionalProperties: false,
        properties: {
            allValid: { type: 'boolean' },
            signatures: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        index: { type: 'integer' },
                        fieldName: { type: ['string', 'null'] },
                        subFilter: { type: ['string', 'null'] },
                        signerSubject: { type: ['string', 'null'] },
                        signerIssuer: { type: ['string', 'null'] },
                        signingTime: { type: ['string', 'null'] },
                        reason: { type: ['string', 'null'] },
                        location: { type: ['string', 'null'] },
                        digest: { type: ['string', 'null'] },
                        integrity: { type: 'boolean' },
                        chainValid: { type: 'boolean' },
                        trustedRoot: { type: 'boolean' },
                        signatureValid: { type: 'boolean' },
                        signatureAlgorithm: {
                            type: ['string', 'null'],
                            enum: ['rsa-sha256', 'rsa-sha384', 'rsa-sha512', 'ecdsa-sha256',
                                'ecdsa-sha384', 'ecdsa-sha512', null],
                            description: 'ecdsa-sha384/512 are detected and labelled but '
                                + 'never verify (pdfnative verification is P-256 + SHA-256 only).',
                        },
                        isDocTimestamp: {
                            type: 'boolean',
                            description: 'True for /DocTimeStamp revisions (SubFilter '
                                + 'ETSI.RFC3161, PAdES B-LTA) — validated as RFC 3161 tokens.',
                        },
                        timestampPresent: { type: 'boolean' },
                        timestampValid: { type: 'boolean' },
                        timestampTime: { type: ['string', 'null'] },
                        tsaSubject: { type: ['string', 'null'] },
                        timestampDigest: {
                            type: ['string', 'null'],
                            description: 'RFC 3161 messageImprint digest (sha1, sha256, …). '
                                + 'sha1 is a weak digest: a note is emitted and --strict '
                                + 'refuses it (v1.5.0).',
                        },
                        revocationChecked: { type: 'boolean' },
                        revocationStatus: { type: 'string', enum: ['unknown', 'good', 'revoked'] },
                        revocationSource: { type: 'string', enum: ['embedded', 'online', 'none'] },
                        revocationMethod: { type: ['string', 'null'], enum: ['ocsp', 'crl', null] },
                        revocationRevokedAt: { type: ['string', 'null'] },
                        notes: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    };
}

function batchSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('batch'),
        title: 'pdfnative-cli batch output',
        description: 'JSON emitted by `pdfnative batch --format json`. Directory mode '
            + 'reports per-file `results`; manifest mode (`--manifest`, pdfnative-cli '
            + '1.4.0) reports per-task `tasks` plus `mode: "manifest"` and `skipped`.',
        type: 'object',
        required: ['total', 'succeeded', 'failed'],
        additionalProperties: false,
        properties: {
            ok: { type: 'boolean', description: 'Manifest mode only.' },
            command: { const: 'batch', description: 'Manifest mode only.' },
            total: { type: 'integer', minimum: 0 },
            succeeded: { type: 'integer', minimum: 0 },
            failed: { type: 'integer', minimum: 0 },
            skipped: { type: 'integer', minimum: 0 },
            mode: { type: 'string', enum: ['manifest'] },
            dryRun: { type: 'boolean' },
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['input', 'output', 'ok', 'error'],
                    additionalProperties: false,
                    properties: {
                        input: { type: 'string' },
                        output: { type: 'string' },
                        ok: { type: 'boolean' },
                        error: { type: ['string', 'null'] },
                    },
                },
            },
            tasks: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['id', 'command', 'ok'],
                    properties: {
                        id: { type: 'string' },
                        command: { type: 'string' },
                        ok: { type: 'boolean' },
                        output: { type: 'string' },
                        skipped: { type: 'boolean' },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    };
}

function annotateSchema(): JsonSchema {
    const annotation: JsonSchema = {
        type: 'object',
        required: ['page', 'type', 'rect'],
        properties: {
            page: { type: 'integer', minimum: 1, description: '1-based target page.' },
            type: {
                type: 'string',
                enum: ['text', 'highlight', 'underline', 'strikeout', 'squiggly',
                    'square', 'circle', 'line', 'freetext', 'link'],
            },
            rect: {
                type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' },
                description: '[x1, y1, x2, y2] in PDF user space (points).',
            },
            url: {
                type: 'string',
                description: 'link only (v1.5.0): http:, https: or mailto: URI; other '
                    + 'schemes and control characters are rejected (E_INPUT).',
            },
            contents: { type: 'string' },
            color: { description: 'PdfColor: hex "#rrggbb", "r g b" (0–1), [r, g, b] (0–255), or CMYK "c m y k" (0–1) / [c, m, y, k] percent.' },
            interiorColor: { description: 'Fill colour for square/circle (same PdfColor forms).' },
            opacity: { type: 'number', minimum: 0, maximum: 1 },
            title: { type: 'string' },
            modified: { type: 'string' },
            flags: { type: 'integer' },
            quadPoints: { type: 'array', items: { type: 'number' } },
            borderWidth: { type: 'number' },
            open: { type: 'boolean' },
            icon: { type: 'string' },
            fontSize: { type: 'number' },
            start: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
            end: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
        },
    };
    return {
        $schema: DRAFT,
        $id: id('annotate'),
        title: 'pdfnative-cli annotate input',
        description: 'JSON accepted via --annotations by `pdfnative annotate`: an array '
            + 'of markup annotations, each with a 1-based "page".',
        oneOf: [
            { type: 'array', items: annotation },
            {
                type: 'object',
                required: ['annotations'],
                properties: { annotations: { type: 'array', items: annotation } },
            },
        ],
    };
}

function governVerifySchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('govern-verify'),
        title: 'pdfnative-cli govern verify-issue output',
        description: 'JSON emitted by `pdfnative govern verify-issue --format json`.',
        type: 'object',
        required: ['ok', 'errors', 'warnings'],
        additionalProperties: false,
        properties: {
            ok: { type: 'boolean' },
            errors: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
        },
    };
}

// --- Agent summary shapes (`--summary`) -----------------------------------
// Compact, canonical verdicts emitted when a command is run with `--summary`.
// Pinned here so agents can validate the minimal output independently.

function inspectSummarySchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('inspect-summary'),
        title: 'pdfnative-cli inspect summary output',
        description: 'JSON emitted by `pdfnative inspect --summary` (minimal verdict).',
        type: 'object',
        required: ['pages', 'encrypted', 'signatures', 'pdfa', 'pdfx'],
        additionalProperties: false,
        properties: {
            pages: { type: 'integer', minimum: 0 },
            encrypted: { type: 'boolean' },
            signatures: { type: 'integer', minimum: 0 },
            pdfa: { type: ['string', 'null'] },
            pdfx: { type: ['string', 'null'], description: 'The PDF/X claim (e.g. "PDF/X-4"), or null (v1.5.0).' },
        },
    };
}

function verifySummarySchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('verify-summary'),
        title: 'pdfnative-cli verify summary output',
        description: 'JSON emitted by `pdfnative verify --summary` (minimal verdict).',
        type: 'object',
        required: ['valid', 'signatures', 'invalid'],
        additionalProperties: false,
        properties: {
            valid: { type: 'boolean' },
            signatures: { type: 'integer', minimum: 0 },
            invalid: { type: 'integer', minimum: 0 },
        },
    };
}

function batchSummarySchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('batch-summary'),
        title: 'pdfnative-cli batch summary output',
        description: 'JSON emitted by `pdfnative batch --summary` (minimal verdict, no '
            + 'per-file results). Manifest mode additionally emits ok, command, mode, '
            + 'skipped and (under --dry-run) dryRun.',
        type: 'object',
        required: ['total', 'succeeded', 'failed'],
        additionalProperties: false,
        properties: {
            ok: { type: 'boolean', description: 'Manifest mode only.' },
            command: { const: 'batch', description: 'Manifest mode only.' },
            mode: { type: 'string', enum: ['manifest'] },
            total: { type: 'integer', minimum: 0 },
            succeeded: { type: 'integer', minimum: 0 },
            failed: { type: 'integer', minimum: 0 },
            skipped: { type: 'integer', minimum: 0 },
            dryRun: { type: 'boolean' },
        },
    };
}

function extractTextSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('extract-text'),
        title: 'pdfnative-cli extract-text output',
        description: 'JSON emitted by `pdfnative extract-text --format json`: one entry '
            + 'per page. NDJSON mode emits each entry on its own line.',
        type: 'array',
        items: {
            type: 'object',
            required: ['pageIndex', 'text'],
            properties: {
                pageIndex: { type: 'integer', minimum: 0 },
                text: { type: 'string' },
                runs: {
                    type: 'array',
                    description: 'Present with --runs.',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            x: { type: 'number' },
                            y: { type: 'number' },
                            fontSize: { type: 'number' },
                            fontName: { type: 'string' },
                        },
                    },
                },
            },
        },
    };
}

function fillSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('fill'),
        title: 'pdfnative-cli fill input',
        description: 'JSON accepted via --data by `pdfnative fill`: a map of '
            + 'fully-qualified field name → value (string, boolean, or string[]), '
            + 'optionally wrapped in { "values": { … } }.',
        oneOf: [
            {
                type: 'object',
                additionalProperties: { type: ['string', 'boolean', 'array'], items: { type: 'string' } },
            },
            {
                type: 'object',
                required: ['values'],
                properties: {
                    values: {
                        type: 'object',
                        additionalProperties: { type: ['string', 'boolean', 'array'], items: { type: 'string' } },
                    },
                },
            },
        ],
    };
}

function formExportSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('form-export'),
        title: 'pdfnative-cli fill --export output',
        description: 'JSON emitted by `pdfnative fill --export`: a map of field name → '
            + 'current value (string, boolean, or string[]). Re-usable directly as `fill --data`.',
        type: 'object',
        additionalProperties: { type: ['string', 'boolean', 'array'], items: { type: 'string' } },
    };
}

function doctorSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('doctor'),
        title: 'pdfnative-cli doctor output',
        description: 'JSON emitted by `pdfnative doctor --format json`: environment / '
            + 'capability preflight. `ok` is false when any check has status "error".',
        type: 'object',
        required: ['ok', 'checks'],
        additionalProperties: false,
        properties: {
            ok: { type: 'boolean' },
            checks: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['name', 'status', 'value', 'detail'],
                    properties: {
                        name: { type: 'string' },
                        status: { type: 'string', enum: ['ok', 'warn', 'error'] },
                        value: { type: 'string' },
                        detail: { type: 'string' },
                    },
                },
            },
        },
    };
}

function statusSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('status'),
        title: 'pdfnative-cli agent status envelope',
        description: 'The success envelope written to stderr under --json by the write '
            + 'commands (render, sign, merge, split, extract, annotate, fill, encrypt, '
            + 'decrypt, metadata, ltv, doc-timestamp, compare; batch prints its own '
            + 'summary on stdout). Every field any command emits is pinned here — the '
            + 'command-specific ones are optional and say which command emits them '
            + '(tests/commands/schema-status-parity.test.ts holds the sources to this list); '
            + 'new fields are additive.',
        type: 'object',
        required: ['ok', 'command'],
        properties: {
            ok: { type: 'boolean', const: true },
            command: { type: 'string' },
            dryRun: { type: 'boolean' },
            output: {
                type: 'string',
                description: 'The output path, or "-" for stdout. split emits outputDir instead.',
            },
            bytes: {
                type: 'integer', minimum: 0,
                description: 'Size of the artifact written. Absent under --dry-run, when the '
                    + 'output was streamed (streamed: true) and for compare.',
            },
            variant: {
                type: 'string', enum: ['document', 'table'],
                description: 'render: the input shape rendered (--variant).',
            },
            inspectLayout: {
                type: 'boolean',
                description: 'render --inspect-layout: true when the JSON layout report was '
                    + 'written instead of a PDF.',
            },
            algorithm: {
                type: 'string',
                description: 'sign: the signature algorithm (rsa-sha256, ecdsa-sha256, …); '
                    + 'encrypt: the cipher (aes128 | aes256).',
            },
            digest: {
                type: 'string', enum: ['sha256', 'sha384', 'sha512'],
                description: 'doc-timestamp: the message-imprint digest requested from the TSA.',
            },
            annotations: {
                type: 'integer', minimum: 0,
                description: 'annotate: number of annotation specs applied (validated under --dry-run).',
            },
            pages: {
                type: 'integer', minimum: 0,
                description: 'extract: pages selected; encrypt / decrypt: page count of the document.',
            },
            sources: { type: 'integer', minimum: 2, description: 'merge: number of source files.' },
            parts: { type: 'integer', minimum: 0, description: 'split: number of parts written to outputDir.' },
            outputDir: {
                type: 'string',
                description: 'split: the directory the parts were written to (split has no single output).',
            },
            streamed: {
                type: 'boolean',
                description: 'merge / split / extract / encrypt / decrypt --stream: the output was '
                    + 'streamed, so bytes is absent.',
            },
            encrypted: {
                type: 'boolean',
                description: 'merge / split / extract: true when --encrypt was applied to the output.',
            },
            fields: {
                description: 'fill --dry-run: the number of form fields found (integer); '
                    + 'metadata: the names of the /Info fields updated (string[]).',
                anyOf: [
                    { type: 'integer', minimum: 0 },
                    { type: 'array', items: { type: 'string' } },
                ],
            },
            values: { type: 'integer', minimum: 0, description: 'fill: number of values applied from --data.' },
            flatten: { type: 'boolean', description: 'fill: whether the form was flattened.' },
            mode: {
                type: 'string', enum: ['collect', 'embed', 'add'],
                description: 'ltv: the sub-command run.',
            },
            certificates: { type: 'integer', minimum: 0, description: 'ltv: certificates collected or embedded into the DSS.' },
            ocspResponses: { type: 'integer', minimum: 0, description: 'ltv: OCSP responses collected or embedded.' },
            crls: { type: 'integer', minimum: 0, description: 'ltv: CRLs collected or embedded.' },
            vri: { type: 'integer', minimum: 0, description: 'ltv: per-signature VRI entries collected or embedded.' },
            equal: { type: 'boolean', const: true, description: 'compare: the documents are equal (a difference is E_CHECK_FAILED, never a success envelope).' },
            modes: {
                type: 'array', items: { type: 'string', enum: ['structure', 'text'] },
                description: 'compare: the comparison modes run (--mode).',
            },
            differences: { type: 'integer', minimum: 0, description: 'compare: number of differences (0 on success).' },
            timestamp: {
                type: 'object',
                description: 'sign --timestamp: the TSA that produced the embedded token.',
                properties: {
                    url: { type: 'string' },
                    digest: { type: 'string', enum: ['sha256', 'sha384', 'sha512'] },
                    timeoutMs: { type: 'integer', minimum: 1, description: '--timestamp-timeout (v1.5.0).' },
                },
            },
            pdfx: {
                type: 'string',
                enum: ['pdfx4'],
                description: 'render: the PDF/X target claimed (--pdfx / layout.pdfx), v1.5.0.',
            },
            creationDate: {
                type: 'string',
                format: 'date-time',
                description: 'render: the pinned creation instant (ISO 8601, UTC) when '
                    + 'output is reproducible — from --creation-date, layout.creationDate '
                    + 'or SOURCE_DATE_EPOCH (v1.5.0). Absent when the wall clock was used.',
            },
            diagnostics: {
                type: 'array',
                description: 'render: non-strict conformance diagnostics — PDFA_NO_FONT_ENTRIES, '
                    + 'PDFA_UNEMBEDDED_FORM_FONT, PDFA_DEVICE_CMYK_IMAGE, '
                    + 'PDFA_DEVICE_CMYK_CONTENT, PDFA_ICC_PROFILE_VERSION, '
                    + 'PDFX_NO_FONT_ENTRIES, PDFX_DEVICE_CMYK, PDFX_ANNOTATIONS, '
                    + 'TYPOGRAPHY_FEATURE_INEFFECTIVE (pdfnative 1.8.0; additions-only).',
                items: {
                    type: 'object',
                    properties: {
                        code: { type: 'string' },
                        severity: { type: 'string', enum: ['warning'] },
                        message: { type: 'string' },
                    },
                },
            },
        },
    };
}

function metadataSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('metadata'),
        title: 'pdfnative-cli metadata input',
        description: 'JSON accepted via --from-json by `pdfnative metadata`. All fields '
            + 'are optional, but at least one must be present. modDate is an ISO 8601 '
            + 'timestamp (defaults to now when omitted).',
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
            title: { type: 'string' },
            author: { type: 'string' },
            subject: { type: 'string' },
            keywords: { type: 'string' },
            modDate: { type: 'string' },
        },
    };
}

function ltvDataSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('ltv-data'),
        title: 'pdfnative-cli ltv collected validation data',
        description: 'JSON emitted by `pdfnative ltv collect` and accepted by '
            + '`pdfnative ltv embed --data`: the certificates, OCSP responses and '
            + 'CRLs to archive in /DSS + /VRI (PAdES B-LT). All binary values are '
            + 'base64-encoded DER. Replayable and offline-embeddable.',
        type: 'object',
        required: ['version', 'certificates', 'ocspResponses', 'crls', 'vri'],
        additionalProperties: false,
        properties: {
            version: { const: 1 },
            certificates: { type: 'array', items: { type: 'string', description: 'base64 DER certificate' } },
            ocspResponses: { type: 'array', items: { type: 'string', description: 'base64 DER OCSPResponse' } },
            crls: { type: 'array', items: { type: 'string', description: 'base64 DER CertificateList' } },
            vri: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['key', 'certs', 'ocsps', 'crls'],
                    additionalProperties: false,
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Uppercase SHA-1 hex of the signature /Contents (VRI key).',
                        },
                        certs: { type: 'array', items: { type: 'integer', minimum: 0 } },
                        ocsps: { type: 'array', items: { type: 'integer', minimum: 0 } },
                        crls: { type: 'array', items: { type: 'integer', minimum: 0 } },
                    },
                },
            },
        },
    };
}

function compareSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('compare'),
        title: 'pdfnative-cli compare output',
        description: 'JSON emitted by `pdfnative compare --format json`. Identical '
            + 'documents exit 0; any difference exits 1 with code E_CHECK_FAILED '
            + '(the report is printed before the error). Visual diffing is out of '
            + 'scope (no rasteriser).',
        type: 'object',
        required: ['equal', 'modes', 'differences'],
        additionalProperties: false,
        properties: {
            equal: { type: 'boolean' },
            modes: { type: 'array', items: { type: 'string', enum: ['structure', 'text'] } },
            differences: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['kind'],
                    properties: {
                        kind: {
                            type: 'string',
                            enum: ['pageCount', 'pageSize', 'box', 'userUnit', 'metadata',
                                'formFields', 'annotations', 'encryption', 'signatures', 'text'],
                        },
                        page: { type: 'integer', minimum: 1 },
                        path: { type: 'string' },
                        a: { description: 'Value in the first PDF (JSON-serialisable, never raw bytes).' },
                        b: { description: 'Value in the second PDF.' },
                        detail: { type: 'string' },
                    },
                },
            },
        },
    };
}

function batchManifestSchema(): JsonSchema {
    return {
        $schema: DRAFT,
        $id: id('batch-manifest'),
        title: 'pdfnative-cli batch manifest input',
        description: 'Input for `pdfnative batch --manifest`. Flag values "@<id>" '
            + 'reference the output of an EARLIER task. Relative paths resolve '
            + 'against the manifest file\'s directory. Tasks run sequentially, '
            + 'fail-fast by default. Network flags inside a manifest additionally '
            + 'require --allow-network on the command line.',
        type: 'object',
        required: ['version', 'tasks'],
        additionalProperties: false,
        properties: {
            version: { const: 1 },
            tasks: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    required: ['id', 'command'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' },
                        command: {
                            enum: ['render', 'sign', 'verify', 'inspect', 'merge', 'split',
                                'extract', 'extract-text', 'fill', 'encrypt', 'decrypt',
                                'annotate', 'metadata', 'doc-timestamp'],
                        },
                        flags: {
                            type: 'object',
                            additionalProperties: {
                                anyOf: [
                                    { type: 'string' },
                                    { type: 'number' },
                                    { type: 'boolean' },
                                    { type: 'array', items: { type: 'string' } },
                                ],
                            },
                        },
                    },
                },
            },
        },
    };
}

/**
 * The CLI capability manifest — DATA (not a JSON Schema) describing every
 * command, its flags, the global flags, and the stable error codes. Emitted by
 * `schema manifest` so an AI agent can discover the CLI's tools at runtime.
 * Kept in sync with the completion metadata (single source of truth).
 */
function manifestDocument(): JsonSchema {
    return {
        $id: `${ID_BASE}/${cliVersion()}/manifest.json`,
        kind: 'capability-manifest',
        name: 'pdfnative-cli',
        version: cliVersion(),
        contract: {
            stdout: 'primary artifact (PDF, JSON report, text, schema, script)',
            stderr: 'diagnostics and, under --json, the status/error envelope',
            exitCodes: { '0': 'success', '1': 'runtime/check failure', '2': 'usage error' },
        },
        globalFlags: GLOBAL_FLAGS,
        errorCodes: Object.values(ErrorCode),
        commands: COMMANDS.map((c) => ({ name: c.name, summary: c.summary, flags: c.flags })),
    };
}

const BUILDERS: Readonly<Record<Subject, () => JsonSchema>> = {
    render: renderSchema,
    inspect: inspectSchema,
    verify: verifySchema,
    batch: batchSchema,
    annotate: annotateSchema,
    'extract-text': extractTextSchema,
    fill: fillSchema,
    'form-export': formExportSchema,
    'inspect-summary': inspectSummarySchema,
    'verify-summary': verifySummarySchema,
    'batch-summary': batchSummarySchema,
    'govern-verify': governVerifySchema,
    metadata: metadataSchema,
    'ltv-data': ltvDataSchema,
    compare: compareSchema,
    'batch-manifest': batchManifestSchema,
    status: statusSchema,
    manifest: manifestDocument,
    doctor: doctorSchema,
};

function isSubject(value: string): value is Subject {
    return (SUBJECTS as readonly string[]).includes(value);
}

export async function schema(args: ParsedArgs): Promise<void> {
    const subject = args.positionals[0];

    if (subject === undefined) {
        // No subject → the most common need: the render input schema.
        process.stdout.write(JSON.stringify(BUILDERS.render(), null, 2) + '\n');
        return Promise.resolve();
    }

    if (subject === 'list') {
        process.stdout.write(JSON.stringify({ subjects: SUBJECTS }, null, 2) + '\n');
        return Promise.resolve();
    }

    if (!isSubject(subject)) {
        throw new CliError(
            `Unknown schema subject "${subject}". Valid: ${SUBJECTS.join(', ')}, list.`,
            2,
            ErrorCode.USAGE,
        );
    }

    process.stdout.write(JSON.stringify(BUILDERS[subject](), null, 2) + '\n');
    return Promise.resolve();
}
