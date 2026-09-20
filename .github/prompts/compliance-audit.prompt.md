---
description: "Audit pdfnative-cli for security at the process boundary, the agent contract, PDF/A and PDF/X conformance gates, and cross-platform samples."
agent: "agent"
---
# Compliance Audit

Perform a compliance audit of pdfnative-cli. The CLI is the untrusted-input boundary
around the pdfnative engine: every finding is reproduced with a command against the
built binary (`node dist/cli.cjs …`, after `npm run build`) or a test, and cited with
`file:line`. Report findings with a severity (blocker / major / minor / note), the
reproduction command and the recommended fix; a finding without a reproducible command
is not a finding.

## Audit Areas

### 1. Process contract (docs/AGENT_CONTRACT.md)
- stdout carries the artifact only; every diagnostic and envelope goes to stderr
- Exit codes 0 / 1 / 2; failures carry one of the 12 stable `E_*` codes (`src/utils/error.ts`)
- Every field a command passes to `emitStatus` is pinned in `schema status`
  (`tests/commands/schema-status-parity.test.ts`); new fields are additive
- `--dry-run` writes nothing, never opens a socket, and (for `render`) pre-flights the real
  build so its verdict matches the real run
- `--summary` / `--fields` shapes match their `schema *-summary` subjects

### 2. Input boundary
- Every path flag (`--input`, `--output`, `--layout`, `--font-file`, `--output-intent-icc`,
  `--attachment`, `--config`, `merge` positionals, `--output-dir`) goes through `validatePath`
- Every file read is size-capped (50 MB JSON, 16 MiB ICC, 32 MiB font, 1 MB config)
- No `__proto__` / `constructor` / `prototype` key reaches an object the CLI builds
  (`deepMerge`, `config.ts`, `manifest.ts`, `parseArgs`); `Object.prototype` untouched after
  `tests/fuzz/`
- Hostile PDF bytes end in `E_PARSE` / `E_PASSWORD` / `E_UNSUPPORTED`, never a stack
  overflow or a hang: xref `/Prev` chain and cycle, nesting past `MAX_PARSE_DEPTH`, inflate
  bombs under `--max-inflate-size`, random mutations (`tests/fuzz/pdf-bytes.test.ts`)
- A JSON payload can never name a font, an ICC profile or an attachment path

### 3. Secrets and network
- No key material, password or PEM bytes in any error message, envelope or log;
  `signPdfBytes` failures are replaced by a fixed string
- Network only behind the five opt-ins (`verify --revocation online`, `sign --timestamp`,
  `doc-timestamp --url`, `ltv --online`, `batch --allow-network`), always through
  `src/utils/fetch-guard.ts` (loopback, private, link-local, CGNAT, multicast,
  benchmarking, TEST-NET and NAT64 ranges blocked; no redirects; timeouts and size caps)
- `sign --timestamp-timeout` bounds the TSA round-trip; a TSA failure never degrades to an
  untimestamped signature

### 4. Zero extra runtime dependencies
- `package.json` `dependencies` is `pdfnative` only; every engine symbol enters through
  `src/core-bridge/index.ts`
- `dist/cli.cjs` requires `pdfnative` and `pdfnative/tools` externally and inlines no engine
  code, font data, PEM block or `console.log` (`scripts/lib/bundle-probe.ts`, gate step
  `bundle-check`); the bundle stays under `declared.bundleBudgetBytes`

### 5. Conformance gates
- PDF/A: the corpus (`scripts/lib/pdfa-corpus.ts`) validates under veraPDF with the
  negative canaries rejected (`npm run validate:pdfa`); `--strict` escalates every `PDFA_*`
  diagnostic to `E_CHECK_FAILED`
- PDF/X-4: `--pdfx pdfx4` needs a `prtr` output intent and a known trapping state; the
  in-process validator agrees with `inspect --check pdfx` (`npm run validate:pdfx`)
- One conformance claim per file: `--pdfx` × `--tagged` and `--pdfx` × encryption are usage
  errors; attachments require PDF/A-3b; a translucent watermark is refused under PDF/A-1b

### 6. Reproducible output
- `--creation-date` / `SOURCE_DATE_EPOCH` make a render byte-identical across hosts and
  timezones (`tests/integration/reproducible-build.test.ts`); dates are written in UTC
- The 79-sample baseline (`tests/regression/baselines/samples.sha256.json`) holds; a
  rebaseline is declared in the release note
- Encrypted output is documented as non-reproducible; `sign --signing-time` and
  `metadata --mod-date` are separate instants

### 7. Cross-platform samples
- Every `samples/**/*.sh` has a `.ps1` twin (`verify:docs` rule `sample-shell-parity`) and
  both run: Git Bash on Windows, pwsh, Linux
- No `toLocaleString()` without a locale in `src/` or `scripts/`; the generator runs under
  `TZ=UTC`

### 8. Documentation truth
- `npm run verify:docs` green: every count and version comes from
  `docs/assets/ecosystem.json`; every flag in a usage text is in the completion table; every
  `#fragment` resolves (`anchor-parity`); `govern rules` / `govern policy` print the
  repository files verbatim
- Every JSON key the docs name for `layout.typography`, `layout.print` and the envelopes
  exists in the engine's types (`D:\Github\pdfnative\src\types\pdf-types.ts` or the
  installed `pdfnative` package) — a documented key the engine ignores is a major finding

### 9. Governance
- No `Co-Authored-By` trailer or "Generated with" footer in the branch history
- Nothing pushed, tagged, published or opened by an agent (`.claude/hooks/guard.mjs`)
- Issue drafts under `.github/drafts/` pass `pdfnative govern verify-issue`
