# v1.3.0 — pdfnative 1.6.0: text extraction, form fill/flatten, encrypt/decrypt, native charts & page-tree password/streaming

> **Branch:** `release/v1.3.0` → `main`
> **Type:** Minor release (additive, 100% backward-compatible with v1.2.0)
> **pdfnative bump:** `^1.5.0` → `^1.6.0`

## Summary

Five new commands plus `render` / `merge` / `split` / `extract` / `inspect`
enhancements land the **pdfnative 1.6.0** engine's additions on the CLI — with an
agent-facing capability manifest, a unified encryption vocabulary, and three
bug fixes surfaced by an independent functional + documentation audit. Zero breaking
changes, zero new runtime dependencies:

1. **`extract-text`** — reading-order Unicode text via `extractText`, as
   `text | json | ndjson` (NDJSON = one object/page, RAG/agent-friendly), with
   `--runs`, `--pages`, `--password`, `--max-length`. No OCR.
2. **`fill`** — fill, flatten, and **export** existing AcroForms via `fillForm` /
   `flattenForm` / `readFormFields`, incremental save. **`fill --export`** dumps
   current values as a `--data`-shaped map (read → edit → fill round-trip).
3. **`encrypt` / `decrypt`** — AES-128/256 re-encryption and transparent
   decryption via pdfnative 1.6.0 page-tree re-encryption. CSPRNG-gated; RC4
   never emitted; passwords never logged. Both also gain **`--stream`**.
4. **`doctor`** — offline environment / capability preflight (CLI/Node/pdfnative
   versions, Web Crypto CSPRNG, command count); text or `--json`, exit 0/1.
5. **`render` native charts** — the `chart` document block (bar/barH/line/pie/donut) —
   plus a **unified encryption vocabulary** (`--encrypt` / `--owner-password` / … ;
   `--encrypt-*` kept as aliases).
6. **`merge` / `split` / `extract`** gain `--password`, `--encrypt [aes-128|aes-256]`,
   `--stream` + `--chunk-size`. **`inspect`** gains `--form-fields`, `--encryption`, `--password`.
7. **Agent surface** — `schema manifest` + `llms.txt` (tool discovery); schema
   subjects `extract-text` / `fill` / `form-export` / `status` / `doctor`; new `E_PASSWORD` code.
8. **Fixes** — (a) `render --encrypt` was a **silent no-op** (help vs code mismatch) → now
   encrypts; (b) `schema` / `--version` were broken in the published binary (bundle-relative
   `package.json`) → bundle-safe `version.ts`; (c) an empty env password no longer overrides
   an explicit `--password`; (d) `fill` `--data` errors are consistently `(exit 1, E_INPUT)`.

## Changes

### `package.json`
- `pdfnative` bumped `^1.5.0` → `^1.6.0`; version → `1.3.0`.
- Keywords enriched (`extract-text`, `text-extraction`, `pdf-forms`, `acroform`,
  `form-fill`, `flatten-pdf`, `encrypt`, `decrypt`, `pdf-encryption`, `aes-256`,
  `charts`, `data-visualization`, `rag`, `llm`, `mcp`, `powershell-completion`, …).
- `description` updated; `files` now ships `llms.txt`.

### `src/core-bridge/index.ts`
- Re-export the 1.6.0 surface: `extractText`, `readFormFields` / `fillForm` /
  `flattenForm`, `streamMergedPdfs` / `streamSplitPdf` / `streamExtractPages`,
  the error classes (`PdfPasswordError`, `PdfEncryptionUnsupportedError`, the
  three form errors), and the types (`OpenPdfOptions`, `PdfEncryptionInfo`,
  `PdfSourceInput`, `StreamMergeOptions`, `ExtractTextOptions` &c., `ParsedFormField`
  &c., `ChartBlock` / `ChartSeries` / `ChartType`).

### New commands
- `src/commands/extract-text.ts` — `extractText`; `--format text|json|ndjson`,
  `--runs`, `--pages` (1-based), `--password`, `--max-length`, `--summary`/`--fields`.
- `src/commands/fill.ts` — `fillForm` / `flattenForm` / `readFormFields`; `--data`,
  `--flatten`, **`--export`** (values → `--data` map, unset choice fields omitted),
  `--force`, `--on-unknown`, `--need-appearances`, `--password`, `--dry-run`. Malformed
  `--data` content → `(exit 1, E_INPUT)`; form errors → `E_INPUT` / `E_UNSUPPORTED`.
- `src/commands/encrypt.ts` / `decrypt.ts` — page-tree re-encryption / decryption over
  all pages (`extractPages` / **`streamExtractPages`** with `MergeOptions.encrypt` / `password`).
- `src/commands/doctor.ts` — **new**, offline env/capability preflight (Node ≥ 20, Web Crypto
  CSPRNG, `pdfnative` version, command count); text or `--json`, sets exit 1 on failure.

### Enhanced commands
- `src/commands/merge.ts` / `split.ts` / `extract.ts` — `--password`, `--encrypt`
  (+ `--owner/user-password`, `--permissions`), `--stream` (+ `--chunk-size`) via
  the `stream*` generators; errors routed through `mapPdfError` (→ `E_PASSWORD`).
- `src/commands/inspect.ts` — `--form-fields`, `--encryption`, `--password`.
- `src/commands/schema.ts` — subjects `extract-text` / `fill` / `form-export` / `status` /
  `manifest` / `doctor`; `encryption` + `formFields` added to the `inspect` schema.
- `src/commands/completion.ts` — new commands + flags (incl. render's unified crypto flags);
  **PowerShell** generator; `COMMANDS` / `GLOBAL_FLAGS` exported (single source for the manifest).

### New / changed utilities
- `src/utils/version.ts` — **new**, bundle-safe `cliVersion()` (name-guarded
  candidate probing); adopted by `index.ts` and `schema.ts` (fixes the published
  `schema` / `--version` crash).
- `src/utils/layout.ts` — **`render` encryption unified**: `buildEncryptionFromFlags` now
  reads `--encrypt` / `--owner-password` / `--user-password` / `--permissions` (via the shared
  pdfops helpers), with `--encrypt-*` as aliases — fixing the silent `render --encrypt` no-op.
- `src/utils/pdfops.ts` — `parseChunkSize`, `firstNonEmpty` (empty env ≠ override),
  `resolveSourcePassword` / `resolveOwnerPassword` / `resolveUserPassword`, `normalizeEncryptAlgo`,
  `readEncryptTrigger` (`--encrypt=false` disables), exported `parsePermissions`,
  `buildEncryptOptions`, `mapPdfError`.
- `src/utils/error.ts` / `agent.ts` — `E_PASSWORD` code + default message.
- `src/index.ts` — dispatch, usage, help wiring for the five new commands; corrected
  `render` encryption/watermark help; updated merge/split/extract/inspect/completion/schema help.
- `llms.txt` (repo root) — LLM-facing capability manifest.
- `CLAUDE.md` (repo root) — Claude Code contributor guide.

### Samples
- `extract-text/`, `fill/`, `encrypt/` (encrypt+decrypt flow), `render/chart/`
  (Bash + PowerShell + JSON). `samples/README.md` updated; charts render via
  `run-all.js` like any document sample.

### Docs
- `README.md`, `AGENTS.md`, `docs/KNOWLEDGE_BASE.md`, `CHANGELOG.md`, `ROADMAP.md`,
  `samples/README.md`, `llms.txt`; `release-notes/v1.3.0.md`.
- **Pre-publication finish (this pass):** grouped `--help` + command-group overview tables
  (README / KB); the `merge` single-password caveat (help + README + KB + AGENTS); a full
  factual-coherence sweep (17-command count, `E_PASSWORD` in every list, `--max-output-size`
  256 MiB default, refreshed KB architecture map); ROADMAP entries for `optimize` / `compare` /
  `batch --manifest` with honest feasibility notes.

### Tests
- `tests/commands/{extract-text,fill,encrypt-decrypt,doctor}.test.ts` (incl. an
  encrypt→inspect→decrypt round-trip, `fill --export` round-trip, and streaming variants);
  `tests/utils/version.test.ts` and expanded `pdfops.test.ts` (env-precedence /
  `firstNonEmpty` / `normalizeEncryptAlgo` / `readEncryptTrigger`); render **encryption
  unification** regression in `render.test.ts` (unified encrypts, legacy alias works, no-flag
  is plaintext); a chart case; updated `schema.test.ts` (subjects/manifest) and
  `completion.test.ts` (PowerShell).

## Independent audit (this release)

Two independent agents audited the branch — **functional** (static source review) and
**documentation** (ran the built CLI + every sample). Findings were addressed: the silent
`render --encrypt` no-op, the empty-env-password override, the `fill` error-code
inconsistency, and a batch of doc must-fixes (KB command count/error-table/`--dry-run`,
README agent lists, a broken `--conformance pdfa2b` sample). The complementary features
(`fill --export`, `doctor`, `encrypt/decrypt --stream`) came out of the same pass.

## Validation

- `npm run typecheck:all` → clean (src + tests).
- `npm run lint` → clean.
- `npm run build` → CJS + ESM + types emitted; `node dist/cli.cjs --version` → `1.3.0`.
- `npm run test:coverage` → all tests passing (**440+**); coverage above thresholds
  (≈ statements 83 / branches 73 / functions 89 / lines 85 vs. 79/68/83/79).
- `npm audit` → **0 vulnerabilities**.
- Smoke (via `node dist/cli.cjs`):
  - `render --encrypt aes-256 --owner-password X` → `inspect --encryption` = `aes256`
    (the no-op is fixed); legacy `--encrypt-owner-pass`/`--encrypt-algorithm` still encrypt.
  - `extract-text` text / json / ndjson (+ `--runs`, `--pages`).
  - `fill --export` → edit → `fill --data` round-trip; `--flatten` → 0 fields.
  - `encrypt` (aes-256, incl. `--stream`) → `inspect --encryption` → `decrypt --stream` round-trip.
  - `merge --encrypt --stream`, `extract --stream`, `split --stream`.
  - `doctor` (exit 0) and `doctor --format json`.
  - Wrong password → `{ ok:false, error:{ code:"E_PASSWORD" } }`, exit 1.
  - `render` chart blocks; `schema manifest` lists all 17 commands + `E_PASSWORD`.

## Backward compatibility

- **No flag removed or renamed; no exit-code semantics changed** (0/1/2).
- All new commands / flags are additive; every v1.2.0 invocation works unchanged.
- `E_PASSWORD` is a new, additive error code.
- The `version.ts` change fixes a latent crash in the **published** `schema` /
  `--version` path; source-run behaviour is unchanged.

## Out of scope (recorded in ROADMAP)

- **OCR** — `extract-text` yields empty text on image-only pages (pdfnative scope).
- **Sign-side LTV** (PAdES-T/LT/LTA) — still upstream-blocked in pdfnative;
  `sign --timestamp` stays reserved and errors with `E_UNSUPPORTED`.
- **Per-source passwords for `merge`** — deliberately not added (a `path:pass` syntax
  collides with Windows drive letters and complicates the CLI). Documented instead: one
  `--password` for all sources; different passwords fail with `E_PASSWORD`.
- **Category dispatch commands** (`pdfnative page/security --help`) — the global `--help` is
  grouped instead; dedicated category commands are deferred.
- **`batch --manifest`, `compare`, `optimize`** — future ROADMAP items. `batch --manifest`
  and a text/structural `compare` are feasible today; `optimize` and a *visual* `compare`
  need pdfnative primitives (object GC / linearisation / a rasteriser).
- **man pages** — deferred. No new runtime dependency — `pdfnative` remains the only one.

## Self-review checklist

- [x] No `console.log`; all output via `process.stdout.write` / `process.stderr.write`.
- [x] stdout = artifact, stderr = diagnostics; `--json` never touches stdout.
- [x] **Passwords never logged** — read from env (a non-empty value wins over flags);
      error messages carry no secrets; `E_PASSWORD` distinguishes the failure class.
- [x] **`render --encrypt` actually encrypts now** (regression-tested); `--encrypt-*`
      aliases preserved; unified crypto vocabulary across render + page-tree commands.
- [x] Numeric exit codes (0/1/2) unchanged; `E_PASSWORD` is additive; `fill` `--data`
      errors are consistently `(exit 1, E_INPUT)`.
- [x] `--dry-run` writes no output for `fill` / `encrypt` / `decrypt` (in addition
      to the existing commands).
- [x] Path-traversal validation on all new path args; memory bounds preserved
      (`--max-length`, `--max-output-size`, `--chunk-size`).
- [x] `--stream` output is structurally equivalent to buffered; `streamSplitPdf`
      ranges fully drained before advancing.
- [x] TypeScript strict; no `any`; new types `readonly` where applicable; ESM-first
      `.js` imports; all core imports go through `core-bridge`.
- [x] `pdfnative` is still the **only** runtime dependency.
- [x] Coverage thresholds green; built binary smoke-tested (not just source).
