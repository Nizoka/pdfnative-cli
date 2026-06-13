# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] – 2026-06-30

Built on **pdfnative 1.3.0**. Surfaces the new engine capabilities through the CLI:
22 Unicode scripts, COLRv1 colour emoji, true constant-memory streaming, a configurable
document-block cap, and a read-only PDF/UA structural validator. 100% backward-compatible.

### Added

#### `render`

- **22 Unicode scripts + COLRv1 colour emoji.** The `--font` allow-list now covers every
  bundled pdfnative font: `latin`, `emoji`, `color-emoji`, and the 22 script codes
  (`ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`), including the six
  scripts new in pdfnative 1.3.0 (Telugu `te`, Sinhala `si`, Tibetan `bo`, Khmer `km`,
  Myanmar `my`, Amharic/Ethiopic `am`). Each shortcut name doubles as its `--lang` code;
  pdfnative routes each code point to the font whose cmap covers it.
- **`--stream-true`** — true constant-memory streaming via pdfnative 1.3.0
  `buildDocumentPDFStreamTrue` / `buildPDFStreamTrue`. PDF parts are emitted and freed as
  they go, so the joined binary never materialises. Byte-identical to the buffered builders.
  Same constraints as `--stream` (no TOC, no `{pages}`); mutually exclusive with the other
  `--stream*` flags.
- **`--max-blocks <n>`** — expose pdfnative 1.3.0 `layout.maxBlocks` (default 100 000) so
  very large multi-thousand-page reports no longer hit a spurious ceiling.

#### `inspect`

- **PDF/UA (ISO 14289-1) structural validation** via pdfnative 1.3.0 `validatePdfUA`.
  `--pdfua` adds a `{ valid, errors, warnings }` report to JSON/text output; `--check pdfua`
  turns it into a CI accessibility gate (exit 1 when the structural prerequisites fail).

#### Agent-native automation contract

- **Global `--json` envelope.** Any command run with `--json` emits a single
  machine-readable object on **stderr**: `{ ok: false, command, error: { code, message } }`
  on failure, and a `{ ok: true, … }` status line for `render` / `sign` / `batch` on
  success. stdout stays reserved for the primary artifact (PDF, report, schema, script).
- **Stable `E_*` error codes** on every `CliError` (`E_USAGE`, `E_INPUT`, `E_PARSE`,
  `E_IO`, `E_SIGN`, `E_VERIFY_FAILED`, `E_CHECK_FAILED`, `E_UNSUPPORTED`, `E_RUNTIME`),
  so autonomous callers branch on a failure class without parsing prose. Numeric exit
  codes (0/1/2) are unchanged.
- **`--dry-run`** for `render`, `sign`, and `batch` — fully validate inputs (and, for
  `sign`, parse credentials and prepare the PDF) without producing or writing output.
- **Token-economy output projection for agents** (`inspect` / `verify` / `batch`):
  stdout JSON is **compact by default under `--json`** (`--pretty` opts back into the
  human 2-space form), a new **`--summary`** flag emits a canonical minimal verdict
  (inspect `{ pages, encrypted, signatures, pdfa }`, verify `{ valid, signatures, invalid }`,
  batch `{ total, succeeded, failed }`), and **`--fields a,b.c`** projects the result to
  named dot-paths (array segments map over elements; unknown paths are omitted). Composable
  — typically ~90 % fewer output tokens with no loss of the fields agents branch on.
  Non-`--json` (human) output is unchanged. New `utils/projection.ts` (zero-dep).
- **`schema` command** — print a versioned JSON Schema (Draft 2020-12) for the
  `render` input, the `inspect` / `verify` / `batch` JSON output, or the new
  `inspect-summary` / `verify-summary` / `batch-summary` compact shapes, with a `$id`
  embedding the CLI version. `schema list` enumerates the subjects.
- **[AGENTS.md](AGENTS.md)** documents the full contract for AI agents and CI pipelines.

#### Supply chain

- **CycloneDX SBOM** (`sbom.cdx.json`) is generated in CI and attached to every GitHub
  release; an **OpenSSF Scorecard** badge is published in the README. No new runtime
  dependencies — the SBOM generator runs build-time only.

### Changed

- **`pdfnative` bumped** to `^1.3.0` (was `^1.2.0`).
- **npm keywords** expanded for discoverability (`pdf-ua`, `accessibility`, `colr`,
  `color-emoji`, `unicode`, `text-shaping`, `opentype`, `bidi`, `streaming`, `ai-agent`,
  `agentic`, `automation`, `json-output`, `json-schema`, and the new script names).

## [1.0.0] – 2026-06-30

First stable release. **Verify-side Long-Term Validation (LTV)** lands in full, the
last two upstream workarounds are removed (now fixed in pdfnative 1.2.0), and the CLI
gains config-file, batch, completion and global-flag ergonomics.

### Added

#### `verify` command — Long-Term Validation (LTV)

- **RFC 3161 timestamp validation (PAdES-T)** — the signature-timestamp-token unsigned
  attribute is now cryptographically validated: the TSA SignerInfo signature, the eContent
  (TSTInfo) `messageDigest`, and the `messageImprint` binding to the document signature are
  all checked, and the TSA certificate chain is built and trust-evaluated. Reported as
  `timestampValid`, `timestampTime` (`genTime`) and `tsaSubject`. Replaces the
  presence-only `timestampPresent` flag from 0.3.0 (still reported for back-compat).
- **OCSP (RFC 6960) revocation** — parses OCSP responses embedded in the PDF `/DSS`
  (PAdES-LT) and, with `--revocation online`, fetches from the certificate's AIA OCSP URL.
  Verifies the responder signature and matches the CertID before reading the status.
- **CRL (RFC 5280) revocation** — parses CRLs embedded in `/DSS` and, online, fetches from
  the CRL Distribution Point. Verifies the CRL signature against the issuer before checking
  the signer serial.
- **`--revocation offline|online|disabled`** (default `offline`) and
  **`--revocation-policy soft-fail|strict`** (default `soft-fail`). New report fields:
  `revocationChecked`, `revocationStatus`, `revocationSource`, `revocationMethod`,
  `revocationRevokedAt`.
- **SSRF-guarded online fetching** — opt-in online OCSP/CRL requests pass a guard enforcing
  an http(s) scheme allow-list, DNS resolution with private/loopback/link-local/CGNAT/
  multicast (IPv4 + IPv6) blocking, no redirect following, a 10 s timeout and a 5 MiB cap.

#### `render` command — pdfnative 1.2.0 features

- **Smart tables** — `--table-wrap auto|always|never`, `--repeat-header`, `--zebra`,
  `--min-row-height`, `--cell-padding` fill any `TableBlock` fields left unset in JSON
  (block-level JSON wins). Also available through `--layout`.
- **Page-by-page streaming** — `--stream-page-by-page` streams at PDF object boundaries
  after assembling the document, so TOC blocks and `{pages}` placeholders are supported
  (unlike single-pass `--stream`).
- **PDF/A targets** are now sourced from pdfnative's `PDF_A_CONFORMANCE_TARGETS` constant.

#### New commands & CLI ergonomics

- **`batch`** — render every `*.json` file in a directory to PDF in parallel, reusing the
  full `render` pipeline. `--input-dir`, `--output-dir`, `--concurrency`, `--fail-fast`,
  text/JSON summary; exit 1 if any file fails.
- **`completion bash|zsh|fish`** — emit a shell-completion script.
- **`.pdfnativerc.json`** config file — discovered cwd-upward, with global and per-command
  sections; `--config <file>` / `--no-config`. Precedence: CLI flags > env > config.
- **Global flags** — `--quiet`/`-q`, `--no-color` (+ `NO_COLOR`), and `--version --json`.

#### `sign` command

- **`--timestamp <tsa-url>`** flag reserved for PAdES-T timestamping. Embedding a timestamp
  token at signing time requires upstream pdfnative support; the flag validates the URL and
  errors clearly today. Timestamp *validation* already works via `verify`.

### Changed

- **`pdfnative` bumped to `^1.2.0`** (was `^1.1.0`).
- Removed the two upstream workarounds — `cert-fix` (issuer/subject DN re-slicing) and the
  local signature-placeholder injector — now fixed in pdfnative 1.2.0. `sign` uses
  `addSignaturePlaceholder` and `verify`/`keys` use the corrected `parseCertificate`
  directly.

### Removed

- `src/utils/cert-fix.ts` and `src/utils/sign-placeholder.ts` (and their tests).

### Security

- Documented the single, intentional SHA-1 usage — the OCSP `CertID` (RFC 6960 §B.1
  default, a non-security identifier over public certificate fields). Annotated the call
  sites and added a *Cryptographic algorithm usage* section to [SECURITY.md](./SECURITY.md);
  the corresponding CodeQL `js/weak-cryptographic-algorithm` alert is a reviewed false
  positive.
- Upgraded the test toolchain (`vitest` / `@vitest/coverage-v8` 2 → 4) to clear all known
  dev-dependency advisories (`npm audit` → 0 vulnerabilities). Coverage thresholds were
  re-baselined to vitest 4's AST-aware measurement (identical tests and code).
- Bumped pinned GitHub Actions: `github/codeql-action` 4.35.1 → 4.36.0,
  `actions/setup-node` 6.3.0 → 6.4.0, `actions/upload-artifact` 4.6.2 → 7.0.1,
  `ossf/scorecard-action` 2.4.2 → 2.4.3; `typescript-eslint` 8.57.2 → 8.59.2.

## [0.3.0] – 2026-05-05

### Added

#### `sign` command — full end-to-end signing pipeline

- **ECDSA-SHA256 signatures** — `--algorithm ecdsa-sha256` is now fully wired
  (was a stub in 0.2.0). Loads SEC1 / PKCS#8 P-256 keys via pdfnative's
  `parseEcPrivateKey`. RSA remains the default.
- **Automatic signature placeholder injection** — `pdfnative render` does not
  emit AcroForm fields, so signing a freshly-rendered PDF used to fail with
  "no /Contents placeholder". `sign` now detects the missing placeholder and
  performs a single incremental update adding `/Sig`, the signature widget,
  and `AcroForm /SigFlags 3` — fully transparent and idempotent for PDFs that
  already carry a placeholder.
- **`ensureCryptoReady()`** — pdfnative's async ASN.1 module is now booted on
  the first sign / verify invocation; previously surfaced as a confusing
  "ASN.1 module must be imported" error.

#### `verify` command — full CMS / PKCS#7 cryptographic verification

- **CMS signature value verification** — RSA-SHA256 and ECDSA-SHA256
  signatures embedded in the PDF are now cryptographically verified against
  the leaf certificate's public key, not just the byte-range digest.
  Reported as `signatureValid` and `signatureAlgorithm`.
- **RFC 3161 timestamp recognition** — presence of an unsigned-attribute
  timestamp token is reported as `timestampPresent`. Full token validation
  (TSA chain, MD comparison) remains tracked for v0.4.0.
- **Robust ASN.1 walker** — replaces calls into `pdfnative.derDecode` whose
  `offset` field is relative below depth 1. The new walker (and the cert-DN
  re-slicing workaround) guarantee correct `issuerAndSerialNumber` extraction
  and `isSelfSigned` evaluation for every embedded certificate.

#### `render` command — iteration & template ergonomics

- **`--watch`** — re-render on input file change (200 ms debounce, stderr-only
  logs, requires `--input <file>` and a file `--output`). Clean shutdown on
  `SIGINT` / `SIGTERM`.
- **`--template <file.json>`** — deep-merge a base template under stdin /
  `--input`. Plain objects merge recursively; arrays and primitives are
  replaced (caller wins).
- **`--font <name>`** — register a bundled pdfnative font shortcut.
  Repeatable; allow-list of `latin` (Noto Sans VF) and `emoji` (Noto Emoji).
  After registration the name is usable through `--lang`. No path-based
  surface — the name resolves to a sealed mapping.

### Changed

- Bumped `pdfnative` peer / runtime dependency from `^1.0.0` to `^1.1.0`.
- Help text for `sign` now lists `ecdsa-sha256` as a fully supported value.
- Help text for `verify` enumerates the new `signatureValid`,
  `signatureAlgorithm`, and `timestampPresent` report fields.

### Fixed

- Verify path no longer consumes pdfnative's broken `cert.issuer.raw` /
  `cert.subject.raw` slices — both are recomputed from
  `tbsCertificateBytes`. Restores correct chain building and self-signed
  detection for every cert (including those embedded in CMS).

## [0.2.0] – 2026-04-28

### Added

#### `render` command — full pdfnative layout coverage

- **Hybrid layout model** — high-frequency knobs as CLI flags, full `PdfLayoutOptions` surface
  via `--layout <file.json>`. Precedence: CLI flags > layout file > pdfnative defaults
  (mirrors `gh` / `kubectl` / `docker`).
- **`--variant document|table`** — selects the renderer: `buildDocumentPDFBytes` (default,
  unchanged behaviour) or `buildPDFBytes` (table-centric `PdfParams` shape).
- **`--page-size`** — named (`a4`, `letter`, `legal`, `a3`, `tabloid`, `a5`) or `WxH` in points.
- **`--margin <N>`** or `--margin <top,right,bottom,left>`.
- **`--compress`** — boolean; calls `initNodeCompression()` once per process when needed.
- **`--tagged <none|pdfa1b|pdfa2b|pdfa2u|pdfa3b>`** — unified PDF/A flag, replaces
  `--conformance` (which is now deprecated, see below).
- **Watermarks** — `--watermark-text`, `--watermark-opacity`, `--watermark-angle`,
  `--watermark-color`, `--watermark-font-size`, `--watermark-image <path>`,
  `--watermark-position background|foreground`.
- **Headers / footers** — `--header-left`, `--header-center`, `--header-right`,
  `--footer-left`, `--footer-center`, `--footer-right`. Placeholders: `{page}`, `{pages}`,
  `{date}`, `{title}`. `{pages}` rejected with `--stream` (multi-pass pagination required).
- **Encryption** — `--encrypt-owner-pass`, `--encrypt-user-pass`, `--encrypt-algorithm
  aes128|aes256` (default `aes128`), `--encrypt-permissions print,copy,modify,extractText`.
  Owner / user passwords also read from `PDFNATIVE_ENCRYPT_OWNER_PASS` /
  `PDFNATIVE_ENCRYPT_USER_PASS` (env takes precedence over flags). Mutually exclusive with
  `--tagged pdfa*` per ISO 19005 — rejected with exit 2.
- **PDF/A-3 attachments** — `--attachment <path>[:mime[:relationship[:description]]]`,
  repeatable. Binary payloads are loaded from disk; the `--layout` file's
  `attachments[].data` field is sanitised away on load (no path / data injection).
- **`--lang <code,code>`** — activates a programmatically registered font loader for
  non-Latin scripts via `loadFontData(code)` (e.g. `--lang th,ja`). Requires calling
  `registerFontLoader(lang, loader)` in a wrapper before rendering. Throws a clear error
  when no loader is registered for the requested language code.
- **`--layout <file.json>`** — load any subset of `PdfLayoutOptions`. Path-traversal
  validated; JSON shape enforced; binary attachment payloads stripped on load.

#### `sign` command — signing metadata + cert chains

- **`--algorithm rsa-sha256|ecdsa-sha256`** — default `rsa-sha256`. ECDSA path is
  recognised but currently throws a clear stub error; tracked for v0.3.0 once
  pdfnative exposes `parseEcPrivateKey`.
- **`--reason`, `--name`, `--location`, `--contact`** — `PdfSignOptions` metadata fields
  surfaced on the CLI.
- **`--signing-time <ISO 8601>`** — explicit timestamp; validated up-front (exit 2 on
  malformed input, before any credential I/O).
- **`--cert-chain <path>`** — repeatable; intermediate-CA PEMs concatenated into
  `certChain[]`. Also readable from `PDFNATIVE_SIGN_CHAIN` env var (concatenated PEM).

#### `inspect` command — deeper analysis + assertions

- **`--verbose`** — adds `verbose.{trailerKeys, catalogKeys, objectCount, xmpMetadata}`.
  Sanitised: no raw stream bytes.
- **`--pages`** — adds `pages: [{ index, width, height, rotation, annotations, formFields }]`.
- **`--check pdfa|signed|encrypted`** — repeatable; ANDed. Sets exit code (0 = pass, 1 =
  fail) while still emitting the regular report. Composable with `--format json|text`.

#### `verify` command (NEW)

- **`pdfnative verify`** — verify CMS/PKCS#7 signatures embedded in a PDF.
  Flags: `--input <path|stdin>`, `--format json|text` (default `json`),
  `--strict` (exit 1 on any failure or zero signatures), `--trust <root.pem>` (repeatable).
- **Scope (v0.2.0):** byte-range integrity (SHA-256), certificate chain signatures
  (via pdfnative `verifyCertSignature`), trust evaluation against `--trust` roots and
  self-signed acceptance.
- **Out of scope (deferred to v0.3.0+):** full CMS signature-value verification, OCSP /
  CRL revocation, RFC 3161 timestamp tokens, Long-Term Validation (LTV).

#### Utilities & infrastructure

- **`src/utils/layout.ts`** — central layout composer (CLI flags + layout file).
- **`src/utils/keys.ts`** — PEM / PEM-chain loader with constant-time secret redaction
  guarantee in error paths (no PEM body ever leaks into stderr).
- **`src/utils/args.ts`** — `getStringFlagAll(flags, name)` for repeatable flags
  (`--cert-chain`, `--attachment`, `--trust`, `--check`).
- **`src/utils/io.ts`** — `readBinaryFile()` for image / attachment loading; reuses
  `validatePath` for traversal protection.
- **`src/utils/error.ts`** — `deprecate(name, replacement)` helper for stderr deprecation
  notices.

#### Samples (v0.2.0 categories)

- `samples/render/encryption/` — AES-128 password protection demo.
- `samples/render/headers-footers/` — page templates with `{page}/{pages}/{date}/{title}`.
- `samples/render/attachments/` — PDF/A-3 hybrid invoice with embedded XML
  (Factur-X / ZUGFeRD pattern).
- `samples/render/multilang/` — Thai and Japanese rendering via `--lang`.
- `samples/render/table-variant/` — `PdfParams`-shaped financial ledger.
- `samples/sign/02-with-metadata.{sh,ps1}` — signature with reason / name / location /
  contact / signing-time.
- `samples/inspect/03-verbose-pages.{sh,ps1}` — `--verbose --pages` report.
- `samples/inspect/04-check-pdfa.{sh,ps1}` — assertion-style `--check pdfa`.
- `samples/verify/01-self-signed.{sh,ps1}`, `samples/verify/02-strict-mode.{sh,ps1}`.
- `samples/run-all.js` updated with per-category flag dispatch (encryption, attachments,
  headers-footers, multilang, table-variant).

### Changed

- **`pdfnative` dependency** bumped from `^1.0.4` to `^1.0.5`.
- **Test surface** grown from 47 to **123** tests across 8 files; coverage gates
  recalibrated to 75 % statements / 80 % branches / 85 % functions / 75 % lines, measured
  at 82.62 / 82.18 / 92.72 / 82.62. `src/commands/verify.ts` and `src/index.ts` are
  excluded from coverage with explicit rationale (see `vitest.config.ts`); fixture for
  signed-PDF round-tripping is tracked for v0.3.0.
- **`samples/README.md`** restructured with new v0.2.0 categories.

### Fixed

- **Windows path regression in `--attachment`** — `loadAttachmentsFromFlags` now detects
  Windows drive-letter colons (e.g. `D:\\path`) and no longer splits the flag value at the
  drive colon, preventing `ENOENT D\` errors on Windows.
- **`params.layout` silently dropped in render** — when the JSON input contained a
  `layout` object (e.g. a watermark) and the CLI also built a layout object (even an empty
  `{}`), the JSON-embedded layout was overwritten. Fixed by explicitly merging
  `params.layout` (base) with CLI-derived flags (override) via `{ ...params.layout, ...layout }`.
- **Multilang samples required unbundled fonts** — `samples/render/multilang/` JSONs tried
  to render Thai/Japanese glyphs, but `hasFontLoader` checks an in-memory registry that
  is empty in the CLI process. Samples replaced with Latin-only font-loader registration
  guides; `run-all.js` no longer passes `--lang th/ja`.
- **Attachment sample used wrong row format** — `samples/render/attachments/01-pdfa3-with-xml.json`
  table rows were plain arrays (`["cell1", "cell2"]`) instead of `PdfRow` objects
  (`{ "cells": [...], "type": "normal", "pointed": false }`). Sample corrected.

### Changed

- **`--lang <code,code>`** — clarified: activates a *programmatically registered* font
  loader (via `registerFontLoader(lang, loader)` in a wrapper script). Latin is built-in;
  non-Latin scripts require a caller-supplied TTF loader. The previous wording
  ("bundled Noto fonts") was inaccurate — pdfnative uses a lazy loader registry, not a
  pre-bundled font set.

### Deprecated

- **`--conformance <1b|2b|3b>`** — superseded by `--tagged <pdfa1b|pdfa2b|pdfa3b>`.
  Still works; emits a one-line stderr deprecation notice. Will be removed in **v1.0.0**.

### Security

- **Encryption passwords** — `--encrypt-owner-pass` / `--encrypt-user-pass` honoured but
  recommended path is the `PDFNATIVE_ENCRYPT_OWNER_PASS` / `PDFNATIVE_ENCRYPT_USER_PASS`
  env vars. Passwords are never logged; absence of `--encrypt-owner-pass` and presence of
  any other `--encrypt-*` flag is a hard usage error (exit 2).
- **PEM redaction** — `loadPem` / `loadPemChain` surface only generic error messages on
  parse failure; raw key material never appears in CliError messages or stderr.
- **Path traversal** — `--layout`, `--attachment`, `--watermark-image`, `--key`,
  `--cert`, `--cert-chain`, `--trust` and all `--input` / `--output` arguments validated
  against directory traversal before filesystem access.
- **Layout-file injection** — `attachments[].data` fields in `--layout` JSON are stripped
  on load; binary attachment payloads must come from `--attachment <path>`.

### Backward compatibility

- Every v0.1.0 invocation continues to produce a byte-equivalent PDF (modulo a one-line
  stderr deprecation notice for `--conformance`). All v0.1.0 exit codes and JSON shapes
  preserved; new `inspect` JSON fields are additive only.

## [0.1.0] – 2026-04-27

### Added

- **`render` command** — render a `DocumentParams` JSON file or stdin stream to a PDF using `pdfnative`.
  Supports `--stream` (AsyncGenerator streaming) and `--conformance` (PDF/A 1b/2b/3b) flags.
- **`sign` command** — apply a CMS/PKCS#7 digital signature to an existing PDF.
  Private key and certificate loaded from `PDFNATIVE_SIGN_KEY`/`PDFNATIVE_SIGN_CERT` environment
  variables (recommended) or `--key`/`--cert` file paths. Keys are never logged.
- **`inspect` command** — analyse a PDF and output version, page count, encryption status,
  PDF/A conformance level, signature count, and metadata. Supports `--format json|text`.
- **Zero-dep arg parser** (`src/utils/args.ts`) — handles `--flag value`, `--flag=value`,
  `-f value`, boolean flags, and `--` pass-through. No third-party parser dependency.
- **`--help`/`-h`** and **`--version`/`-V`** global flags.
- **Path traversal validation** — all file path arguments validated before filesystem access.
- **50 MB JSON input cap** — enforced before `JSON.parse` to prevent memory exhaustion.
- **NPM provenance** — builds signed via GitHub Actions OIDC (SLSA Level 2+).
- **CI** — Node.js matrix [20, 22], CodeQL SAST, OpenSSF Scorecard, Dependabot.
- **`docs/KNOWLEDGE_BASE.md`** — structured knowledge base for AI assistants.
- **Comprehensive samples** — 23 new sample files covering every CLI feature, organized in
  categorized subdirectories matching the `pdfnative` test-output structure:
  - `render/document/` — 5 documents (minimal, report, all-blocks reference, invoice, technical spec)
  - `render/table/` — 2 table-focused layouts (project status, financial summary)
  - `render/barcode/` — 3 barcode types (QR code, Code 128, EAN-13)
  - `render/form/` — 2 interactive form samples (contact form, survey)
  - `render/toc/` — table of contents sample
  - `render/link/` — hyperlink sample
  - `render/watermark/` — 2 watermark samples (draft, confidential)
  - `render/layout/` — 3 page size/orientation samples (US Letter, A5 portrait, A4 landscape)
  - `render/pdfa/` — 3 PDF/A conformance samples (PDF/A-1b, PDF/A-2b, PDF/A-3b)
  - `sign/01-basic.sh` + `sign/01-basic.ps1` — cross-platform digital signature walkthrough
  - `inspect/01-json.sh` + `inspect/01-json.ps1` — JSON metadata extraction scripts
  - `inspect/02-text.sh` + `inspect/02-text.ps1` — human-readable inspection scripts
  - `streaming/01-large-document.js` — 200-section streaming render demo
  - `run-all.js` — cross-platform Node.js batch runner with `--category` and `--clean` flags
- **`samples/output/`** added to `.gitignore`; generated PDFs never committed.

### Changed

- `samples/` organized in categorized subdirectories (document, table, barcode, form, toc, link, watermark, layout, pdfa).
- Root `README.md` Examples section updated to reflect new categorized sample layout.
- `docs/KNOWLEDGE_BASE.md` updated with complete block type reference table (all 10 block
  types: heading, paragraph, table, list, barcode, link, toc, formField, spacer, pageBreak).
