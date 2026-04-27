---
description: "Use when working on the CLI entry point, arg parser, or overall dispatch logic. Covers entry point contract, help formatting, and exit code conventions."
applyTo: "src/index.ts"
---
# CLI Design Standards

## Entry Point Rules

- `main()` is the sole entry point — called at module bottom with `main().catch(...)`.
- Command dispatch uses a `switch` on `args.positionals[0]`.
- `--help` / `-h` is checked before command dispatch — print help and `process.exit(0)`.
- `--version` / `-V` prints `package.json` `version` and  exits 0.
- Unknown commands print `"Unknown command: <name>. Run pdfnative --help for usage."` to stderr, then exit 1.

## Exit Codes

| Code | Meaning                                   |
|------|-------------------------------------------|
| 0    | Success                                   |
| 1    | Runtime error (invalid input, I/O error)  |
| 2    | Usage error (missing required argument)   |

## Help Text Format

```
pdfnative-cli — Official CLI for pdfnative

Usage:
  pdfnative <command> [options]

Commands:
  render    Render a JSON document definition to PDF
  sign      Apply a digital signature to an existing PDF
  inspect   Analyse a PDF and output metadata / conformance info

Options:
  --help, -h      Show this help message
  --version, -V   Show version

Run `pdfnative <command> --help` for per-command options.
```

## Arg Parser Rules (`src/utils/args.ts`)

- Handle: `--flag value`, `--flag=value`, `-f value`, `--flag` (boolean).
- `--` stops flag parsing; remaining tokens become positionals.
- Return type: `ParsedArgs = { flags: Record<string, string | boolean>; positionals: string[] }`.
- Helper: `getFlag(flags, ...names)` returns the first matching flag value or `undefined`.
- Never throw on unknown flags — collect them silently.

## Naming

- Command functions: `render`, `sign`, `inspect` (verb, no prefix).
- Flag names: kebab-case (`--input`, `--output`, `--key`, `--cert`).
- Env vars: `PDFNATIVE_SIGN_KEY`, `PDFNATIVE_SIGN_CERT` (screaming snake).
