// Agent-mode helpers — the cross-cutting "machine contract" that lets an
// autonomous caller (an AI agent, a CI step, another program) drive the CLI
// deterministically.
//
// Contract (see docs/KNOWLEDGE_BASE.md → "Agent automation contract"):
//   • stdout carries the primary artifact (PDF, JSON report, schema, script).
//   • stderr carries ALL diagnostics, including the agent envelopes below.
//   • Global `--json` sets PDFNATIVE_JSON=1 (done in index.ts). In that mode:
//       – on any failure, a single JSON object is written to stderr:
//           { "ok": false, "command": <name|null>,
//             "error": { "code": "E_*", "message": "…" } }
//       – render/sign/batch emit a success status envelope to stderr:
//           { "ok": true, "command": "render", … }
//   • Numeric exit codes (0/1/2) are unchanged in every mode.
//
// This module is intentionally tiny and dependency-free: agent mode is a thin
// presentation layer over the existing dispatch, never a separate runtime.

import { CliError, ErrorCode, type ErrorCodeValue } from './error.js';

/** True when the caller passed the global `--json` flag (agent mode). */
export function isJsonMode(): boolean {
    return process.env['PDFNATIVE_JSON'] === '1';
}

/** True when `--dry-run` is in effect (set by index.ts for the active command). */
export function isDryRun(): boolean {
    return process.env['PDFNATIVE_DRY_RUN'] === '1';
}

export interface AgentErrorEnvelope {
    readonly ok: false;
    readonly command: string | null;
    readonly error: {
        readonly code: ErrorCodeValue;
        readonly message: string;
    };
}

const DEFAULT_MESSAGE: Readonly<Record<ErrorCodeValue, string>> = {
    [ErrorCode.USAGE]: 'usage error',
    [ErrorCode.INPUT]: 'invalid input',
    [ErrorCode.PARSE]: 'failed to parse input',
    [ErrorCode.IO]: 'I/O error',
    [ErrorCode.SIGN]: 'failed to sign PDF',
    [ErrorCode.VERIFY_FAILED]: 'one or more signatures failed verification',
    [ErrorCode.CHECK_FAILED]: 'one or more checks failed',
    [ErrorCode.UNSUPPORTED]: 'unsupported operation',
    [ErrorCode.RUNTIME]: 'runtime error',
};

/** Build the machine-readable error envelope for any thrown value. */
export function buildErrorEnvelope(command: string | null, err: unknown): AgentErrorEnvelope {
    if (err instanceof CliError) {
        const message = err.message.length > 0 ? err.message : DEFAULT_MESSAGE[err.code];
        return { ok: false, command, error: { code: err.code, message } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, command, error: { code: ErrorCode.RUNTIME, message } };
}

/** Write the JSON error envelope to stderr (single line, newline-terminated). */
export function emitJsonError(command: string | null, err: unknown): void {
    process.stderr.write(JSON.stringify(buildErrorEnvelope(command, err)) + '\n');
}

/**
 * Emit a success status envelope to stderr when in agent (`--json`) mode.
 * No-op otherwise, so commands can call it unconditionally. stdout is never
 * touched here — it stays reserved for the primary artifact.
 */
export function emitStatus(envelope: Readonly<Record<string, unknown>>): void {
    if (!isJsonMode()) return;
    process.stderr.write(JSON.stringify({ ok: true, ...envelope }) + '\n');
}
