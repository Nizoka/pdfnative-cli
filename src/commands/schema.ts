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

import { createRequire } from 'node:module';
import type { ParsedArgs } from '../utils/args.js';
import { CliError, ErrorCode } from '../utils/error.js';

type JsonSchema = Readonly<Record<string, unknown>>;

const SUBJECTS = [
    'render',
    'inspect',
    'verify',
    'batch',
    'inspect-summary',
    'verify-summary',
    'batch-summary',
] as const;
type Subject = (typeof SUBJECTS)[number];

function cliVersion(): string {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
}

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

const BUILDERS: Readonly<Record<Subject, () => JsonSchema>> = {
    render: renderSchema,
    inspect: inspectSchema,
    verify: verifySchema,
    batch: batchSchema,
    'inspect-summary': inspectSummarySchema,
    'verify-summary': verifySummarySchema,
    'batch-summary': batchSummarySchema,
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
