---
description: "Use when implementing or modifying any of the 21 commands (render, fill, annotate, metadata, merge, split, extract, sign, verify, ltv, doc-timestamp, encrypt, decrypt, inspect, extract-text, compare, batch, doctor, schema, completion, govern) or the utils they share. Covers flag conventions, stdin/stdout, envelopes, error codes, PDF/X, typography, fonts, reproducible dates, secrets and page-tree ops."
applyTo: "src/commands/**,src/utils/**,src/core-bridge/**"
---
# Command Implementation

> Shared conventions and security constraints are in `.github/copilot-instructions.md`
> (Command Conventions + Security Constraints). This file only adds per-command deltas.

## Shared

- Signature: `export async function <name>(args: ParsedArgs): Promise<void>`.
- `--input` omitted → stdin; `--output` omitted → stdout (binary via `process.stdout.write`).
- Usage error → `CliError(msg, 2)`; runtime error → `CliError(msg, 1)`. Never swallow errors.
- Validate every path arg against `..` traversal before read/write; cap every file read
  (`readBinaryFileCapped` in `utils/io.ts`, 50 MB JSON, 16 MiB ICC, 32 MiB font).
- Every `pdfnative` symbol comes from `src/core-bridge/index.ts`; add a selective re-export
  there (a `(pdfnative X.Y.Z)` block per engine release) rather than importing the package.

## Agent contract (cross-cutting)

- **Error codes:** pass a stable `ErrorCode` as the 3rd `CliError` arg — one of the 12:
  `E_USAGE`/`E_INPUT`/`E_PARSE`/`E_IO`/`E_SIGN`/`E_VERIFY_FAILED`/`E_CHECK_FAILED`/`E_POLICY`/
  `E_UNSUPPORTED`/`E_PASSWORD`/`E_NETWORK`/`E_RUNTIME`. Omitting it derives `E_USAGE` from
  exit 2, else `E_RUNTIME`. A new code goes in `utils/error.ts` AND `utils/agent.ts`
  (`DEFAULT_MESSAGE`) and every document `verify:docs` rule `error-parity` lists.
- **`--json`:** never write the envelope yourself in the dispatcher path — `index.ts` emits the
  failure envelope. Use `emitStatus({...})` (from `utils/agent.ts`) for the success status on the
  write commands; it is a no-op outside `--json`. stdout stays artifact-only. Every new status
  field is additive and pinned in `schema.ts` (`status`).
- **`--dry-run`:** read `hasFlag(args.flags, 'dry-run') || isDryRun()`; validate fully (files read,
  ICC/fonts parsed, credentials loaded), then short-circuit before producing output. `render`
  pre-flights the real buffered build in memory (`preflight()` → `mapBuildError`, bytes discarded,
  never a stream variant) so engine errors and diagnostics match the real run. Never touches
  the network.
- In `--json` mode, do NOT pre-print a detail to stderr that the envelope already carries.
- **Output projection (`inspect`/`verify`/`batch`):** route the JSON-on-stdout branch through
  `utils/projection.ts`: `out = --summary ? toSummary(full) : full`, then `--fields`, then
  `serializeJson(out, hasFlag('pretty') || !isJsonMode())`. Keep `--summary` shapes in lock-step
  with the `*-summary` `schema` subjects. Strip `summary`/`fields`/`pretty` from flags forwarded
  to a sub-command (see `batch`'s `BATCH_ONLY_FLAGS`).
- **Engine errors:** `utils/build-errors.ts` (`classifyBuildError`, `INPUT_ERROR_PREFIXES`) maps
  pdfnative's thrown coherence messages (`print.`, `chart:`, `outputIntent.`, `layout.pdfx`,
  PDF/X, PDF/A × encryption, attachments, watermark) to `E_INPUT`; the fixture
  `tests/fixtures/pdfnative-build-errors.json` is the message corpus — extend both together.

## `render`

- JSON → `DocumentParams` (or `PdfParams` when `--variant table`). `--layout` files and inline
  `layout` objects go through `reviveLayoutJson` (attachments, ICC `number[]`, `creationDate`)
  and `mergeNestedLayout` (`typography`, `outputIntent` merge one level; flags win over files).
- Streaming flags are mutually exclusive: `--stream`, `--stream-page-by-page`, `--stream-true`;
  `--stream` and `--stream-true` reject TOC blocks and `{pages}`.
- **Fonts (`utils/fonts.ts`):** `--font` allow-list = `latin`, `emoji`, `color-emoji`, `math` and
  the 32 script codes of `BUNDLED_FONT_MODULES` (36 modules); `ha`/`yo`/`ig`/`sw` alias `latin`
  (`resolveFontAlias`, applied to `--font` and `--lang`). `--font-file <path.ttf>[:name]`
  registers a TTF/OTF from disk only: `validatePath`, 32 MiB cap, magic bytes (`00 01 00 00`,
  `true`, `OTTO`; never `ttcf`/`wOFF`), `parseFontData` + `validateFontData` → `E_INPUT`;
  a name colliding with the allow-list is a usage error. `--variant table` embeds `--lang`
  fonts through `fontEntries`.
- **Conformance:** `--tagged pdfa1b|2b|2u|3b` (`--conformance` is the deprecated alias),
  `--pdfx pdfx4` + `--output-intent-icc <file>` (+ `--output-intent-id`, default basename) and
  `--trapped true|false|unknown`. PDF/A-2b|2u and PDF/X-4 may be claimed together (pdfnative
  ≥ 1.9.0): no CLI pre-check — the engine's level-specific refusals for pdfa1b/pdfa3b are
  `E_INPUT` (prefix `layout.pdfx`). Pre-check (exit 2): `--pdfx` × any encryption flag.
  `--strict` escalates every diagnostic (`PDFA_*`, `PDFA1_*`, `PDFX_*`,
  `TYPOGRAPHY_FEATURE_INEFFECTIVE`, `TEXT_GLYPH_NOT_COVERED` — 13 codes, each with a trigger in
  `tests/helpers/diagnostic-triggers.ts`) to `E_CHECK_FAILED`; the envelope carries `pdfx`,
  `tagged`, `direction`, `actualText` (only `false`) and `creationDate` when set.
- **Direction and ActualText (pdfnative ≥ 1.9.0):** `--direction auto|ltr|rtl` → `layout.direction`
  (`VALID_DIRECTIONS`); `--actual-text [true|false]` → `layout.actualText`. Spot colours are
  JSON-only (`layout.print.spotColours`, `{spot, tint}` / `{inks}` values); their engine
  refusals (`Spot colour …`, `Ink mix …`) are in `INPUT_ERROR_PREFIXES`. JPEG 2000 image
  bytes pass through untouched (no extension check — the engine sniffs the format).
- **Typography:** `layout.typography` passthrough plus `--split-paragraphs`,
  `--keep-headings-with-next`, `--kerning`, `--font-features <tag,…>` (each tag `/^[a-z0-9]{4}$/i`).
- Colours (`--watermark-color`, `--zebra`, chart/table colours) accept hex, `r g b`, `[r,g,b]`,
  CMYK `"c m y k"` (0–1) or `[c,m,y,k]` (percent) — pass strings through untouched.
- `--max-blocks <n>` → positive integer → `layout.maxBlocks` (invalid → exit 2).

## `sign` / `verify` / `ltv` / `doc-timestamp`

- Secret priority: env (`PDFNATIVE_SIGN_KEY` / `PDFNATIVE_SIGN_CERT` / `PDFNATIVE_SIGN_CHAIN`)
  over `--key` / `--cert` / `--cert-chain`. **Never log key material.** Replace any
  `signPdfBytes` error with the fixed string `'Failed to sign PDF.'`. Missing key or cert →
  exit 2.
- Native `node:crypto` provider (`createNativeCryptoProvider`, `utils/keys.ts`) is the default
  (constant-time); `--pure-crypto` passes no provider (pure-JS, RFC 6979 ECDSA).
- `--timestamp <tsa-url>` (RFC 3161, PAdES B-T; `--profile pades`) is functional and network-gated;
  `--timestamp-timeout <ms>` (positive int, usage error without `--timestamp`) goes to
  `createTsaProvider(url, { timeoutMs })` and into `timestamp.timeoutMs`. `--allow-multiple`,
  `--digest sha256|sha384|sha512`, `--signing-time` (a deliberate instant, not the creation date).
- `verify`: offline by default; online revocation only through `utils/fetch-guard.ts` (SSRF
  guard: loopback/private/link-local/CGNAT/multicast/benchmarking/TEST-NET/NAT64 blocked, no
  redirects). Redact CMS parse errors. Report `timestampDigest`; a SHA-1 messageImprint adds a
  weak-digest note and fails under `--strict` (`E_VERIFY_FAILED`).
- `ltv collect|embed|add` and `doc-timestamp` are incremental (signatures stay valid); network
  only behind `--online` / `--url`.

## `inspect` / `extract-text` / `compare`

- `inspect`: default JSON; `--format text` human-readable; no raw binary blobs. `--pdfua` and `--pdfx`
  add validator reports; `pdfaConformance` and `pdfxConformance` (XMP `pdfxid:GTS_PDFXVersion`)
  are always present; `--iso-dates` normalises `/CreationDate` and `/ModDate` through
  `utils/pdfdate.ts`. `--check` allow-list: `pdfa`, `signed`, `encrypted`, `pdfua`, `pdfx`,
  `signatures>=N` (exit 0/1, `E_CHECK_FAILED`). `--summary` = `{ pages, encrypted, signatures,
  pdfa, pdfx }`.
- `extract-text`: `text | json | ndjson`, `--runs`, `--password`; tagged input — and, since
  pdfnative ≥ 1.9.0, untagged shaped / right-to-left runs — yields the `/ActualText` source
  text. `--on-stream-error limit|throw|skip` (`parseStreamErrorPolicy` in `utils/pdfops.ts`);
  a `PdfStreamLimitError` is `E_INPUT` by instance (`mapPdfError`), never by its text.
- `compare`: text + structure diff, exit 1 / `E_CHECK_FAILED` on difference; `--tolerance`,
  `--ignore-whitespace`, `--format json`, `--on-stream-error` (same policy for both PDFs).

## Page tree, forms, metadata, encryption

- Shared helpers: `utils/pages.ts` (1-based `parsePageList`, `parsePageRanges`) and
  `utils/pdfops.ts` (`parseMaxOutputSize`, `collectSourcePaths`, crypto/page-tree helpers).
  Every path — incl. `merge` positionals and `--output-dir` — is validated.
- `merge` (2–50 sources, one `--password` for all), `split` (`--output-dir`, `--pages`,
  `--prefix`), `extract` (`--pages`); each accepts `--encrypt`/`--owner-password`/
  `--user-password`/`--permissions`, `--stream`/`--chunk-size`, `--max-output-size`.
- `annotate`: `--annotations` JSON; types `highlight|underline|strikeout|squiggly|square|circle|line|text|link`;
  validate `page`/`type`/`rect` (`start`/`end` for `line`, `url` for `link` through `validateURL`
  → `E_INPUT`); **re-key only known fields**; `link` builds a `/Link` + `/URI` action body;
  incremental save. Bounds-check every `page` against `reader.pageCount`.
- `fill` (`--data`, `--flatten`, `--export`, `--on-unknown`), `metadata` (`/Info` + XMP,
  `--from-json`, `--mod-date`; incremental — note it drops a PDF/X identification, upstream),
  `encrypt`/`decrypt` (AES-128/256, permissions, env passwords win when non-empty).

## `batch` / `doctor` / `schema` / `completion` / `govern`

- `batch`: directory render or `--manifest` pipeline (14 whitelisted commands, `@id` references,
  1 000 tasks, 50 MB, `--allow-network` gate); forwards `--dry-run`; global `--json` forces the
  JSON summary.
- `doctor`: checks `cli`, `node`, `webcrypto`, `pdfnative`, `commands`, `fonts` (modules probed on
  disk), `unicode` (`USE_UNICODE_VERSION`), `conformance` (`PDF_A_*` + `PDF_X_*` targets); shape
  `{ name, status, value, detail }` is additive only.
- `schema`: 19 hand-authored subjects (`SUBJECTS`), Draft 2020-12, `$id` embeds the CLI version;
  `manifest` derives from `completion.ts` `COMMANDS` + `GLOBAL_FLAGS` + `ErrorCode`. Unknown
  subject → exit 2.
- `completion`: bash/zsh/fish/powershell from the static tables; add every new flag to
  `COMMANDS` (`verify:docs` rule `flag-parity`).
- `govern`: `rules | policy | verify-issue`; logic in `utils/governance.ts`
  (`AI_GOVERNANCE_POLICY` mirrors `.github/ai-governance.json` verbatim — rule
  `governance-embed`); a violation → `CliError('', 1, ErrorCode.POLICY)`. Fully offline.
