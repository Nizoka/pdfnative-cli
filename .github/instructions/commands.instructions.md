---
description: "Use when implementing or modifying render, sign, or inspect commands. Covers flag conventions, stdin/stdout, streaming, secret handling, and error contracts."
applyTo: "src/commands/**"
---
# Command Implementation

> Shared conventions and security constraints are in `.github/copilot-instructions.md`
> (Command Conventions + Security Constraints). This file only adds per-command deltas.

## Shared

- Signature: `export async function <name>(args: ParsedArgs): Promise<void>`.
- `--input` omitted → stdin; `--output` omitted → stdout (binary via `process.stdout.write`).
- Usage error → `CliError(msg, 2)`; runtime error → `CliError(msg, 1)`. Never swallow errors.
- Validate every path arg against `..` traversal before read/write.

## Agent contract (cross-cutting)

- **Error codes:** pass a stable `ErrorCode` as the 3rd `CliError` arg
  (`E_USAGE`/`E_INPUT`/`E_PARSE`/`E_IO`/`E_SIGN`/`E_VERIFY_FAILED`/`E_CHECK_FAILED`/
  `E_UNSUPPORTED`/`E_RUNTIME`). Omitting it derives `E_USAGE` from exit 2, else `E_RUNTIME`.
- **`--json`:** never write the envelope yourself in the dispatcher path — `index.ts` emits
  the failure envelope. Use `emitStatus({...})` (from `utils/agent.ts`) for success status on
  `render`/`sign`/`batch`; it is a no-op outside `--json`. stdout stays artifact-only.
- **`--dry-run`:** read `hasFlag(args.flags, 'dry-run') || isDryRun()`; validate fully, then
  short-circuit before producing/writing output.
- In `--json` mode, do NOT pre-print a detail to stderr that the envelope already carries
  (e.g. `inspect --check` detail rides in the `CliError` message instead).
- **Output projection (`inspect`/`verify`/`batch`):** route the JSON-on-stdout branch through
  `utils/projection.ts`. Order: `out = --summary ? toSummary(full) : full`, then
  `if (--fields) out = selectFields(out, parseFieldList(raw))`, then
  `serializeJson(out, hasFlag('pretty') || !isJsonMode())`. Compact is the default under
  `--json`; `--pretty` opts back in; non-`--json` stays pretty. Keep `--summary` shapes minimal
  and in lock-step with the `*-summary` `schema` subjects. Strip `summary`/`fields`/`pretty`
  from any flags forwarded to a sub-command (see `batch`'s `BATCH_ONLY_FLAGS`).

## `render`

- JSON → `DocumentParams` (or `PdfParams` when `--variant table`). 50 MB cap before `JSON.parse`.
- Streaming flags are mutually exclusive: `--stream`, `--stream-page-by-page`, `--stream-true`
  (1.3.0 `buildDocumentPDFStreamTrue` / `buildPDFStreamTrue`). `--stream` and `--stream-true`
  reject TOC blocks and `{pages}`.
- `--font` allow-list: `latin`, `emoji`, `color-emoji`, and 22 script codes
  (`ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`). Name doubles as `--lang`.
- `--max-blocks <n>` → positive integer → `layout.maxBlocks` (invalid → `CliError` exit 2).

## `sign`

- Secret priority: env (`PDFNATIVE_SIGN_KEY` / `PDFNATIVE_SIGN_CERT`) over `--key` / `--cert`.
- **Never log key material.** Replace any `signPdfBytes` error with the fixed string
  `'Failed to sign PDF.'`. Missing key or cert → `CliError` exit 2.
- `--timestamp` is reserved and must error clearly (sign-side LTV upstream-blocked).

## `inspect`

- Default `--format json`; `--text` is human-readable. No raw binary blobs in output.
- `--pdfua` adds a `validatePdfUA` report `{ valid, errors, warnings }`.
- `--check` allow-list: `pdfa`, `signed`, `encrypted`, `pdfua` (sets exit code 0/1).

## `verify` / `batch` / `completion`

- `verify`: offline by default; online revocation only through `utils/fetch-guard.ts`.
  Redact CMS parse errors — never leak byte offsets / parser state. Strict fail →
  `CliError('', 1, ErrorCode.VERIFY_FAILED)`.
- `batch`: parallel directory render, reuse render logic, per-file summary. Global `--json`
  forces the JSON summary. `--dry-run` skips `mkdir` and forwards to each `render`.
- `completion`: emit static bash/zsh/fish scripts only (keep `schema` + `--json`/`--dry-run`
  in the flag/command tables).

## `schema`

- `pdfnative schema [render|inspect|verify|batch|list]` — print a hand-authored, versioned
  JSON Schema (Draft 2020-12). `$id` embeds the CLI version. Pure data, zero deps; the CLI
  only PRODUCES schemas (no bundled validator). Unknown subject → `CliError(..., 2, USAGE)`.
