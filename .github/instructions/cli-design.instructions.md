---
description: "Use when working on the CLI entry point, arg parser, or overall dispatch logic. Covers entry point contract, help formatting, and exit code conventions."
applyTo: "src/index.ts"
---
# CLI Design

> Entry-point and arg-parser contracts live in `.github/copilot-instructions.md`. This file only
> adds deltas — do not restate the global rules.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (invalid input, I/O failure) |
| 2 | Usage error (missing/invalid required argument) |

## Dispatch

- `switch` on `args.positionals[0]` over the commands: `render`, `sign`, `inspect`,
  `verify`, `batch`, `completion`, `schema`.
- `--help`/`-h` and `--version`/`-v` handled before dispatch.
- Unknown command → stderr message + exit 1.

## Agent globals

- The global-flag block sets `PDFNATIVE_JSON=1` on `--json` and `PDFNATIVE_DRY_RUN=1` on
  `--dry-run` so all commands and `utils/agent.ts` can read them via env.
- Track the active command in a module-level `activeCommand` (set in `main()`); on a thrown
  error, when `isJsonMode()` is true, `emitJsonError(activeCommand, e)` writes the failure
  envelope to stderr and the process exits with the `CliError.exitCode` (default 1).
- Numeric exit codes (0/1/2) are unchanged in every mode — `--json` only adds the envelope.

## Help text

- One global `USAGE` block listing all commands (incl. `schema`) and the `--json` / `--dry-run`
  global options, plus one `*_USAGE` block per command. Point agents at `AGENTS.md`.
- Keep `*_USAGE` flag lists in sync with each command's actual flags.
