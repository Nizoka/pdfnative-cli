# pdfnative-cli — Project Guidelines

## Overview

Official CLI companion to the `pdfnative` library. Exposes eleven commands:
`render` (JSON → PDF), `sign` (digital signature), `inspect` (PDF analysis),
`verify` (CMS/PKCS#7 + LTV verification), `merge` / `split` / `extract` (page-tree ops),
`annotate` (markup annotations), `govern` (AI-governance / HITL), `batch` (parallel
directory render), and `completion` (shell-completion scripts). Plus a `schema` command
that exports versioned JSON Schemas for agent self-validation.

**Philosophy:** Zero extra runtime dependencies. `pdfnative` is the only
dependency — all PDF logic lives there. The CLI is a thin, composable
dispatch layer over it.

**Targets:** Node.js ≥ 20, Bun, Deno (via `node dist/cli.cjs`).

## Working Modes & Token Economy

Default to the cheapest mode that fits the request. Do not over-explore.

- **Plan mode** — for vague, multi-file, or risky requests. Produce a short numbered plan
  (files to touch + approach), then stop for confirmation. No edits yet. Keep it to a handful
  of bullets; do not dump file contents.
- **Implement mode** — for clear, scoped requests. Edit directly, then validate. Skip the plan.

Token discipline (this file loads on every request — keep edits to it minimal):

- Read in **wide ranges**, not many small reads. Batch independent searches/reads in parallel.
- Stop searching once you can act. Don't re-search for facts already in context or in
  `/memories/repo/`.
- Don't restate file contents back to the user; summarize in 1–3 sentences.
- Reuse the per-area instruction files (`.github/instructions/*`) instead of re-deriving
  conventions; they hold the deltas, this file holds the globals.
- After code changes, run the smallest sufficient check (targeted test) before the full suite.

## Architecture

```
src/
├── index.ts           # CLI entry: parse argv → config merge → dispatch → exit
├── commands/
│   ├── render.ts      # JSON input → buildDocumentPDF* → output (+ smart tables, page streaming, outline, layout inspect)
│   ├── sign.ts        # PDF input + key/cert → addSignaturePlaceholder → signPdfBytes (native node:crypto default) → output
│   ├── inspect.ts     # PDF input → PdfReader → JSON/text metadata report (+ annotations, page labels)
│   ├── verify.ts      # PDF input → CMS + timestamp + revocation → JSON/text report
│   ├── merge.ts       # Several PDFs → mergePdfs → combined PDF
│   ├── split.ts       # One PDF → splitPdf → many PDFs (per-page or per-range) in --output-dir
│   ├── extract.ts     # One PDF + --pages → extractPages → new PDF
│   ├── annotate.ts    # PDF + --annotations JSON → createModifier + buildAnnotationBody → incremental save
│   ├── govern.ts      # AI-governance / HITL: rules | policy | verify-issue (E_POLICY gate)
│   ├── schema.ts      # Emit versioned JSON Schemas (render/inspect/verify/batch/annotate/govern-verify + summaries)
│   ├── batch.ts       # Directory of JSON → parallel render reuse → per-file summary
│   └── completion.ts  # Emit bash/zsh/fish completion scripts
├── utils/
│   ├── args.ts            # Zero-dep argument parser (flags, positionals, = notation)
│   ├── io.ts              # stdin/stdout/file I/O helpers + path-traversal guard
│   ├── error.ts           # CliError class, die() helper, ErrorCode (incl. E_POLICY)
│   ├── config.ts          # `.pdfnativerc.json` discovery + flag-default merge
│   ├── colors.ts          # NO_COLOR/TTY-aware ANSI helper
│   ├── projection.ts      # Agent output projection (compact JSON, --summary, --fields)
│   ├── pages.ts           # Zero-dep 1-based page-list / page-range parsing
│   ├── pdfops.ts          # --max-output-size parsing + source-path collection (traversal guard)
│   ├── governance.ts      # AI-governance policy + AGENT_RULES text + pure draft validator
│   ├── keys.ts            # PEM/DER loaders for RSA + EC private keys + X.509 certs + native crypto provider
│   ├── layout.ts          # `--layout` / `--debug-layout` parsing & `PdfLayoutOptions` assembly
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
- `merge`/`split`/`extract`/`annotate` validate every path (incl. `merge` positionals and
  `--output-dir`) against traversal, cap output via `--max-output-size`, bounds-check page
  refs, and (for `annotate`) re-key only known annotation fields — no dictionary injection.
- `govern verify-issue` is a pure, fully offline validator; `E_POLICY` gates a bad draft.
- `sign` uses native `node:crypto` (constant-time) by default; `--pure-crypto` opts out.
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
