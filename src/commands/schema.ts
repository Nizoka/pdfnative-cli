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

const SUBJECTS = [
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
                description: 'Ordered document blocks (text, table, image, toc, …).',
                items: { type: 'object' },
            },
            layout: { type: 'object', description: 'PdfLayoutOptions overrides.' },
            fontEntries: {
                type: 'array',
                description: 'Pre-registered font entries (usually set via --font/--lang).',
                items: { type: 'object' },
            },
        },
    };
    const tableVariant: JsonSchema = {
        type: 'object',
        title: 'PdfParams',
        description: 'Table-centric input (use with `render --variant table`).',
        required: ['title', 'headers', 'rows'],
        properties: {
            title: { type: 'string' },
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array' } },
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
        required: ['version', 'pageCount', 'encrypted', 'pdfaConformance', 'signatures', 'metadata'],
        additionalProperties: false,
        properties: {
            version: { type: 'string' },
            pageCount: { type: 'integer', minimum: 0 },
            encrypted: { type: 'boolean' },
            pdfaConformance: { type: ['string', 'null'] },
            signatures: { type: 'integer', minimum: 0 },
            metadata: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    title: { type: ['string', 'null'] },
                    author: { type: ['string', 'null'] },
                    creationDate: { type: ['string', 'null'] },
                    subject: { type: ['string', 'null'] },
                    producer: { type: ['string', 'null'] },
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
                        signatureAlgorithm: { type: ['string', 'null'], enum: ['rsa-sha256', 'ecdsa-sha256', null] },
                        timestampPresent: { type: 'boolean' },
                        timestampValid: { type: 'boolean' },
                        timestampTime: { type: ['string', 'null'] },
                        tsaSubject: { type: ['string', 'null'] },
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
        description: 'JSON emitted by `pdfnative batch --format json`.',
        type: 'object',
        required: ['total', 'succeeded', 'failed', 'results'],
        additionalProperties: false,
        properties: {
            total: { type: 'integer', minimum: 0 },
            succeeded: { type: 'integer', minimum: 0 },
            failed: { type: 'integer', minimum: 0 },
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
                    'square', 'circle', 'line', 'freetext'],
            },
            rect: {
                type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' },
                description: '[x1, y1, x2, y2] in PDF user space (points).',
            },
            contents: { type: 'string' },
            color: { description: 'PdfColor: hex "#rrggbb", "r g b", or tuple.' },
            interiorColor: { description: 'Fill colour for square/circle.' },
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
        required: ['pages', 'encrypted', 'signatures', 'pdfa'],
        additionalProperties: false,
        properties: {
            pages: { type: 'integer', minimum: 0 },
            encrypted: { type: 'boolean' },
            signatures: { type: 'integer', minimum: 0 },
            pdfa: { type: ['string', 'null'] },
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
        description: 'JSON emitted by `pdfnative batch --summary` (minimal verdict, no per-file results).',
        type: 'object',
        required: ['total', 'succeeded', 'failed'],
        additionalProperties: false,
        properties: {
            total: { type: 'integer', minimum: 0 },
            succeeded: { type: 'integer', minimum: 0 },
            failed: { type: 'integer', minimum: 0 },
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
            + 'decrypt, batch). Additional command-specific fields may be present.',
        type: 'object',
        required: ['ok', 'command'],
        properties: {
            ok: { type: 'boolean', const: true },
            command: { type: 'string' },
            dryRun: { type: 'boolean' },
            output: { type: 'string' },
            bytes: { type: 'integer', minimum: 0 },
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
