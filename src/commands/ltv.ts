// `pdfnative ltv <collect|embed|add>` — PAdES B-LT long-term validation
// (ISO 32000-2 §12.8.4): collect OCSP/CRL revocation material for every
// signature and embed it as a /DSS dictionary with per-signature /VRI
// entries, via a non-destructive incremental update.
//
//   ltv collect --online   Network phase: walk the signatures, fetch OCSP/CRL
//                          data, emit a portable JSON `ltv-data` document.
//   ltv embed --data <j>   Offline phase: embed pre-collected ltv-data into
//                          the PDF. Deterministic, replayable, air-gap safe.
//   ltv embed --cert/--ocsp/--crl [--match all|chain]
//                          Offline phase from files you already hold (pdfnative
//                          1.9.0 composeLtvData): certificates (PEM or DER),
//                          OCSP responses and CRLs (DER), attributed to the
//                          document's signatures without any network.
//   ltv add --online       One-pass convenience: collect + embed.
//
// Offline doctrine: the network phases hard-require the explicit `--online`
// flag; `embed` NEVER touches the network. Every request goes through the
// SSRF-guarded revocation transport (src/utils/ltv-provider.ts).

import {
    collectValidationInfo,
    embedValidationInfo,
    addValidationInfo,
    composeLtvData,
    getRevocationProvider,
    ensureCryptoReady,
} from '../core-bridge/index.js';
import type { LtvData, CollectLtvOptions, LtvMaterial, ComposeLtvOptions } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, getStringFlagAll, hasFlag } from '../utils/args.js';
import { readFileOrStdin, readBinaryFile, readBinaryFileCapped, writeOutput, assertJsonSizeLimit } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun } from '../utils/agent.js';
import { splitPemBlocks, pemToDer } from '../utils/keys.js';
import { createRevocationProvider } from '../utils/ltv-provider.js';

const SUBCOMMANDS = ['collect', 'embed', 'add'] as const;
type LtvMode = (typeof SUBCOMMANDS)[number];

/** Version tag of the serialized ltv-data JSON document (`schema ltv-data`). */
const LTV_DATA_VERSION = 1;

const DEFAULT_TIMEOUT_MS = 10_000;

/** Cap on one offline material file (an OCSP response, a CRL or a certificate bundle). */
const MAX_MATERIAL_BYTES = 16 * 1024 * 1024;

// ── Flag helpers ─────────────────────────────────────────────────────

function requireOnline(mode: LtvMode, flags: ParsedArgs['flags']): void {
    if (hasFlag(flags, 'online')) return;
    throw new CliError(
        `ltv ${mode} contacts the OCSP responders and CRL distribution points listed in the `
        + 'certificates, and the CLI is offline by default. Pass --online to explicitly opt in '
        + 'to these network requests, or pre-collect the material elsewhere and use '
        + '`ltv embed --data <ltv.json>` — the fully offline, air-gap-safe path.',
        2,
    );
}

function parseTimeout(raw: string | undefined): number {
    if (raw === undefined) return DEFAULT_TIMEOUT_MS;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new CliError(`Invalid --timeout "${raw}". Expected a positive integer (milliseconds).`, 2);
    }
    return n;
}

function parsePrefer(raw: string | undefined): boolean {
    if (raw === undefined || raw === 'ocsp') return true;
    if (raw === 'crl') return false;
    throw new CliError(`Invalid --prefer "${raw}". Valid: ocsp, crl.`, 2);
}

/** Read every `--extra-cert <pem>` file and decode each PEM block to DER. */
async function loadExtraCertificates(flags: ParsedArgs['flags']): Promise<readonly Uint8Array[]> {
    const out: Uint8Array[] = [];
    for (const filePath of getStringFlagAll(flags, 'extra-cert')) {
        const raw = Buffer.from(await readBinaryFile(filePath)).toString('utf8');
        const blocks = splitPemBlocks(raw);
        if (blocks.length === 0) {
            throw new CliError(`--extra-cert file "${filePath}" contains no PEM certificate block.`, 1, ErrorCode.INPUT);
        }
        for (const block of blocks) {
            try {
                out.push(pemToDer(block));
            } catch {
                throw new CliError(`--extra-cert file "${filePath}" contains an invalid PEM block.`, 1, ErrorCode.PARSE);
            }
        }
    }
    return out;
}

/** `--match` of `ltv embed` (pdfnative 1.9.0 `ComposeLtvOptions.match`): `all` (default) or `chain`. */
function parseMatch(raw: string | undefined): ComposeLtvOptions['match'] {
    if (raw === undefined || raw === 'all') return 'all';
    if (raw === 'chain') return 'chain';
    throw new CliError(`Invalid --match "${raw}". Valid: all, chain.`, 2);
}

/**
 * Read a certificate file as DER: a PEM bundle (every CERTIFICATE block) or a
 * raw DER certificate. Returns the DERs it holds.
 */
async function readCertificateFile(flag: string, filePath: string): Promise<readonly Uint8Array[]> {
    const bytes = await readBinaryFileCapped(filePath, MAX_MATERIAL_BYTES, `${flag} file`);
    const head = Buffer.from(bytes.subarray(0, 64)).toString('latin1');
    if (!head.includes('-----BEGIN')) return [bytes];
    const blocks = splitPemBlocks(Buffer.from(bytes).toString('utf8'));
    if (blocks.length === 0) {
        throw new CliError(`${flag} file "${filePath}" contains no PEM certificate block.`, 1, ErrorCode.INPUT);
    }
    try {
        return blocks.map((block) => pemToDer(block));
    } catch {
        throw new CliError(`${flag} file "${filePath}" contains an invalid PEM block.`, 1, ErrorCode.PARSE);
    }
}

/**
 * The offline material of `ltv embed` — `--cert` (PEM or DER, repeatable),
 * `--ocsp` and `--crl` (DER, repeatable). `null` when none of the three flags
 * is present.
 */
async function loadMaterial(flags: ParsedArgs['flags']): Promise<LtvMaterial | null> {
    const certFiles = getStringFlagAll(flags, 'cert');
    const ocspFiles = getStringFlagAll(flags, 'ocsp');
    const crlFiles = getStringFlagAll(flags, 'crl');
    if (certFiles.length + ocspFiles.length + crlFiles.length === 0) return null;
    const certificates: Uint8Array[] = [];
    for (const file of certFiles) certificates.push(...await readCertificateFile('--cert', file));
    const ocspResponses: Uint8Array[] = [];
    for (const file of ocspFiles) ocspResponses.push(await readBinaryFileCapped(file, MAX_MATERIAL_BYTES, '--ocsp file'));
    const crls: Uint8Array[] = [];
    for (const file of crlFiles) crls.push(await readBinaryFileCapped(file, MAX_MATERIAL_BYTES, '--crl file'));
    return { certificates, ocspResponses, crls };
}

/**
 * Compose the /DSS data from material on disk (pdfnative 1.9.0). The engine's
 * own refusals (`composeLtvData: …` — no material, no signed signature) are
 * the user's input (E_INPUT); anything else is reported with a fixed string.
 */
function composeMaterial(pdfBytes: Uint8Array, material: LtvMaterial, match: ComposeLtvOptions['match']): LtvData {
    try {
        return composeLtvData(pdfBytes, material, { match });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.startsWith('composeLtvData:')) {
            throw new CliError(`ltv embed: ${message.slice('composeLtvData:'.length).trim()}`, 1, ErrorCode.INPUT);
        }
        throw new CliError('Failed to compose validation information.', 1);
    }
}

// ── ltv-data (de)serialization ───────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function fromBase64(value: unknown, field: string): Uint8Array {
    if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_RE.test(value)) {
        throw new CliError(`Invalid ltv-data: "${field}" entries must be valid base64 strings.`, 1, ErrorCode.PARSE);
    }
    return new Uint8Array(Buffer.from(value, 'base64'));
}

/** Serialize collected LtvData to the portable `ltv-data` JSON document. */
function serializeLtvData(data: LtvData): string {
    return JSON.stringify(
        {
            version: LTV_DATA_VERSION,
            certificates: data.certificates.map(toBase64),
            ocspResponses: data.ocspResponses.map(toBase64),
            crls: data.crls.map(toBase64),
            vri: data.vri.map((v) => ({
                key: v.key,
                certs: v.certs,
                ocsps: v.ocsps,
                crls: v.crls,
            })),
        },
        null,
        2,
    );
}

function indexArray(value: unknown, field: string, max: number): readonly number[] {
    if (!Array.isArray(value) || value.some((n) => !Number.isInteger(n) || n < 0 || n >= max)) {
        throw new CliError(
            `Invalid ltv-data: "${field}" must be an array of indexes into the corresponding collection.`,
            1,
            ErrorCode.INPUT,
        );
    }
    return value as readonly number[];
}

/** Strict validation + reconstruction of an ltv-data JSON document. */
function deserializeLtvData(text: string): LtvData {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new CliError('Invalid ltv-data: not valid JSON.', 1, ErrorCode.PARSE);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new CliError('Invalid ltv-data: expected a JSON object.', 1, ErrorCode.INPUT);
    }
    const obj = parsed as Record<string, unknown>;
    if (obj['version'] !== LTV_DATA_VERSION) {
        throw new CliError(
            `Invalid ltv-data: unsupported version ${JSON.stringify(obj['version'])} (expected ${LTV_DATA_VERSION}).`,
            1,
            ErrorCode.INPUT,
        );
    }
    for (const field of ['certificates', 'ocspResponses', 'crls', 'vri']) {
        if (!Array.isArray(obj[field])) {
            throw new CliError(`Invalid ltv-data: "${field}" must be an array.`, 1, ErrorCode.INPUT);
        }
    }
    const certificates = (obj['certificates'] as unknown[]).map((v) => fromBase64(v, 'certificates'));
    const ocspResponses = (obj['ocspResponses'] as unknown[]).map((v) => fromBase64(v, 'ocspResponses'));
    const crls = (obj['crls'] as unknown[]).map((v) => fromBase64(v, 'crls'));
    const vri = (obj['vri'] as unknown[]).map((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new CliError('Invalid ltv-data: "vri" entries must be objects.', 1, ErrorCode.INPUT);
        }
        const e = entry as Record<string, unknown>;
        if (typeof e['key'] !== 'string' || e['key'].length === 0) {
            throw new CliError('Invalid ltv-data: "vri" entries need a non-empty "key" string.', 1, ErrorCode.INPUT);
        }
        return {
            key: e['key'],
            certs: indexArray(e['certs'], 'vri.certs', certificates.length),
            ocsps: indexArray(e['ocsps'], 'vri.ocsps', ocspResponses.length),
            crls: indexArray(e['crls'], 'vri.crls', crls.length),
        };
    });
    return { certificates, ocspResponses, crls, vri };
}

// ── Collect options shared by `collect` and `add` ────────────────────

interface OnlineFlags {
    readonly preferOcsp: boolean;
    readonly timeoutMs: number;
    readonly extraCertificates: readonly Uint8Array[];
}

async function readOnlineFlags(args: ParsedArgs): Promise<OnlineFlags> {
    return {
        preferOcsp: parsePrefer(getStringFlag(args.flags, 'prefer')),
        timeoutMs: parseTimeout(getStringFlag(args.flags, 'timeout')),
        extraCertificates: await loadExtraCertificates(args.flags),
    };
}

function buildCollectOptions(flags: OnlineFlags): CollectLtvOptions {
    return {
        revocationProvider: getRevocationProvider() ?? createRevocationProvider({ timeoutMs: flags.timeoutMs }),
        extraCertificates: flags.extraCertificates,
        preferOcsp: flags.preferOcsp,
    };
}

// ── Sub-modes ────────────────────────────────────────────────────────

async function ltvCollect(args: ParsedArgs, dryRun: boolean): Promise<void> {
    requireOnline('collect', args.flags);
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const online = await readOnlineFlags(args);

    await ensureCryptoReady();
    const pdfBytes = new Uint8Array(await readFileOrStdin(inputPath));

    if (dryRun) {
        emitStatus({ command: 'ltv', mode: 'collect', dryRun: true, output: outputPath ?? '-' });
        return;
    }

    let data: LtvData;
    try {
        data = await collectValidationInfo(pdfBytes, buildCollectOptions(online));
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to collect validation information.', 1);
    }

    await writeOutput(new TextEncoder().encode(serializeLtvData(data) + '\n'), outputPath);
    emitStatus({
        command: 'ltv',
        mode: 'collect',
        dryRun: false,
        output: outputPath ?? '-',
        certificates: data.certificates.length,
        ocspResponses: data.ocspResponses.length,
        crls: data.crls.length,
        vri: data.vri.length,
    });
}

async function ltvEmbed(args: ParsedArgs, dryRun: boolean): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dataPath = getStringFlag(args.flags, 'data');
    const matchRaw = getStringFlag(args.flags, 'match');
    const material = await loadMaterial(args.flags);
    if (dataPath !== undefined && material !== null) {
        throw new CliError('ltv embed takes either --data <ltv.json> or offline material (--cert, --ocsp, --crl), not both.', 2);
    }
    if (dataPath === undefined && material === null) {
        throw new CliError(
            'ltv embed requires --data <ltv.json> (produced by `ltv collect --online`) or offline material: '
            + '--cert <pem|der>, --ocsp <der>, --crl <der> (each repeatable), attributed with --match all|chain.',
            2,
        );
    }
    if (matchRaw !== undefined && material === null) {
        throw new CliError('--match applies to offline material (--cert, --ocsp, --crl), not to --data.', 2);
    }
    const match = parseMatch(matchRaw);

    const pdfBytes = new Uint8Array(await readFileOrStdin(inputPath));

    let data: LtvData;
    if (material !== null) {
        data = composeMaterial(pdfBytes, material, match);
    } else {
        const dataBuf = Buffer.from(await readBinaryFile(dataPath as string));
        assertJsonSizeLimit(dataBuf);
        data = deserializeLtvData(dataBuf.toString('utf8'));
    }
    const matchField = material !== null ? { match } : {};

    if (dryRun) {
        emitStatus({
            command: 'ltv',
            mode: 'embed',
            dryRun: true,
            output: outputPath ?? '-',
            ...matchField,
            certificates: data.certificates.length,
            ocspResponses: data.ocspResponses.length,
            crls: data.crls.length,
            vri: data.vri.length,
        });
        return;
    }

    let out: Uint8Array;
    try {
        out = embedValidationInfo(pdfBytes, data);
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to embed validation information.', 1);
    }

    await writeOutput(out, outputPath);
    emitStatus({
        command: 'ltv',
        mode: 'embed',
        dryRun: false,
        output: outputPath ?? '-',
        ...matchField,
        certificates: data.certificates.length,
        ocspResponses: data.ocspResponses.length,
        crls: data.crls.length,
        vri: data.vri.length,
        bytes: out.length,
    });
}

async function ltvAdd(args: ParsedArgs, dryRun: boolean): Promise<void> {
    requireOnline('add', args.flags);
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const online = await readOnlineFlags(args);

    await ensureCryptoReady();
    const pdfBytes = new Uint8Array(await readFileOrStdin(inputPath));

    if (dryRun) {
        emitStatus({ command: 'ltv', mode: 'add', dryRun: true, output: outputPath ?? '-' });
        return;
    }

    let out: Uint8Array;
    try {
        out = await addValidationInfo(pdfBytes, buildCollectOptions(online));
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError('Failed to add validation information.', 1);
    }

    await writeOutput(out, outputPath);
    emitStatus({
        command: 'ltv',
        mode: 'add',
        dryRun: false,
        output: outputPath ?? '-',
        bytes: out.length,
    });
}

// ── Dispatch ─────────────────────────────────────────────────────────

export async function ltv(args: ParsedArgs): Promise<void> {
    const sub = args.positionals[0];
    if (sub === undefined) {
        throw new CliError(`Usage: pdfnative ltv <${SUBCOMMANDS.join('|')}>`, 2);
    }
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();
    switch (sub) {
        case 'collect':
            await ltvCollect(args, dryRun);
            return;
        case 'embed':
            await ltvEmbed(args, dryRun);
            return;
        case 'add':
            await ltvAdd(args, dryRun);
            return;
        default:
            throw new CliError(
                `Unknown ltv subcommand "${sub}". Valid: ${SUBCOMMANDS.join(', ')}.`,
                2,
            );
    }
}
