// Batch manifest — parse & validate a `batch --manifest tasks.json` pipeline.
//
// A manifest declares an ordered list of tasks, each invoking one whitelisted
// CLI command with a flat flag map. Validation is STRICT and happens before
// any execution:
//   • structural violations (wrong shape/types/version) → exit 2, E_USAGE
//   • value violations (bad id, duplicate id, unknown command, bad @ref)
//                                                       → exit 1, E_INPUT
//   • network-reaching flags without --allow-network    → exit 2, E_USAGE
//
// Relative paths in path-carrying flags resolve against the DIRECTORY of the
// manifest file (after the same traversal check the CLI applies to direct
// flags). A flag value "@<id>" references the resolved `output` of an EARLIER
// task and is substituted with that path. Everything here is pure data
// validation — no filesystem I/O, no imports of command modules.

import { dirname, isAbsolute, resolve } from 'node:path';
import { CliError, ErrorCode } from './error.js';
import { validatePath } from './io.js';

/**
 * Commands a manifest task may invoke. Meta/orchestration commands never are.
 * `ltv` and `compare` are excluded for now: manifest tasks carry only flags,
 * and both commands require positional arguments (subcommand / two PDF paths)
 * — tracked in ROADMAP as "positional args in manifest tasks".
 */
export const MANIFEST_COMMANDS: ReadonlySet<string> = new Set([
    'render', 'sign', 'verify', 'inspect', 'merge', 'split', 'extract',
    'extract-text', 'fill', 'encrypt', 'decrypt', 'annotate',
    'metadata', 'doc-timestamp',
]);

/** Hard cap on manifest size in tasks (DoS guard; far above any real pipeline). */
const MAX_TASKS = 1000;

/** Explicitly forbidden (meta / orchestration) — called out in the error. */
const FORBIDDEN_COMMANDS: ReadonlySet<string> = new Set([
    'batch', 'govern', 'schema', 'completion', 'doctor',
]);

const ID_RE = /^[A-Za-z0-9_-]+$/;

/** Flags whose relative values resolve against the manifest directory. */
const PATH_FLAGS: ReadonlySet<string> = new Set([
    'input', 'i', 'output', 'o', 'output-dir',
    'key', 'cert', 'cert-chain', 'trust',
    'data', 'annotations', 'template', 'layout', 'watermark-image',
    // v1.5.0: PDF/X output profile and user-shipped font programs
    'output-intent-icc', 'font-file',
]);

export interface ManifestTaskPlan {
    readonly id: string;
    readonly command: string;
    /** Fully resolved flags (paths absolute, @refs substituted), ParsedArgs-shaped. */
    readonly flags: Readonly<Record<string, string | boolean | readonly string[]>>;
    /** Resolved output path when the task declares --output. */
    readonly output: string | undefined;
    /** Directory the task writes into (created with mkdir -p before running). */
    readonly outputDir: string | undefined;
    /** ids of earlier tasks referenced via "@id" values. */
    readonly dependsOn: readonly string[];
    /** Name of a network-reaching flag the task carries, if any. */
    readonly networkFlag: string | undefined;
}

export interface ManifestPlan {
    readonly tasks: readonly ManifestTaskPlan[];
}

function usageError(message: string): CliError {
    return new CliError(message, 2, ErrorCode.USAGE);
}

function inputError(message: string): CliError {
    return new CliError(message, 1, ErrorCode.INPUT);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Detect a network-reaching flag on a task. Returns the flag name or undefined. */
function detectNetworkFlag(
    command: string,
    flags: Readonly<Record<string, string | boolean | readonly string[]>>,
): string | undefined {
    if (flags['timestamp'] !== undefined) return 'timestamp';
    if (command === 'doc-timestamp' && flags['url'] !== undefined) return 'url';
    if (flags['online'] !== undefined) return 'online';
    const revocation = flags['revocation'];
    if (typeof revocation === 'string' && revocation.trim().toLowerCase() === 'online') {
        return 'revocation';
    }
    return undefined;
}

/**
 * Resolve one string flag value: substitute an "@id" reference with the
 * referenced task's output path, or resolve a relative path flag against the
 * manifest directory. Records @-dependencies in `dependsOn`.
 */
function resolveValue(
    value: string,
    key: string,
    taskId: string,
    manifestDir: string,
    priorOutputs: ReadonlyMap<string, string | undefined>,
    dependsOn: Set<string>,
): string {
    if (value.startsWith('@')) {
        const refId = value.slice(1);
        if (!priorOutputs.has(refId)) {
            throw inputError(
                `Task "${taskId}": flag "${key}" references "@${refId}", which is not an `
                + 'EARLIER task in the manifest (forward and unknown references are not allowed).',
            );
        }
        const refOutput = priorOutputs.get(refId);
        if (refOutput === undefined) {
            throw inputError(
                `Task "${taskId}": flag "${key}" references "@${refId}", but task "${refId}" `
                + 'declares no "output" flag to reference.',
            );
        }
        dependsOn.add(refId);
        return refOutput;
    }
    if (PATH_FLAGS.has(key)) {
        // Same traversal check the CLI applies to direct path flags — a
        // manifest must not accept a relative escape the command line rejects.
        validatePath(value);
        if (!isAbsolute(value)) {
            return resolve(manifestDir, value);
        }
    }
    return value;
}

/** Validate + resolve one task's flag map into ParsedArgs-shaped flags. */
function resolveFlags(
    taskId: string,
    rawFlags: Record<string, unknown>,
    manifestDir: string,
    priorOutputs: ReadonlyMap<string, string | undefined>,
): { flags: Record<string, string | boolean | readonly string[]>; dependsOn: readonly string[] } {
    const flags: Record<string, string | boolean | readonly string[]> = {};
    const dependsOn = new Set<string>();

    for (const [key, value] of Object.entries(rawFlags)) {
        if (key.length === 0 || key.startsWith('-') || /[\s=]/.test(key)) {
            throw usageError(
                `Task "${taskId}": invalid flag name "${key}" (use the bare flag name, `
                + 'without leading dashes, whitespace or "=").',
            );
        }
        if (typeof value === 'boolean') {
            // true → bare `--key`; false → the flag is simply omitted, matching
            // the argv conversion contract (there is no `--key false` form).
            if (value) flags[key] = true;
            continue;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                throw usageError(`Task "${taskId}": flag "${key}" must be a finite number.`);
            }
            flags[key] = String(value);
            continue;
        }
        if (typeof value === 'string') {
            flags[key] = resolveValue(value, key, taskId, manifestDir, priorOutputs, dependsOn);
            continue;
        }
        if (Array.isArray(value)) {
            const items: string[] = [];
            for (const item of value as unknown[]) {
                if (typeof item !== 'string') {
                    throw usageError(
                        `Task "${taskId}": flag "${key}" must be an array of strings.`,
                    );
                }
                items.push(resolveValue(item, key, taskId, manifestDir, priorOutputs, dependsOn));
            }
            flags[key] = items;
            continue;
        }
        throw usageError(
            `Task "${taskId}": flag "${key}" has an unsupported value type — allowed: `
            + 'string, number, boolean, string[].',
        );
    }

    return { flags, dependsOn: [...dependsOn] };
}

/**
 * Parse and strictly validate a batch manifest.
 *
 * @param raw         - Raw manifest file content (JSON text).
 * @param manifestDir - Absolute directory of the manifest file (path anchor).
 */
export function parseManifest(raw: string, manifestDir: string): ManifestPlan {
    let doc: unknown;
    try {
        doc = JSON.parse(raw);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new CliError(`Manifest is not valid JSON: ${message}`, 1, ErrorCode.PARSE);
    }

    if (!isPlainObject(doc)) {
        throw usageError('Manifest must be a JSON object { "version": 1, "tasks": [...] }.');
    }
    if (doc['version'] !== 1) {
        throw usageError(
            `Unsupported manifest "version": ${JSON.stringify(doc['version'])}. This CLI supports version 1.`,
        );
    }
    const tasksRaw = doc['tasks'];
    if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
        throw usageError('Manifest "tasks" must be a non-empty array.');
    }
    if (tasksRaw.length > MAX_TASKS) {
        throw usageError(
            `Manifest declares ${tasksRaw.length} tasks — the maximum is ${MAX_TASKS}.`,
        );
    }

    const tasks: ManifestTaskPlan[] = [];
    // id → resolved output path (undefined when the task has no --output).
    const priorOutputs = new Map<string, string | undefined>();

    for (const [index, taskRaw] of tasksRaw.entries()) {
        if (!isPlainObject(taskRaw)) {
            throw usageError(`Manifest task #${index + 1} must be an object.`);
        }
        const id = taskRaw['id'];
        if (typeof id !== 'string' || id.length === 0) {
            throw usageError(`Manifest task #${index + 1}: "id" must be a non-empty string.`);
        }
        if (!ID_RE.test(id)) {
            throw inputError(
                `Manifest task "${id}": invalid id — allowed characters: A-Z a-z 0-9 _ -`,
            );
        }
        if (priorOutputs.has(id)) {
            throw inputError(`Manifest task id "${id}" is duplicated — ids must be unique.`);
        }
        const command = taskRaw['command'];
        if (typeof command !== 'string' || command.length === 0) {
            throw usageError(`Manifest task "${id}": "command" must be a non-empty string.`);
        }
        if (!MANIFEST_COMMANDS.has(command)) {
            const reason = FORBIDDEN_COMMANDS.has(command)
                ? `"${command}" is a meta/orchestration command and is never allowed in a manifest`
                : `"${command}" is not a whitelisted manifest command`;
            throw inputError(
                `Manifest task "${id}": ${reason}. Allowed: ${[...MANIFEST_COMMANDS].join(', ')}.`,
            );
        }
        const flagsRaw = taskRaw['flags'] ?? {};
        if (!isPlainObject(flagsRaw)) {
            throw usageError(`Manifest task "${id}": "flags" must be an object.`);
        }

        const { flags, dependsOn } = resolveFlags(id, flagsRaw, manifestDir, priorOutputs);

        const outputValue = flags['output'] ?? flags['o'];
        const output = typeof outputValue === 'string' ? outputValue : undefined;
        const outputDirValue = flags['output-dir'];
        const outputDir = typeof outputDirValue === 'string'
            ? outputDirValue
            : (output !== undefined ? dirname(output) : undefined);

        tasks.push({
            id,
            command,
            flags,
            output,
            outputDir,
            dependsOn,
            networkFlag: detectNetworkFlag(command, flags),
        });
        priorOutputs.set(id, output);
    }

    return { tasks };
}

/**
 * Enforce the offline-by-default policy: an untrusted manifest must not be
 * able to trigger network access. Any network-reaching task flag requires the
 * batch invocation itself to carry `--allow-network`.
 */
export function assertOfflinePolicy(plan: ManifestPlan, allowNetwork: boolean): void {
    if (allowNetwork) return;
    for (const task of plan.tasks) {
        if (task.networkFlag !== undefined) {
            throw usageError(
                `Manifest task "${task.id}" carries the network-reaching flag `
                + `"${task.networkFlag}", but batch was invoked without --allow-network. `
                + 'Manifests are offline by default; pass --allow-network to permit '
                + 'network access for this pipeline.',
            );
        }
    }
}
