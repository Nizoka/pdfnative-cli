# pdfnative-cli — Project Guidelines

## Overview

Official CLI companion to the `pdfnative` library. Exposes three commands:
`render` (JSON → PDF), `sign` (digital signature), `inspect` (PDF analysis).

**Philosophy:** Zero extra runtime dependencies. `pdfnative` is the only
dependency — all PDF logic lives there. The CLI is a thin, composable
dispatch layer over it.

**Targets:** Node.js ≥ 20, Bun, Deno (via `node dist/cli.cjs`).

## Architecture

```
src/
├── index.ts           # CLI entry: parse argv → dispatch → exit
├── commands/
│   ├── render.ts      # JSON input → buildDocumentPDFBytes / streamDocumentPdf → output
│   ├── sign.ts        # PDF input + key/cert → signPdfBytes → output
│   └── inspect.ts     # PDF input → PdfReader → JSON/text metadata report
├── utils/
│   ├── args.ts        # Zero-dep argument parser (flags, positionals, = notation)
│   ├── io.ts          # stdin/stdout/file I/O helpers
│   └── error.ts       # CliError class, die() helper
└── core-bridge/
    └── index.ts       # Selective re-exports from pdfnative (keeps the surface minimal)
```

## Entry Point Contract (`src/index.ts`)

- First positional arg is the command name.
- `--help` / `-h` anywhere in argv prints usage and exits 0.
- `--version` / `-v` prints the version from `package.json` and exits 0.
- Unknown command prints error to stderr and exits 1.
- `CliError` is caught in `main()` — prints `.message` to stderr, exits `.exitCode`.
- All other unhandled errors exit 1.
- **Never uses `console.log`** — only `process.stdout.write` and `process.stderr.write`.

## Zero-Dep Arg Parser Contract (`src/utils/args.ts`)

- `parseArgs(argv: string[]): ParsedArgs`
- `ParsedArgs = { flags: Record<string, string | boolean>; positionals: string[] }`
- Supports: `--flag value`, `--flag=value`, `-f value`, `--flag` (boolean true).
- `--` terminates flag parsing; all following tokens go into `positionals`.
- Never throws — unknown flags are collected as-is.

## Command Conventions (`src/commands/`)

- Each command exports a single async function: `export async function render(args: ParsedArgs): Promise<void>`
- Secret loading priority for `sign`: env vars (`PDFNATIVE_SIGN_KEY`, `PDFNATIVE_SIGN_CERT`) take precedence over `--key`/`--cert` file paths.
- `--input` for input file path; omit → read from stdin.
- `--output` for output file path; omit → write to stdout.
- Validation errors throw `CliError` with exit code 1.
- Usage errors (missing required flag) throw `CliError` with exit code 2.

## Security Constraints

- `sign` command: **never log key material** — not in debug mode, not in error messages.
- Path arguments are validated against path traversal before `fs.readFile` / `fs.writeFile`.
- Input JSON size is capped at 50 MB before `JSON.parse` to prevent memory exhaustion.
- `inspect` JSON output is sanitized (no raw binary blobs in default output).

## Code Style

- **TypeScript strict mode** — `strict: true`.
- **ESM-first** — all internal imports use `.js` extension.
- **`const` over `let`** — never use `var`.
- **No `any`** — use `unknown` with type narrowing.
- **No `console.log`** — use `process.stdout.write(msg + '\n')` / `process.stderr.write(msg + '\n')`.
- **`readonly`** on interface props where mutation is not needed.
