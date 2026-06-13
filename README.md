# pdfnative-cli

[![CI](https://github.com/Nizoka/pdfnative-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Nizoka/pdfnative-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Nizoka/pdfnative-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/Nizoka/pdfnative-cli/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/pdfnative-cli)](https://www.npmjs.com/package/pdfnative-cli)
[![npm downloads](https://img.shields.io/npm/dm/pdfnative-cli)](https://www.npmjs.com/package/pdfnative-cli)
[![zero extra runtime dependencies](https://img.shields.io/badge/extra%20runtime%20deps-0-brightgreen)](https://www.npmjs.com/package/pdfnative-cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm provenance](https://img.shields.io/badge/provenance-signed-blueviolet)](https://docs.npmjs.com/generating-provenance-statements)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/Nizoka/pdfnative-cli/badge)](https://securityscorecards.dev/viewer/?uri=github.com/Nizoka/pdfnative-cli)
<!-- After registering the project at https://www.bestpractices.dev, add the badge:
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/<ID>/badge)](https://www.bestpractices.dev/projects/<ID>) -->
[![pdfnative](https://img.shields.io/npm/v/pdfnative?label=pdfnative&color=0066FF)](https://www.npmjs.com/package/pdfnative)
[![website](https://img.shields.io/badge/pdfnative.dev-0066FF?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxyZWN0IHg9IjMiIHk9IjIiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxOCIgcng9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTcgN2g2TTcgMTFoOE03IDE1aDQiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=)](https://pdfnative.dev)

Official CLI for the [`pdfnative`](https://github.com/Nizoka/pdfnative) library — render JSON to PDF, apply digital signatures, verify them, and inspect PDF conformance, directly from the terminal. Zero extra runtime dependencies.

> **What's new in v1.1.0** — built on **pdfnative 1.3.0**. `render` now exposes **22
> Unicode scripts** (Telugu, Sinhala, Tibetan, Khmer, Myanmar, Amharic/Ethiopic + the
> existing 16) and **COLRv1 colour emoji** through expanded `--font` / `--lang` shortcuts,
> plus **true constant-memory streaming** (`--stream-true`) and a `--max-blocks` cap for
> very large documents. `inspect` gains a **PDF/UA (ISO 14289-1) structural validator**
> via `--pdfua` and `--check pdfua` for CI accessibility gates. This release also adds an
> **agent-native contract** — a global `--json` status/error envelope, stable `E_*` error
> codes, a `--dry-run` validation mode, and a new **`schema`** command — so autonomous AI
> agents and CI pipelines can drive the CLI deterministically (see
> [AGENTS.md](AGENTS.md)). A CycloneDX **SBOM** (`sbom.cdx.json`) is now attached to every
> [GitHub release](https://github.com/Nizoka/pdfnative-cli/releases).
> 100% backward-compatible. See [release notes](release-notes/v1.1.0.md).
>
> ⭐ Star [`pdfnative`](https://github.com/Nizoka/pdfnative) — the zero-dependency PDF engine that powers this CLI.

## Highlights

- **`render`** — pipe a JSON document into a production-ready PDF. Encryption (AES-128/256),
  watermarks (text + image), page templates, PDF/A archival, **22 Unicode scripts + COLRv1
  colour emoji**, streaming (single-pass, page-by-page, or **true constant-memory
  `--stream-true`**), and a hybrid `flags + --layout file.json` model for the full
  `PdfLayoutOptions` surface.
- **`sign`** — CMS/PKCS#7 digital signatures with full metadata (`--reason`, `--name`,
  `--location`, `--contact`, `--signing-time`) and intermediate CA chains via
  `--cert-chain` (repeatable). Keys loaded from env vars or files; never logged.
- **`inspect`** — PDF version, page count, encryption, PDF/A conformance, signature count,
  metadata, and **PDF/UA (ISO 14289-1) structural validation**. `--verbose`, `--pages`,
  `--pdfua`, and `--check pdfa|signed|encrypted|pdfua` for CI assertions.
- **`verify`** — verify every CMS/PKCS#7 signature: byte-range integrity, RSA/ECDSA
  signature value, certificate chain, trust roots, **RFC 3161 timestamp (PAdES-T)**, and
  **OCSP + CRL revocation** (embedded `/DSS` offline by default, opt-in SSRF-guarded online).
  JSON & text output, `--strict`, `--revocation`, `--revocation-policy`.
- **`batch`** — render every JSON file in a directory to PDF in parallel, reusing the full
  `render` pipeline, with a per-file summary and bounded `--concurrency`.
- **`completion`** — emit `bash`, `zsh`, or `fish` shell-completion scripts.
- **`schema`** — print a versioned JSON Schema (Draft 2020-12) for any CLI input/output
  shape, so agents can self-validate before invoking a command.
- **Agent-native** — a global `--json` status/error envelope, stable `E_*` error codes, and
  a `--dry-run` validation mode let autonomous AI agents and CI drive the CLI
  deterministically. See [AGENTS.md](AGENTS.md).
- **`.pdfnativerc.json`** — optional config file for default flags (global + per-command);
  precedence is CLI flags > env > config.
- **Zero extra dependencies** — `pdfnative` is the sole runtime dependency.
- **Offline by default** — no network access unless you explicitly opt in with
  `verify --revocation online`, and even then every request passes an SSRF guard.
- **Stdin / stdout by default** — every command is shell-pipeline friendly.
- **Secret-safe** — signing keys, certs, encryption passwords never appear in error
  output or stderr. PEM material redacted; layout-file `attachments[].data` injection blocked.
- **ESM-first, TypeScript strict** — built with tsup, typed declarations included.
- **NPM provenance** — signed builds via GitHub Actions OIDC.

## Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Commands** | | |
| `render` JSON → PDF | ✅ | Streaming, hybrid layout model, multilingual fonts |
| `sign` digital signatures | ✅ | RSA (CMS/PKCS#7), metadata fields, cert chains |
| `inspect` PDF metadata | ✅ | `--verbose`, `--pages`, `--pdfua`, `--check pdfa\|signed\|encrypted\|pdfua` |
| `verify` signature verification | ✅ | Integrity + chain + trust + timestamp + revocation; `--strict` |
| `batch` parallel rendering | ✅ | Directory → PDFs, `--concurrency`, `--fail-fast` |
| `completion` shell scripts | ✅ | `bash` / `zsh` / `fish` |
| `schema` JSON Schema export | ✅ | `render` / `inspect` / `verify` / `batch` shapes |
| `.pdfnativerc.json` config file | ✅ | Global + per-command defaults; flags > env > config |
| **Agent / automation** | | |
| Global `--json` envelope | ✅ | Status on success, `{ ok, error: { code, message } }` on failure |
| Stable error codes | ✅ | `E_USAGE`, `E_INPUT`, `E_PARSE`, `E_SIGN`, `E_VERIFY_FAILED`, … |
| `--dry-run` validation | ✅ | `render` / `sign` / `batch` — validate without writing |
| **Document Blocks** | | |
| Headings, paragraphs, lists | ✅ | Full text styling support |
| Tables | ✅ | Headers, rows, multi-page |
| Barcodes | ✅ | QR, Code 128, EAN-13, Data Matrix, PDF417 |
| Hyperlinks | ✅ | URL validation, blue underlined text |
| Form fields | ✅ | Text, checkbox, radio, dropdown, listbox |
| Page breaks, spacers | ✅ | Explicit pagination control |
| Table of contents | ✅ | Auto-generated with `/GoTo` links |
| **Advanced Layouts (v0.2.0)** | | |
| PDF/A archival (1b, 2b, 2u, 3b) | ✅ | `--tagged pdfa<level>` (preferred) or `--conformance` (deprecated) |
| Streaming output | ✅ | `--stream` (single-pass) for large documents |
| Compression | ✅ | `--compress` flag |
| Encryption (AES-128/256) | ✅ | `--encrypt-*` flags + env-var precedence |
| Watermarks (text + image) | ✅ | `--watermark-text`, `--watermark-image`, `--watermark-position` |
| Headers / footers with placeholders | ✅ | `--header-{l,c,r}`, `--footer-{l,c,r}`, `{page}/{pages}/{date}/{title}` |
| Custom page sizes | ✅ | `--page-size A4\|Letter\|…` or `WxH` in points |
| Custom margins | ✅ | `--margin <N>` or `--margin <t,r,b,l>` |
| PDF/A-3 attachments | ✅ | `--attachment <path>:<mime>:<rel>:<desc>` (repeatable) |
| Multilingual fonts | ✅ | 22 Unicode scripts via `--font <code> --lang <code>` (e.g. `th`, `ja`, `ar`, `te`, `si`, `km`); Latin built-in |
| Table-centric variant (`PdfParams`) | ✅ | `--variant table` |
| Full `PdfLayoutOptions` | ✅ | `--layout <file.json>` |
| **Signing (v0.2.0)** | | |
| RSA signatures (rsa-sha256) | ✅ | Default algorithm |
| ECDSA signatures (ecdsa-sha256) | ✅ | P-256 SEC1 / PKCS#8 keys (v0.3.0) |
| Auto signature-placeholder injection | ✅ | One-command sign of any rendered PDF (v0.3.0) |
| Signature metadata | ✅ | `--reason`, `--name`, `--location`, `--contact`, `--signing-time` |
| Cert chains (intermediate CAs) | ✅ | `--cert-chain <pem>` (repeatable) or `PDFNATIVE_SIGN_CHAIN` env |
| **Verification (v0.2.0+)** | | |
| Byte-range integrity (SHA-256) | ✅ | Recomputed and compared with CMS messageDigest attribute |
| CMS signature-value verification | ✅ | RSA-SHA256 + ECDSA-SHA256 (v0.3.0) |
| Certificate chain verification | ✅ | Via pdfnative `verifyCertSignature` |
| Trust roots | ✅ | `--trust <root.pem>` (repeatable) + self-signed acceptance |
| RFC 3161 timestamp recognition | ✅ | Reported as `timestampPresent` |
| RFC 3161 timestamp validation (PAdES-T) | ✅ | TSA signature, messageImprint binding, chain, `genTime` |
| OCSP revocation (RFC 6960) | ✅ | Embedded `/DSS` + opt-in online via AIA (SSRF-guarded) |
| CRL revocation (RFC 5280) | ✅ | Embedded `/DSS` + opt-in online via CDP (SSRF-guarded) |
| Revocation policy | ✅ | `--revocation offline\|online\|disabled`, `--revocation-policy soft-fail\|strict` |
| Sign-side LTV (timestamp embedding / DSS) | ⚠️ | Upstream-blocked in pdfnative; `sign --timestamp` reserved |
| **Render iteration** | | |
| Smart tables | ✅ | `--table-wrap`, `--repeat-header`, `--zebra`, `--cell-padding`, `--min-row-height` |
| Page-by-page streaming | ✅ | `--stream-page-by-page` (TOC- and `{pages}`-compatible) |
| True constant-memory streaming | ✅ | `--stream-true` (parts freed as emitted; byte-identical output) |
| Configurable block cap | ✅ | `--max-blocks <n>` (default 100 000) |
| PDF/UA structural validation | ✅ | `inspect --pdfua` / `--check pdfua` (ISO 14289-1) — developer-time gate, not a substitute for veraPDF |
| `--watch` re-render on file change | ✅ | 200 ms debounce, requires file `--output` |
| `--template <file.json>` | ✅ | Deep-merge base under input (caller wins) |
| `--font` bundled shortcuts | ✅ | Repeatable allow-list: `latin`, `emoji`, `color-emoji`, 22 script codes |

**Note:** features marked **⚠️** are tracked in [ROADMAP.md](ROADMAP.md). Everything else
works today.

## Installation

```bash
npm install --global pdfnative-cli
```

Or run without installing:

```bash
npx pdfnative-cli render --input doc.json --output report.pdf
```

**Requirements:** Node.js ≥ 20 | Bun | Deno (`node dist/cli.cjs`)

## Documentation

- 📘 **[Quick Start](#quick-start)** (below) — Get rendering in 5 minutes
- 🏛️ **[KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)** — Full CLI reference, architecture, integration patterns
- 📚 **[samples/README.md](samples/README.md)** — 22 sample files organized by feature
- 🔧 **[pdfnative library](https://github.com/Nizoka/pdfnative)** — Underlying PDF engine docs
- ❓ **[FAQ](docs/KNOWLEDGE_BASE.md#11-frequently-asked-questions)** — Common questions & troubleshooting

## Quick Start

### Render a PDF from JSON

```bash
# From a file
pdfnative render --input document.json --output report.pdf

# From stdin
cat document.json | pdfnative render --output report.pdf

# Streaming (large documents)
pdfnative render --input big-doc.json --output report.pdf --stream

# True constant-memory streaming (lowest peak memory; byte-identical)
pdfnative render --input big-doc.json --output report.pdf --stream-true

# PDF/A conformance
pdfnative render --input document.json --output archived.pdf --conformance 2b
```

`document.json` is a [`DocumentParams`](https://github.com/Nizoka/pdfnative) object:

```json
{
  "title": "Monthly Report",
  "blocks": [
    { "type": "heading", "text": "Monthly Report", "level": 1 },
    { "type": "paragraph", "text": "Summary for April 2026." },
    { "type": "list", "style": "bullet", "items": ["Revenue: +18%", "NPS: 72"] }
  ],
  "footerText": "Confidential",
  "metadata": { "author": "Finance Team", "subject": "April 2026 Report" }
}
```

### Sign a PDF

```bash
# Keys from environment variables (recommended for CI/CD)
export PDFNATIVE_SIGN_KEY="$(cat private.pem)"
export PDFNATIVE_SIGN_CERT="$(cat cert.pem)"
pdfnative sign --input document.pdf --output signed.pdf

# Keys from files
pdfnative sign --input document.pdf --output signed.pdf \
  --key private.pem --cert cert.pem
```

### Inspect a PDF

```bash
# JSON output (default)
pdfnative inspect --input report.pdf

# Human-readable
pdfnative inspect --input report.pdf --format text

# PDF/UA (ISO 14289-1) structural validation report
pdfnative inspect --input report.pdf --pdfua

# CI accessibility gate (exit 1 if not PDF/UA-structurally-valid)
pdfnative inspect --input report.pdf --check pdfua

# From stdin
cat report.pdf | pdfnative inspect
```

Example output:

```json
{
  "version": "1.7",
  "pageCount": 3,
  "encrypted": false,
  "pdfaConformance": "2b",
  "signatures": 1,
  "metadata": {
    "title": "Monthly Report",
    "author": "Nizoka",
    "creationDate": "2026-04-27T12:00:00+00:00"
  }
}
```

## Examples

Ready-to-run examples are in [`samples/`](samples/), organized by feature category:

| Category | Examples | Description |
|----------|----------|-------------|
| [`render/document/`](samples/render/document/) | 6 files | Minimal, report, all-blocks reference, invoice, technical spec, `--max-blocks` guard |
| [`render/table/`](samples/render/table/) | 2 files | Project status, financial summary |
| [`render/barcode/`](samples/render/barcode/) | 3 files | QR code, Code 128 shipping label, EAN-13 product |
| [`render/form/`](samples/render/form/) | 2 files | Contact form, survey |
| [`render/toc/`](samples/render/toc/) | 1 file | Document with auto-generated table of contents |
| [`render/link/`](samples/render/link/) | 1 file | Resource directory with hyperlinks |
| [`render/watermark/`](samples/render/watermark/) | 2 files | Draft watermark, confidential watermark |
| [`render/layout/`](samples/render/layout/) | 3 files | US Letter, A5 portrait, A4 landscape |
| [`render/pdfa/`](samples/render/pdfa/) | 3 files | PDF/A-1b, PDF/A-2b, PDF/A-3b archival conformance |
| [`sign/`](samples/sign/) | 2 scripts | Digital signature (Bash + PowerShell) |
| [`inspect/`](samples/inspect/) | 4 scripts | JSON & text inspection (Bash + PowerShell) |
| [`streaming/`](samples/streaming/) | 1 script | 200-section document via streaming render |

**Render all samples at once:**

```bash
node samples/run-all.js
```

See [`samples/README.md`](samples/README.md) for full descriptions, block type reference, and integration patterns (GitHub Actions, Docker, TypeScript).

---

## Command Reference

### `pdfnative render`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to a JSON file (`DocumentParams` or `PdfParams` if `--variant table`) |
| `--output <file>` | stdout | Output PDF path |
| `--stream` | false | Single-pass streaming output (`AsyncGenerator`); no TOC, no `{pages}` |
| `--stream-page-by-page` | false | Stream at PDF object boundaries (TOC- and `{pages}`-compatible) |
| `--stream-true` | false | True constant-memory streaming; parts freed as emitted; byte-identical; no TOC, no `{pages}` |
| `--variant <kind>` | `document` | `document` (default) or `table` (selects `buildPDFBytes`) |
| `--layout <file.json>` | — | Load a `Partial<PdfLayoutOptions>` (CLI flags override) |
| `--page-size <size>` | from layout file or pdfnative default | Named (`a4`, `letter`, `legal`, `a3`, `tabloid`, `a5`) or `WxH` in points |
| `--margin <N>` or `--margin <t,r,b,l>` | from layout / default | Page margins in points |
| `--compress` | false | Enable FlateDecode compression |
| `--max-blocks <n>` | `100000` | Maximum document blocks before pdfnative aborts (large-report guard) |
| `--tagged <level>` | none | PDF/A: `none`, `pdfa1b`, `pdfa2b`, `pdfa2u`, `pdfa3b` |
| `--conformance <1b\|2b\|3b>` | — | **Deprecated** — use `--tagged pdfa<level>` |
| `--watermark-text <s>` / `--watermark-image <path>` | — | Text or image watermark |
| `--watermark-opacity <0-1>` / `--angle <deg>` / `--color <#hex>` / `--font-size <pt>` | — | Watermark styling |
| `--watermark-position background\|foreground` | `background` | Render order |
| `--header-{left,center,right} <tpl>` | — | Header template; placeholders `{page}`, `{pages}`, `{date}`, `{title}` |
| `--footer-{left,center,right} <tpl>` | — | Footer template; same placeholders |
| `--encrypt-owner-pass <s>` | `$PDFNATIVE_ENCRYPT_OWNER_PASS` | Owner password (required for any `--encrypt-*`) |
| `--encrypt-user-pass <s>` | `$PDFNATIVE_ENCRYPT_USER_PASS` | Optional user password |
| `--encrypt-algorithm aes128\|aes256` | `aes128` | Encryption algorithm |
| `--encrypt-permissions <list>` | _all denied_ | Comma list: `print,copy,modify,extractText` |
| `--attachment <path>[:mime[:rel[:desc]]]` _(repeatable)_ | — | PDF/A-3 file attachment |
| `--lang <code,code>` | — | Activate registered font loaders for non-Latin scripts (`th`, `ja`, `ar`, `te`, `si`, `km`, …); Latin is built-in |
| `--font <name>` _(repeatable)_ | — | Register a bundled font shortcut. Allow-list: `latin`, `emoji`, `color-emoji`, and the 22 script codes `ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`. The name doubles as the `--lang` code. |

See `samples/render/` for a working example of every category.

### `pdfnative sign`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | — **(required)** | Path to the input PDF |
| `--output <file>` | stdout | Output signed PDF path |
| `--key <file>` | `$PDFNATIVE_SIGN_KEY` | Path to PEM private key (env var takes precedence) |
| `--cert <file>` | `$PDFNATIVE_SIGN_CERT` | Path to PEM certificate (env var takes precedence) |
| `--cert-chain <file>` _(repeatable)_ | `$PDFNATIVE_SIGN_CHAIN` | Intermediate CA PEMs |
| `--algorithm rsa-sha256\|ecdsa-sha256` | `rsa-sha256` | Signature algorithm. _ECDSA stubbed in v0.2.0; tracked for v0.3.0._ |
| `--reason <s>` | — | Reason for signing (PDF metadata) |
| `--name <s>` | — | Signer name (PDF metadata) |
| `--location <s>` | — | Signing location (PDF metadata) |
| `--contact <s>` | — | Signer contact (PDF metadata) |
| `--signing-time <ISO 8601>` | now | Explicit signing timestamp |

### `pdfnative inspect`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to the PDF to inspect |
| `--output <file>` | stdout | Output report path |
| `--format json\|text` | `json` | Output format |
| `--verbose` | false | Add trailer keys, catalog keys, object count, XMP |
| `--pages` | false | Add per-page metadata array |
| `--pdfua` | false | Add a PDF/UA (ISO 14289-1) structural validation report (`valid` + `errors` + `warnings`) |
| `--check pdfa\|signed\|encrypted\|pdfua` _(repeatable)_ | — | CI-friendly assertion; sets exit code (0 = pass, 1 = fail) |

### `pdfnative verify`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to the (possibly signed) PDF |
| `--format json\|text` | `json` | Output format |
| `--strict` | false | Exit 1 on any failure or zero signatures (CI-friendly) |
| `--trust <root.pem>` _(repeatable)_ | _self-signed only_ | Trusted root certificates (PEM) |
| `--revocation offline\|online\|disabled` | `offline` | Revocation source: embedded `/DSS` only, also fetch online (SSRF-guarded), or skip |
| `--revocation-policy soft-fail\|strict` | `soft-fail` | `strict` fails the signature on any non-`good` status; `soft-fail` only fails on explicit `revoked` |

**Scope (v1.0.0):** byte-range integrity (SHA-256), full CMS signature value
(RSA-PKCS#1 v1.5 SHA-256 + ECDSA-SHA256 over P-256), certificate chain + trust,
**RFC 3161 timestamp validation (PAdES-T)**, and **OCSP (RFC 6960) + CRL (RFC 5280)
revocation** — embedded from the PDF `/DSS` offline by default, with opt-in online
fetching through an SSRF-guarded HTTP client. Sign-side LTV (embedding timestamps /
DSS at signing time) is upstream-blocked in pdfnative — see [ROADMAP.md](ROADMAP.md)
and [SECURITY.md](SECURITY.md#network-access-revocation-checking).

### `pdfnative batch`

| Flag | Default | Description |
|------|---------|-------------|
| `--input-dir <dir>` | _required_ | Directory of `*.json` document definitions |
| `--output-dir <dir>` | _required_ | Output directory for the rendered `*.pdf` (created if absent) |
| `--concurrency <n>` | `4` | Maximum parallel renders |
| `--fail-fast` | false | Stop at the first failure (default: render all, then report) |
| `--format json\|text` | `text` | Summary format |

All other flags are forwarded to each `render`. Exit code 1 if any file fails.

### `pdfnative completion`

```bash
pdfnative completion bash > /etc/bash_completion.d/pdfnative
pdfnative completion zsh  > "${fpath[1]}/_pdfnative"
pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
```

### `pdfnative schema`

Print a versioned JSON Schema (Draft 2020-12) for a CLI input/output shape, so an
agent can self-validate before invoking a command.

```bash
pdfnative schema            # render input schema (default)
pdfnative schema render     # render input (document | table variant)
pdfnative schema inspect    # inspect --format json output
pdfnative schema verify     # verify  --format json output
pdfnative schema batch      # batch   --format json output
pdfnative schema list       # list the available subjects
```

### Global options

| Flag | Description |
|------|-------------|
| `--config <file>` | Use a specific `.pdfnativerc.json` (default: nearest upward from cwd) |
| `--no-config` | Ignore any `.pdfnativerc.json` |
| `--quiet`, `-q` | Suppress progress output on stderr |
| `--no-color` | Disable ANSI colour (also respects the `NO_COLOR` env var) |
| `--json` | Agent mode: emit a JSON status/error envelope on stderr (data stays on stdout) |
| `--dry-run` | Validate inputs and exit without writing output (`render` / `sign` / `batch`) |
| `--version --json` | Machine-readable version output |

## Driving from AI agents

`pdfnative-cli` is designed so an autonomous agent (or any program) can drive it
deterministically — no MCP server, no daemon, just the process contract:

- **stdout = the artifact** (PDF, JSON report, schema, completion script);
  **stderr = diagnostics.**
- Pass **`--json`** to get a single machine-readable envelope on stderr. On failure:
  `{ "ok": false, "command": "...", "error": { "code": "E_*", "message": "..." } }`.
  On success for `render` / `sign` / `batch`: a `{ "ok": true, ... }` status line.
- Branch on the **stable error code** (`E_USAGE`, `E_INPUT`, `E_PARSE`, `E_IO`, `E_SIGN`,
  `E_VERIFY_FAILED`, `E_CHECK_FAILED`, `E_UNSUPPORTED`, `E_RUNTIME`) rather than the
  message text. Numeric **exit codes** stay `0` (success), `1` (runtime), `2` (usage).
- Use **`--dry-run`** to validate input without producing output.
- Fetch a **`schema`** to validate input before calling.

See [AGENTS.md](AGENTS.md) and the [`samples/agent/`](samples/agent) scripts.

## Security

- **Offline by default** — no network access unless you pass `verify --revocation online`.
  Online revocation requests pass an **SSRF guard** (scheme allow-list, private/loopback/
  link-local/CGNAT address blocking, no redirects, timeout + size caps).
- **Signing keys are never logged** — not in error messages, not in debug output.
- **Path traversal protection** — all file path arguments are validated against `../` sequences.
- **JSON size cap** — input is capped at 50 MB before parsing to prevent memory exhaustion.
- Signed builds with NPM provenance — verify at npmjs.com or with `npm audit signatures`.

See [SECURITY.md](SECURITY.md) for the full security policy and vulnerability disclosure procedure.

## Getting Help

**Have a question?**
- 📖 Check the [FAQ](docs/KNOWLEDGE_BASE.md#12-frequently-asked-questions) first
- 🔍 Search the samples: `grep -r "your-keyword" samples/`
- 📚 Read [KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md) for technical details
- 💬 Open a discussion: [GitHub Discussions](https://github.com/Nizoka/pdfnative-cli/discussions)

**Found a bug?**
- 🐛 Open an issue: [GitHub Issues](https://github.com/Nizoka/pdfnative-cli/issues)
- 🔐 Security issue? See [SECURITY.md](SECURITY.md) for responsible disclosure

**Want to contribute?**
- 🤝 See [CONTRIBUTING.md](CONTRIBUTING.md)
- 📝 All PRs add value — tests, docs, translations, samples

## Related Projects

- [`pdfnative`](https://github.com/Nizoka/pdfnative) — the core PDF generation library
- [`pdfnative-mcp`](https://github.com/Nizoka/pdfnative-mcp) — Model Context Protocol server for AI clients
- [pdfnative.dev](https://pdfnative.dev) — documentation, live demos, benchmarks

## Citation

If you use pdfnative-cli in research or academic pipelines, please cite it:

```bibtex
@software{pdfnative_cli_2026,
  title  = {pdfnative-cli: Official CLI for the pdfnative PDF generation library},
  author = {Nizoka},
  year   = {2026},
  url    = {https://github.com/Nizoka/pdfnative-cli},
  license = {MIT}
}
```

See [CITATION.cff](CITATION.cff) for the full metadata (auto-detected by GitHub and Zenodo).

## License

MIT — see [LICENSE](LICENSE).