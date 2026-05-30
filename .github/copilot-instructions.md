# pdfnative-cli — Project Guidelines

## Overview

Official CLI companion to the `pdfnative` library. Exposes six commands:
`render` (JSON → PDF), `sign` (digital signature), `inspect` (PDF analysis),
`verify` (CMS/PKCS#7 + LTV verification), `batch` (parallel directory render),
and `completion` (shell-completion scripts).

**Philosophy:** Zero extra runtime dependencies. `pdfnative` is the only
dependency — all PDF logic lives there. The CLI is a thin, composable
dispatch layer over it.

**Targets:** Node.js ≥ 20, Bun, Deno (via `node dist/cli.cjs`).

## Architecture

```
src/
├── index.ts           # CLI entry: parse argv → config merge → dispatch → exit
├── commands/
│   ├── render.ts      # JSON input → buildDocumentPDF* → output (+ smart tables, page streaming)
│   ├── sign.ts        # PDF input + key/cert → addSignaturePlaceholder → signPdfBytes → output
│   ├── inspect.ts     # PDF input → PdfReader → JSON/text metadata report
│   ├── verify.ts      # PDF input → CMS + timestamp + revocation → JSON/text report
│   ├── batch.ts       # Directory of JSON → parallel render reuse → per-file summary
│   └── completion.ts  # Emit bash/zsh/fish completion scripts
├── utils/
│   ├── args.ts            # Zero-dep argument parser (flags, positionals, = notation)
│   ├── io.ts              # stdin/stdout/file I/O helpers + path-traversal guard
│   ├── error.ts           # CliError class, die() helper
│   ├── config.ts          # `.pdfnativerc.json` discovery + flag-default merge
│   ├── colors.ts          # NO_COLOR/TTY-aware ANSI helper
│   ├── keys.ts            # PEM/DER loaders for RSA + EC private keys + X.509 certs
│   ├── layout.ts          # `--layout` flag parsing & `PdfLayoutOptions` assembly
│   ├── asn1-walk.ts       # ASN.1/DER walker with absolute byte offsets (50 MiB cap)
│   ├── cms-verify.ts      # RSA/ECDSA CMS signature-value + verifySignedStructure (CRL/OCSP)
│   ├── cert-chain.ts      # X.509 chain construction + trust evaluation (shared)
│   ├── timestamp-verify.ts # RFC 3161 timestamp-token validation (PAdES-T)
│   ├── revocation.ts      # OCSP (RFC 6960) + CRL (RFC 5280), embedded DSS + online
│   └── fetch-guard.ts     # SSRF-guarded HTTP(S) client for opt-in online revocation
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
  Errors from `signPdfBytes` are replaced with the fixed string `'Failed to sign PDF.'`.
- Path arguments are validated against path traversal before `fs.readFile` / `fs.writeFile`.
- Input JSON size is capped at 50 MB before `JSON.parse` to prevent memory exhaustion.
- ASN.1 content lengths in `utils/asn1-walk.ts` are capped at 50 MiB per node.
- `inspect` JSON output is sanitized (no raw binary blobs in default output).
- `verify` redacts CMS parse errors — internal byte offsets / parser state never leak.
- `verify` validates RFC 3161 timestamps (PAdES-T) and checks OCSP/CRL revocation; it is
  **offline by default**. Online revocation (`--revocation online`) only runs through the
  SSRF guard in `utils/fetch-guard.ts` (scheme allow-list, private/loopback/link-local/
  CGNAT/multicast IPv4+IPv6 blocking, no redirects, timeout + size caps).
- CRL/OCSP/TSA signatures are always cryptographically verified; unverifiable revocation
  data yields `unknown`, never `good`.
- Sign-side LTV (timestamp embedding / DSS) is upstream-blocked — `sign --timestamp` is
  reserved and errors clearly (see [SECURITY.md](../SECURITY.md)).

## Code Style

- **TypeScript strict mode** — `strict: true`.
- **ESM-first** — all internal imports use `.js` extension.
- **`const` over `let`** — never use `var`.
- **No `any`** — use `unknown` with type narrowing.
- **No `console.log`** — use `process.stdout.write(msg + '\n')` / `process.stderr.write(msg + '\n')`.
- **`readonly`** on interface props where mutation is not needed.
