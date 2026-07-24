// `pdfnative fill` — fill and/or flatten an existing AcroForm PDF (pdfnative
// 1.6.0 `fillForm` / `flattenForm`). Uses an incremental update, so any
// existing signature stays valid for its revision. Encrypted documents are
// supported via --password (appended objects are encrypted under the source's
// existing scheme). Use `pdfnative inspect --form-fields` to discover fields.

import { readFile } from 'node:fs/promises';
import {
    fillForm,
    flattenForm,
    readFormFields,
    FormFieldNotFoundError,
    FormValueTypeError,
    FormUnsupportedError,
} from '../core-bridge/index.js';
import type { FillFormOptions, FlattenFormOptions, FormFillValue, ParsedFormField } from '../core-bridge/index.js';
import { type ParsedArgs, getStringFlag, hasFlag } from '../utils/args.js';
import { readFileOrStdin, writeOutput, validatePath, assertJsonSizeLimit } from '../utils/io.js';
import { CliError, ErrorCode } from '../utils/error.js';
import { emitStatus, isDryRun, isJsonMode } from '../utils/agent.js';
import { serializeJson } from '../utils/projection.js';
import { resolveSourcePassword, mapPdfError } from '../utils/pdfops.js';

/**
 * Map a parsed field to a `--data`-compatible export value, or `undefined` to
 * skip it. So the default export→edit→fill round-trip always re-applies cleanly:
 *   - text fields export their value (or `""`, which `fill` accepts);
 *   - checkbox/radio export their boolean state;
 *   - choice fields (dropdown/listbox) export a value ONLY when set — an unset
 *     choice would export `""`, which is not a valid option and would make a
 *     round-trip fill fail. Signature/button/unknown fields are always skipped.
 */
function fieldExportValue(f: ParsedFormField): FormFillValue | undefined {
    const v = f.value;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.length > 0 ? [...v] : undefined;
    if (typeof v === 'string') {
        if ((f.type === 'dropdown' || f.type === 'listbox') && v === '') return undefined;
        if (f.type === 'text' || f.type === 'dropdown' || f.type === 'listbox' || f.type === 'radio') return v;
        return undefined;
    }
    // v === null (unset): only text fields get a blank template default.
    return f.type === 'text' ? '' : undefined;
}

/** `fill --export`: emit the form's current values as a `--data`-shaped JSON map. */
async function exportValues(
    pdfBytes: Uint8Array,
    password: string | undefined,
    outputPath: string | undefined,
    pretty: boolean,
): Promise<void> {
    let fields: readonly ParsedFormField[];
    try {
        fields = readFormFields(pdfBytes, password !== undefined ? { password } : undefined);
    } catch (e) {
        throw mapPdfError(e, 'Failed to read form fields');
    }
    const map: Record<string, FormFillValue> = {};
    for (const f of fields) {
        const v = fieldExportValue(f);
        if (v !== undefined) map[f.name] = v;
    }
    const json = serializeJson(map, pretty) + '\n';
    await writeOutput(new TextEncoder().encode(json), outputPath);
}

/** Validate that a parsed JSON value is a valid `Record<string, FormFillValue>`. */
function coerceValues(parsed: unknown): Record<string, FormFillValue> {
    // Unwrap the `{ "values": {…} }` convenience form ONLY when `values` is
    // itself a map — so a form with a field literally named "values" (holding a
    // string/boolean/array) is still treated as the field map, not the wrapper.
    const isWrapper =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
        'values' in parsed &&
        (() => {
            const v = (parsed as { values: unknown }).values;
            return v !== null && typeof v === 'object' && !Array.isArray(v);
        })();
    const obj = isWrapper ? (parsed as { values: unknown }).values : parsed;
    // Malformed --data CONTENT is an input error (exit 1, E_INPUT) — the flag
    // itself is well-formed, so it is not a usage error. Keep this consistent
    // with the unknown-field / wrong-value paths below.
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new CliError(
            'Form data must be a JSON object mapping field name → value (string, boolean, or string[]).',
            1,
            ErrorCode.INPUT,
        );
    }
    const out: Record<string, FormFillValue> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'boolean') {
            out[key] = value;
        } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
            out[key] = value as readonly string[];
        } else {
            throw new CliError(
                `Invalid value for field "${key}": expected string, boolean, or string[].`,
                1,
                ErrorCode.INPUT,
            );
        }
    }
    return out;
}

async function loadValues(dataPath: string): Promise<Record<string, FormFillValue>> {
    validatePath(dataPath);
    const buf = await readFile(dataPath);
    assertJsonSizeLimit(buf);
    let parsed: unknown;
    try {
        parsed = JSON.parse(buf.toString('utf8'));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CliError(`Failed to parse --data JSON: ${msg}`, 1, ErrorCode.PARSE);
    }
    return coerceValues(parsed);
}

export async function fill(args: ParsedArgs): Promise<void> {
    const inputPath = getStringFlag(args.flags, 'input', 'i');
    const outputPath = getStringFlag(args.flags, 'output', 'o');
    const dataPath = getStringFlag(args.flags, 'data');
    const flatten = hasFlag(args.flags, 'flatten');
    const force = hasFlag(args.flags, 'force');
    const needAppearances = hasFlag(args.flags, 'need-appearances');
    const onUnknown = getStringFlag(args.flags, 'on-unknown') ?? 'throw';
    const password = resolveSourcePassword(args.flags);
    const doExport = hasFlag(args.flags, 'export');
    const dryRun = hasFlag(args.flags, 'dry-run') || isDryRun();

    // `--export` is a read-only mode: dump the current field values as a
    // `--data`-compatible JSON map (read → edit → fill round-trip). It ignores
    // --data / --flatten.
    if (doExport) {
        const inputBuf = await readFileOrStdin(inputPath);
        const pretty = hasFlag(args.flags, 'pretty') || !isJsonMode();
        await exportValues(new Uint8Array(inputBuf), password, outputPath, pretty);
        return;
    }

    if (onUnknown !== 'throw' && onUnknown !== 'ignore') {
        throw new CliError(`Invalid --on-unknown "${onUnknown}". Valid: throw, ignore.`, 2);
    }
    if (dataPath === undefined && !flatten) {
        throw new CliError(
            'fill requires --data <values.json>, --flatten, or --export.',
            2,
        );
    }

    const values = dataPath !== undefined ? await loadValues(dataPath) : undefined;

    const inputBuf = await readFileOrStdin(inputPath);
    const pdfBytes = new Uint8Array(inputBuf);

    if (dryRun) {
        // Validate the source opens and enumerate fields without writing output.
        let fieldCount: number;
        try {
            fieldCount = readFormFields(pdfBytes, password !== undefined ? { password } : undefined).length;
        } catch (e) {
            throw mapPdfError(e, 'Failed to read form fields');
        }
        emitStatus({
            command: 'fill',
            dryRun: true,
            fields: fieldCount,
            values: values !== undefined ? Object.keys(values).length : 0,
            flatten,
            output: outputPath ?? '-',
        });
        return;
    }

    let result: Uint8Array;
    try {
        if (values !== undefined) {
            const opts: { -readonly [K in keyof FillFormOptions]: FillFormOptions[K] } = {
                onUnknownField: onUnknown,
            };
            if (password !== undefined) opts.password = password;
            if (flatten) opts.flatten = true;
            if (needAppearances) opts.nonWinAnsi = 'needAppearances';
            result = fillForm(pdfBytes, values, opts);
        } else {
            // --flatten with no --data: flatten existing field values in place.
            const opts: { -readonly [K in keyof FlattenFormOptions]: FlattenFormOptions[K] } = {};
            if (password !== undefined) opts.password = password;
            if (force) opts.force = true;
            result = flattenForm(pdfBytes, opts);
        }
    } catch (e) {
        throw mapFillError(e);
    }

    await writeOutput(result, outputPath);
    emitStatus({
        command: 'fill',
        dryRun: false,
        values: values !== undefined ? Object.keys(values).length : 0,
        flatten: flatten || values === undefined,
        output: outputPath ?? '-',
        bytes: result.length,
    });
}

/** Map form-fill errors to stable codes; falls back to password/parse mapping. */
function mapFillError(e: unknown): CliError {
    if (e instanceof FormFieldNotFoundError || e instanceof FormValueTypeError) {
        return new CliError(e.message, 1, ErrorCode.INPUT);
    }
    if (e instanceof FormUnsupportedError) {
        return new CliError(e.message, 1, ErrorCode.UNSUPPORTED);
    }
    return mapPdfError(e, 'Failed to fill form');
}
