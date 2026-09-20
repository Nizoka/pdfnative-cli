---
description: "Use when working on the CLI entry point, arg parser, global flags or overall dispatch logic. Covers entry point contract, global-flag placement, usage text parity, help formatting, and exit code conventions."
applyTo: "src/index.ts,src/utils/args.ts,src/utils/argv.ts,src/utils/reproducible.ts"
---
# CLI Design

> Entry-point and arg-parser contracts live in `.github/copilot-instructions.md`. This file only
> adds deltas — do not restate the global rules.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (invalid input, I/O failure, failed check) |
| 2 | Usage error (missing/invalid required argument) |

## Dispatch

- `parseArgs(argv, { booleanFlags: GLOBAL_BOOLEAN_FLAGS })` so `--json render` never swallows the
  command name as a value; `splitCommandArgv()` (`utils/argv.ts`) then finds the command wherever
  the global flags sit — **global flags may precede or follow the command** (v1.5.0).
- `loadCommand()` switches on the command name and dynamically imports `commands/<name>.js` (one
  `case` per command). The `--help` switch prints `<NAME>_USAGE`. Both switches must know every
  command in `completion.ts` `COMMANDS` (`verify:docs` rule `command-parity`).
- `--help`/`-h` and `--version`/`-V` (`--json` → `{ name, version }`) are handled before dispatch.
- Unknown command → stderr message + exit 1 (`E_RUNTIME` envelope under `--json`); arguments with no command at all → exit 2 (`E_USAGE`); a bare `pdfnative` prints the usage and exits 0.
- A COMMAND flag placed before the command (`--strict render …`) is recovered: `splitCommandArgv(argv, KNOWN_COMMANDS)` takes the first token that is a command name.

## Global flags

- `--json` sets `PDFNATIVE_JSON=1`, `--dry-run` sets `PDFNATIVE_DRY_RUN=1`, so commands and
  `utils/agent.ts` read them from env; `--quiet`, `--no-color`, `--config`, `--no-config`,
  `--max-inflate-size` and `--creation-date` complete the ten (`completion.ts` `GLOBAL_FLAGS`).
- `--creation-date <iso8601>` (or `SOURCE_DATE_EPOCH`, resolved by `utils/reproducible.ts`) is
  applied process-wide after the config merge with `bridge.setDefaultCreationDate()`, so `batch`
  tasks inherit it; an invalid value is a usage error (exit 2), never ignored.
- Track the active command in a module-level `activeCommand`; on a thrown error, when
  `isJsonMode()` is true, `emitJsonError(activeCommand, e)` writes the failure envelope to stderr
  and the process exits with `CliError.exitCode` (default 1). Numeric exit codes are unchanged in
  every mode — `--json` only adds the envelope.

## Help text

- One global `USAGE` block listing all commands under `Commands (N):` (N is checked against the
  completion table) and the global options, plus one `<NAME>_USAGE` block per command.
- Every `--flag` a `<NAME>_USAGE` text names must be in that command's `completion.ts` entry (or a
  global flag), and every completion flag must appear in the usage text (`verify:docs` rule
  `flag-parity`). A deprecated flag stays documented on a line marked `DEPRECATED` and is left
  out of the completion table.
- Point pipeline agents at `docs/AGENT_CONTRACT.md`; repository agents at `AGENTS.md`.
