# pdfnative-cli — Project Guidelines

## Overview

Official CLI companion to the `pdfnative` library (engine pinned at `^1.8.0`). Exposes 21 commands
over the document lifecycle: `render` (JSON → PDF, incl. PDF/A, PDF/X-4, typography, 27 Unicode
scripts, charts, print production, streaming), `fill`, `annotate`, `metadata`, `merge` / `split` /
`extract`, `sign` / `verify` / `ltv` / `doc-timestamp` (the PAdES ladder), `encrypt` / `decrypt`,
`inspect` / `extract-text` / `compare`, `batch`, `doctor`, `schema`, `completion` and `govern`.
The agent-facing contract (envelopes, 12 stable error codes, `--dry-run`, schemas, capability
manifest) is in [docs/AGENT_CONTRACT.md](../docs/AGENT_CONTRACT.md); repository rules for agents
are in [AGENTS.md](../AGENTS.md).

**Philosophy:** Zero extra runtime dependencies. `pdfnative` is the only dependency — all PDF
logic lives there. The CLI is a thin, composable dispatch layer over it, and every `pdfnative`
symbol enters through `src/core-bridge/index.ts`.

**Targets:** Node.js ≥ 22 (`.nvmrc` / `.node-version` pin 22; CI matrix 22 and 24), Bun, Deno
(via `node dist/cli.cjs`).

## Working Modes & Token Economy

Default to the cheapest mode that fits the request. Do not over-explore.

- **Plan mode** — for vague, multi-file, or risky requests. Produce a short numbered plan
  (files to touch + approach), then stop for confirmation. No edits yet. Keep it to a handful
  of bullets; do not dump file contents.
- **Implement mode** — for clear, scoped requests. Edit directly, then validate. Skip the plan.

Token discipline (this file loads on every request — keep edits to it minimal):

- Read in **wide ranges**, not many small reads. Batch independent searches/reads in parallel.
- Stop searching once you can act. Don't re-search for facts already in context.
- Don't restate file contents back to the user; summarize in 1–3 sentences.
- Reuse the per-area instruction files (`.github/instructions/*`) instead of re-deriving
  conventions; they hold the deltas, this file holds the globals.
- After code changes, run the smallest sufficient check (one vitest file), then the gate.
- Never read `dist/`, `coverage/`, `test-output/`, `samples/output/`, `package-lock.json`.

## Architecture

```
src/
├── index.ts            # CLI entry: parse argv (global flags before OR after the command) → config merge
│                       #   → --creation-date pin → loadCommand() dispatch → exit; USAGE texts live here
├── commands/           # one file per command, `export async function <name>(args: ParsedArgs)`
│   ├── render.ts       # JSON → buildDocumentPDF* (fonts, PDF/A, PDF/X-4, typography, streaming, outline, layout inspect)
│   ├── sign.ts / verify.ts / ltv.ts / docTimestamp.ts   # CMS signatures, RFC 3161, OCSP/CRL, DSS (PAdES B-T/LT/LTA)
│   ├── inspect.ts      # PdfReader → JSON/text report (+ --pdfua, --pdfx, --check, --iso-dates, annotations, labels)
│   ├── merge.ts / split.ts / extract.ts                  # page-tree ops (+ re-encryption, streaming)
│   ├── fill.ts / annotate.ts / metadata.ts / encrypt.ts / decrypt.ts / extract-text.ts / compare.ts
│   ├── batch.ts        # directory render or --manifest pipeline (14 whitelisted commands)
│   ├── doctor.ts       # capability preflight (node, webcrypto, pdfnative, fonts, unicode, conformance)
│   ├── schema.ts       # 19 versioned JSON Schemas (SUBJECTS) + the capability manifest
│   ├── completion.ts   # COMMANDS / GLOBAL_FLAGS tables (feed completions AND the manifest) + 4 shells
│   └── govern.ts       # AI-governance / HITL: rules | policy | verify-issue (E_POLICY gate)
├── utils/
│   ├── args.ts / argv.ts      # zero-dep parser (booleanFlags) + splitCommandArgv (global flags first)
│   ├── io.ts                  # stdin/stdout/file I/O, path-traversal guard, capped binary reads
│   ├── error.ts / agent.ts    # CliError + ErrorCode (12) / --json envelopes + DEFAULT_MESSAGE
│   ├── projection.ts          # compact JSON, --summary, --fields
│   ├── config.ts / colors.ts / version.ts / manifest.ts
│   ├── layout.ts              # --layout / flags → PdfLayoutOptions (PDF/A, PDF/X-4, output intent, typography)
│   ├── fonts.ts               # BUNDLED_FONT_MODULES (31 modules / 27 scripts), aliases, --font-file loading
│   ├── reproducible.ts        # --creation-date / SOURCE_DATE_EPOCH resolution
│   ├── build-errors.ts        # classifies pdfnative's thrown coherence messages into E_INPUT
│   ├── pages.ts / pdfops.ts / pdfdate.ts                 # page selectors, page-tree/crypto helpers, PDF date → ISO
│   ├── keys.ts / cert-chain.ts / cms-verify.ts / asn1-walk.ts / timestamp-verify.ts / revocation.ts / tsa.ts / ltv-provider.ts
│   ├── fetch-guard.ts         # SSRF-guarded HTTP(S) client for every opt-in network call
│   └── governance.ts          # AI_GOVERNANCE_POLICY (verbatim mirror of .github/ai-governance.json), AGENT_RULES, draft validator
└── core-bridge/index.ts       # the single pdfnative import point (selective re-exports, incl. pdfnative/tools)
scripts/                       # gate, sample generator + baseline, conformance corpus + validators, verify-docs, release-prepare
tests/                         # commands/ utils/ integration/ tools/ regression/ docs/ (+ helpers/cli-harness.ts, fixtures/)
samples/                       # dual-shell demos (.sh + .ps1) and the JSON documents the generator renders
```

## Entry Point Contract (`src/index.ts`)

- The first non-flag token is the command name; global flags (`--json`, `--dry-run`, `--quiet`,
  `--no-color`, `--config`, `--no-config`, `--max-inflate-size`, `--creation-date`, `--help`,
  `--version`) are accepted before or after it.
- `--help` / `-h` prints usage and exits 0; `--version` / `-V` prints the version (`--json` for
  `{ name, version }`) and exits 0.
- Unknown command prints an error to stderr and exits 1; arguments with no command exit 2
  (`E_USAGE`); a bare `pdfnative` prints the usage and exits 0. A command flag placed before the
  command (`--strict render …`) is recovered through the known command names.
- `CliError` is caught in `main()` — prints `.message` to stderr (or the `--json` envelope) and
  exits `.exitCode`; all other unhandled errors exit 1.
- `--creation-date <iso>` (fallback `SOURCE_DATE_EPOCH`) calls `setDefaultCreationDate()` once,
  process-wide, so `batch` tasks inherit it; an invalid value is a usage error.
- **Never uses `console.log`** — only `process.stdout.write` and `process.stderr.write`.

## Zero-Dep Arg Parser Contract (`src/utils/args.ts`)

- `parseArgs(argv, { booleanFlags? }): ParsedArgs`, `ParsedArgs = { flags, positionals }`.
- Supports `--flag value`, `--flag=value`, `-f value`, `--flag` (boolean true); a flag listed in
  `booleanFlags` never consumes the next token (so `--json render` keeps `render` positional).
- `--` terminates flag parsing; all following tokens go into `positionals`.
- Never throws — unknown flags are collected as-is.

## Command Conventions (`src/commands/`)

- Each command exports a single async function: `export async function render(args: ParsedArgs): Promise<void>`.
- `--input` for input file path; omit → read from stdin. `--output` for output file path; omit → write to stdout.
- Validation errors throw `CliError` with exit code 1 and a stable `E_*` code; usage errors exit 2.
- Secret loading priority for `sign`: env vars (`PDFNATIVE_SIGN_KEY`, `PDFNATIVE_SIGN_CERT`)
  take precedence over `--key` / `--cert`; passwords from env win when non-empty.
- Every new flag is added to `completion.ts` `COMMANDS` and to the `<NAME>_USAGE` text; every
  new envelope field to `schema.ts` `status` (`verify:docs` rules `flag-parity`, `schema-parity`).

## Security Constraints

- `sign` command: **never log key material** — not in debug mode, not in error messages.
  Errors from `signPdfBytes` are replaced with the fixed string `'Failed to sign PDF.'`.
- Path arguments are validated against path traversal before `fs.readFile` / `fs.writeFile`
  (incl. `merge` positionals, `--output-dir`, `--output-intent-icc`, `--font-file`, manifest paths).
- Input JSON and `--layout` files are capped at 50 MB before `JSON.parse`; ICC profiles at 16 MiB
  and font files at 32 MiB, both checked by magic bytes and by pdfnative's parsers; ASN.1 content
  lengths in `utils/asn1-walk.ts` at 50 MiB per node; `--max-inflate-size` caps stream inflation.
- Fonts are loaded only from `--font` (bundled allow-list) and `--font-file` (disk); a document or
  layout JSON can never name a font file or an ICC path.
- `inspect` JSON output is sanitized (no raw binary blobs in default output).
- `annotate` re-keys only known annotation fields — no dictionary injection; `link` URLs go
  through `validateURL` (`http`, `https`, `mailto`).
- `govern verify-issue` is a pure, fully offline validator; `E_POLICY` gates a bad draft.
- `sign` uses native `node:crypto` (constant-time) by default; `--pure-crypto` opts out.
- `verify` redacts CMS parse errors — internal byte offsets / parser state never leak; a SHA-1
  timestamp imprint is reported as a weak digest and refused under `--strict`.
- **Offline by default.** Only `verify --revocation online`, `sign --timestamp`, `ltv --online`,
  `doc-timestamp --url` and `batch --allow-network` reach the network, always through
  `utils/fetch-guard.ts` (scheme allow-list; loopback/private/link-local/CGNAT/multicast/
  benchmarking/TEST-NET/NAT64 blocked; no redirects; timeout + size caps). `--dry-run` never does.
- CRL/OCSP/TSA signatures are always cryptographically verified; unverifiable revocation
  data yields `unknown`, never `good`.

## Build & Test

`npm run gate` is THE quality gate (`scripts/gate.ts`; profiles `--fast` / CI default /
`--publish --require-all`; PowerShell swallows `--` after `npm run`, so call `npx tsx scripts/gate.ts …`).
Individual steps: `npm run typecheck:all` (three configs), `npm run lint`, `npm test`,
`npm run build` (tsup → `dist/cli.cjs`), `npm run test:generate && npm run verify:samples`
(sample corpus vs `tests/regression/baselines/samples.sha256.json`), `npm run corpus:pdfa &&
npm run validate:pdfx && npm run validate:pdfa` (conformance corpus; veraPDF absent → SKIP, not a
pass), `npm run verify:docs` (every count/version/link/parity rule). Coverage thresholds live in
`vitest.config.ts` — never lower them; add tests. Always smoke-test the **built** CLI
(`node dist/cli.cjs …`) before claiming a change works (tsup flattens `src/**`, so relative paths
resolve differently at runtime — resolve the version via `src/utils/version.ts`).

## Generated files — regenerate, never hand-edit

`.claude/rules/*.md` (`npm run agents:rules`), `tests/regression/baselines/samples.sha256.json`
(`npx tsx scripts/verify-samples.ts --update`, declared in the release note), `dist/`, `coverage/`,
`test-output/`, `package-lock.json`.

## Code Style

- **TypeScript strict mode** — `strict: true`.
- **ESM-first** — all internal imports use the `.js` extension.
- **`const` over `let`** — never use `var`.
- **No `any`** — use `unknown` with type narrowing.
- **No `console.log`** in `src/` — use `process.stdout.write(msg + '\n')` / `process.stderr.write(msg + '\n')`.
- **`readonly`** on interface props where mutation is not needed.
- **English everywhere** — code, comments, tests, samples, docs; demonstrated content in another
  language is marked `demo-language: <tag> (reason)`.
