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

> **What's new in v1.4.0** — built on **pdfnative 1.7.0**. Four new commands: **`ltv`**
> (PAdES B-LT: collect/embed OCSP+CRL validation data into `/DSS` + `/VRI`, air-gap-friendly),
> **`doc-timestamp`** (PAdES B-LTA: RFC 3161 `/DocTimeStamp` revisions), **`metadata`**
> (update `/Info` + XMP with an incremental save — signatures stay valid), and **`compare`**
> (text + structure diff with CI-friendly exit codes). `sign --timestamp <tsa-url>` is now
> **functional** (RFC 3161, PAdES B-T), with **multi-signatures** (`--allow-multiple`),
> `--profile pades`, sha384/512 digests, and visible signature placement. `render` gains
> **`--strict`** PDF/A gating, **charts v2** (9 types, dual axes, log/time scales), and
> **print production** (bleed/trim boxes, output intents, viewer preferences). `batch` gains
> declarative **`--manifest`** pipelines. Adds the stable **`E_NETWORK`** code and a global
> **`--max-inflate-size`** anti-zip-bomb cap. Zero breaking changes; **Node ≥ 22** now required.
> See [release notes](release-notes/v1.4.0.md) and [AGENTS.md](AGENTS.md).
>
> ⭐ Star [`pdfnative`](https://github.com/Nizoka/pdfnative) — the zero-dependency PDF engine that powers this CLI.

## Highlights

- **`render`** — pipe a JSON document into a production-ready PDF. Encryption (AES-128/256),
  watermarks (text + image), page templates, PDF/A archival, **22 Unicode scripts + COLRv1
  colour emoji + a bundled math font (`--font math`)**, **native vector charts** (bar, barH,
  line, pie, donut — pdfnative 1.6.0), **PDF bookmarks** (`--outline`), **layout introspection**
  (`--inspect-layout` / `--debug-layout`), streaming (single-pass, page-by-page, or **true
  constant-memory `--stream-true`**), and a hybrid `flags + --layout file.json` model.
- **`extract-text` / `fill` / `encrypt` / `decrypt`** (v1.3.0, pdfnative 1.6.0) — extract
  reading-order text as text/JSON/**NDJSON** for RAG & agents (no OCR); fill, flatten &
  **export** AcroForms with an incremental save (signatures stay valid; `fill --export` gives
  a read→edit→fill round-trip); re-secure with **AES-128/256** or remove encryption. `merge` /
  `split` / `extract` gain `--password`, `--encrypt`, and constant-memory `--stream`.
- **`doctor`** — an offline environment/capability preflight (CLI/Node/pdfnative versions,
  Web Crypto CSPRNG required by `encrypt`, command count). Text or `--json`; exit 0/1 — an
  ideal agent pre-flight.
- **`sign`** — CMS/PKCS#7 digital signatures with full metadata (`--reason`, `--name`,
  `--location`, `--contact`, `--signing-time`) and intermediate CA chains via
  `--cert-chain` (repeatable). Uses **native `node:crypto`** for constant-time signatures
  by default (`--pure-crypto` opts out). Keys loaded from env vars or files; never logged.
  v1.4.0 adds a **functional RFC 3161 `--timestamp <tsa-url>`** (PAdES B-T), **PAdES
  profile** (`--profile pades` — ETSI.CAdES.detached, ESS signing-certificate-v2),
  **sha384/512 digests** (RSA), **multi-signatures** (`--allow-multiple` / `--field-name`),
  and **visible signature placement** (`--signature-rect` / `--signature-page`).
- **PAdES long-term signatures (v1.4.0, pdfnative 1.7.0)** — the full B-T → B-LT → B-LTA
  ladder: `sign --timestamp <tsa> --profile pades` (B-T) → `ltv add --online` (B-LT: OCSP +
  CRL validation data archived into `/DSS` + `/VRI`) → `doc-timestamp --url <tsa>` (B-LTA:
  a `/DocTimeStamp` revision, repeatable for renewal) → `ltv add --online`. The `ltv
  collect` / `ltv embed` split supports **air-gapped pipelines** — collect on a connected
  machine, embed fully offline. All network access is explicit opt-in and SSRF-guarded.
- **`metadata` / `compare`** (v1.4.0) — update `/Info` + XMP metadata with an
  **incremental save** (existing signatures stay valid); diff two PDFs by **text +
  structure** with CI-friendly exit codes (identical → 0, different → 1 / `E_CHECK_FAILED`).
- **`batch --manifest`** (v1.4.0) — a declarative, sequential multi-command pipeline
  (`render` → `sign` → `verify` → …) in one JSON file, with `@<id>` output references and
  an `--allow-network` gate so untrusted manifests can never trigger network I/O.
- **Print production & charts v2** (v1.4.0, pdfnative 1.7.0) — `render` layout gains
  bleed/trim/art/crop boxes, printer marks, `userUnit`, ICC output intents, and viewer
  preferences (duplex, `numCopies`, …); charts grow to **9 types** (stacked bars, area,
  scatter) with dual axes, log/time/category x-axes, and data labels. `render --strict`
  turns PDF/A conformance diagnostics into a hard error before the first output byte.
- **`inspect`** — PDF version, page count, encryption, PDF/A conformance, signature count,
  metadata, **page labels**, **markup/link annotations** (`--annotations`), and **PDF/UA
  (ISO 14289-1) structural validation**. `--verbose`, `--pages`, `--pdfua`, and
  `--check pdfa|signed|encrypted|pdfua` for CI assertions.
- **`verify`** — verify every CMS/PKCS#7 signature: byte-range integrity, RSA/ECDSA
  signature value (RSA now also sha384/512), certificate chain, trust roots, **RFC 3161
  timestamp (PAdES-T)**, **`/DocTimeStamp` revisions (PAdES B-LTA)**, and **OCSP + CRL
  revocation** (embedded `/DSS` offline by default, opt-in SSRF-guarded online).
  JSON & text output, `--strict`, `--revocation`, `--revocation-policy`.
- **`merge` / `split` / `extract`** — page-tree operations (pdfnative 1.5.0): concatenate
  several PDFs, split one PDF into many (per-page or per-range), or pull selected pages into
  a new PDF. `--drop-annotations` and `--max-output-size` guards included.
- **`annotate`** — attach markup annotations (highlight, text note, square, line, …) to an
  existing PDF via a JSON spec, using an **incremental save** so the original bytes — and any
  existing signature — stay intact.
- **`govern`** — expose pdfnative's **AI-governance / HITL** contract: `govern rules`,
  `govern policy`, and `govern verify-issue <draft.md>` to gate an issue/PR draft (exit 1 /
  `E_POLICY` on violation) before a **human** reviews and submits it.
- **`batch`** — render every JSON file in a directory to PDF in parallel, reusing the full
  `render` pipeline, with a per-file summary and bounded `--concurrency`.
- **`completion`** — emit `bash`, `zsh`, `fish`, or `powershell` shell-completion scripts.
- **`schema`** — print a versioned JSON Schema (Draft 2020-12) for any CLI input/output
  shape, plus **`schema manifest`** (a machine-readable capability manifest) and
  [`llms.txt`](llms.txt), so agents can self-validate and discover the CLI's tools.
- **Agent-native** — a global `--json` status/error envelope, stable `E_*` error codes, and
  a `--dry-run` validation mode let autonomous AI agents and CI drive the CLI
  deterministically. Token-economy levers — **`--summary`** (minimal verdict), **`--fields`**
  (dot-path projection), and compact JSON under `--json` — shrink agent output ~90 %.
  See [AGENTS.md](AGENTS.md).
- **AI-governance / HITL** — the **`govern`** command surfaces pdfnative's Human-in-the-Loop
  contract to agents: they act as *draftsmen*, never autonomous submitters. `govern
  verify-issue` gates a local draft; a human always reviews and submits.
- **`.pdfnativerc.json`** — optional config file for default flags (global + per-command);
  precedence is CLI flags > env > config.
- **Zero extra dependencies** — `pdfnative` is the sole runtime dependency.
- **Offline by default** — no network access unless you explicitly opt in with
  `verify --revocation online`, `sign --timestamp`, `ltv --online`, `doc-timestamp --url`,
  or `batch --allow-network` — and every request passes an SSRF guard (no redirects).
- **Stdin / stdout by default** — every command is shell-pipeline friendly.
- **Secret-safe** — signing keys, certs, encryption passwords never appear in error
  output or stderr. PEM material redacted; layout-file `attachments[].data` injection blocked.
- **ESM-first, TypeScript strict** — built with tsup, typed declarations included.
- **NPM provenance** — signed builds via GitHub Actions OIDC.

## Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Commands** | | |
| `render` JSON → PDF | ✅ | Streaming, hybrid layout model, multilingual fonts, bookmarks, layout introspection |
| `sign` digital signatures | ✅ | RSA/ECDSA (CMS/PKCS#7), metadata fields, cert chains, native `node:crypto` |
| `inspect` PDF metadata | ✅ | `--verbose`, `--pages`, `--pdfua`, `--annotations`, `--form-fields`, `--encryption`, `--password`, page labels, `--check …` |
| `verify` signature verification | ✅ | Integrity + chain + trust + timestamp + revocation; `--strict` |
| `extract-text` reading-order text | ✅ | `--format text\|json\|ndjson`, `--runs`, `--pages`, `--password`; RAG/agent-native (no OCR) |
| `fill` fill / flatten / export AcroForms | ✅ | `--data <values.json>`, `--flatten`, `--export` (values → `--data` map); incremental save |
| `encrypt` / `decrypt` | ✅ | AES-128/256 re-encryption & transparent decryption (`--password`, `--stream`) |
| `doctor` preflight | ✅ | CLI/Node/pdfnative versions, Web Crypto (CSPRNG), command count; text or `--json` |
| `merge` concatenate PDFs | ✅ | Page-tree API; `--password`, `--encrypt`, `--stream`, `--drop-annotations`, `--max-output-size` |
| `split` one PDF → many | ✅ | Per-page (default) or per-range (`--pages`); `--password`, `--encrypt`, `--stream` |
| `extract` selected pages | ✅ | 1-based `--pages` list/range; `--password`, `--encrypt`, `--stream` |
| `annotate` markup annotations | ✅ | Incremental save (signatures preserved); JSON spec via `--annotations` |
| `govern` AI-governance / HITL | ✅ | `rules` / `policy` / `verify-issue`; gates drafts with `E_POLICY` |
| `batch` parallel rendering | ✅ | Directory → PDFs, `--concurrency`, `--fail-fast` |
| `completion` shell scripts | ✅ | `bash` / `zsh` / `fish` / `powershell` |
| `schema` JSON Schema export | ✅ | Per-command schemas + summaries + `status` + `manifest` (capability manifest) |
| `.pdfnativerc.json` config file | ✅ | Global + per-command defaults; flags > env > config |
| **Agent / automation** | | |
| Global `--json` envelope | ✅ | Status on success, `{ ok, error: { code, message } }` on failure |
| Stable error codes | ✅ | `E_USAGE`, `E_INPUT`, `E_PARSE`, `E_SIGN`, `E_VERIFY_FAILED`, `E_POLICY`, `E_PASSWORD`, `E_NETWORK`, … |
| Capability manifest | ✅ | `schema manifest` (JSON) + `llms.txt` — for agent tool discovery |
| `--dry-run` validation | ✅ | `render` / `sign` / `batch` / `merge` / `split` / `extract` / `annotate` / `fill` / `encrypt` / `decrypt` / `metadata` / `ltv` / `doc-timestamp` |
| **Document Blocks** | | |
| Headings, paragraphs, lists | ✅ | Full text styling support |
| Tables | ✅ | Headers, rows, multi-page |
| Barcodes | ✅ | QR, Code 128, EAN-13, Data Matrix, PDF417 |
| Charts | ✅ | `chart` block: bar, barH, line, pie, donut (native PDF paths, pdfnative 1.6.0) |
| Hyperlinks | ✅ | URL validation, blue underlined text |
| Form fields | ✅ | Text, checkbox, radio, dropdown, listbox |
| Page breaks, spacers | ✅ | Explicit pagination control |
| Table of contents | ✅ | Auto-generated with `/GoTo` links |
| **Advanced Layouts (v0.2.0)** | | |
| PDF/A archival (1b, 2b, 2u, 3b) | ✅ | `--tagged pdfa<level>` (preferred) or `--conformance` (deprecated); validated against the **veraPDF** reference validator in CI (blocking) |
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
| Sign-side LTV (timestamp embedding / DSS) | ✅ | v1.4.0: `sign --timestamp`, `ltv collect\|embed\|add`, `doc-timestamp` (see below) |
| **Render iteration** | | |
| Smart tables | ✅ | `--table-wrap`, `--repeat-header`, `--zebra`, `--cell-padding`, `--min-row-height` |
| Page-by-page streaming | ✅ | `--stream-page-by-page` (TOC- and `{pages}`-compatible) |
| True constant-memory streaming | ✅ | `--stream-true` (parts freed as emitted; byte-identical output) |
| Configurable block cap | ✅ | `--max-blocks <n>` (default 100 000) |
| PDF/UA structural validation | ✅ | `inspect --pdfua` / `--check pdfua` (ISO 14289-1) — developer-time gate, not a substitute for veraPDF |
| `--watch` re-render on file change | ✅ | 200 ms debounce, requires file `--output` |
| `--template <file.json>` | ✅ | Deep-merge base under input (caller wins) |
| `--font` bundled shortcuts | ✅ | Repeatable allow-list: `latin`, `emoji`, `color-emoji`, `math`, 22 script codes |
| **Page-tree & annotations (v1.2.0)** | | |
| Merge PDFs | ✅ | `merge <a.pdf> <b.pdf> …` (or repeatable `--input`) → `--output` |
| Split PDF | ✅ | `split --output-dir <dir>` per-page, or `--pages 1-2,3-4` per-range |
| Extract pages | ✅ | `extract --pages 4,1-2` (1-based; order preserved, repeats allowed) |
| Drop annotations on copy | ✅ | `--drop-annotations` on `merge` / `split` / `extract` |
| Output-size guard | ✅ | `--max-output-size <bytes>` on `merge` / `split` / `extract` |
| Markup annotations | ✅ | `annotate --annotations <spec.json>` — highlight, text, square, circle, line, freetext, … |
| Incremental save | ✅ | `annotate` preserves original bytes (existing signatures stay valid) |
| Inspect annotations | ✅ | `inspect --annotations` lists markup + link annotations |
| Page labels | ✅ | `inspect` reports `/PageLabels` when present |
| **Bookmarks & layout (v1.2.0)** | | |
| PDF bookmarks (outline) | ✅ | `render --outline auto` (from headings) or `--outline <tree.json>` |
| Math / technical symbols | ✅ | `render --font math` (Noto Sans Math; auto-routed code points) |
| Layout inspection report | ✅ | `render --inspect-layout` → `LayoutInspection` JSON (no PDF) |
| Layout debug overlay | ✅ | `render --debug-layout [margins,content,cells]` |
| **Signing crypto (v1.2.0)** | | |
| Native constant-time crypto | ✅ | `sign` uses `node:crypto` by default (side-channel-resistant) |
| Pure-JS crypto fallback | ✅ | `sign --pure-crypto` forces pdfnative's portable bignum path |
| **AI-governance / HITL (v1.2.0)** | | |
| Governance rules / policy | ✅ | `govern rules` (protocol) / `govern policy` (machine-readable JSON) |
| Draft verification gate | ✅ | `govern verify-issue <draft.md>` → exit 1 / `E_POLICY` on violation |
| **Text, forms, encryption & charts (v1.3.0, pdfnative 1.6.0)** | | |
| Text extraction | ✅ | `extract-text --format text\|json\|ndjson` (reading order, `--runs`, `--password`); no OCR |
| Fill AcroForms | ✅ | `fill --data <values.json>` (incremental save; encrypted PDFs via `--password`) |
| Flatten AcroForms | ✅ | `fill --flatten` (stamp appearances, remove interactive fields) |
| Export form values | ✅ | `fill --export` → `--data`-shaped JSON map (read → edit → fill round-trip) |
| Encrypt / decrypt | ✅ | `encrypt --owner-password …` (AES-128/256) / `decrypt --password …` (`--stream`) |
| Encrypted page-tree sources | ✅ | `--password` on `merge` / `split` / `extract` / `inspect` |
| Re-encrypt page-tree output | ✅ | `--encrypt [aes-128\|aes-256]` on `merge` / `split` / `extract` |
| Constant-memory streaming | ✅ | `--stream` (+ `--chunk-size`) on `merge` / `split` / `extract` / `encrypt` / `decrypt` |
| Native vector charts | ✅ | `chart` document block: bar, barH, line, pie, donut (pure PDF paths, tagged `/Figure`) |
| List form fields / encryption | ✅ | `inspect --form-fields` / `inspect --encryption` |
| Unified `render` encryption flags | ✅ | `render --encrypt [aes-128\|aes-256] --owner-password …` (same vocab as merge/split/extract) |
| Environment preflight | ✅ | `doctor` (versions, Web Crypto/CSPRNG, command count; text or `--json`) |
| Capability manifest | ✅ | `schema manifest` + `llms.txt` for agent tool discovery |
| PowerShell completion | ✅ | `completion powershell` |
| **Long-term signatures & document ops (v1.4.0, pdfnative 1.7.0)** | | |
| RFC 3161 signing timestamp (PAdES B-T) | ✅ | `sign --timestamp <tsa-url>` (+ `--timestamp-digest`, `--timestamp-nonce`); opt-in network, SSRF-guarded |
| PAdES signature profile | ✅ | `sign --profile pades` (ETSI.CAdES.detached, ESS signing-certificate-v2) |
| CMS digest selection | ✅ | `sign --digest sha256\|sha384\|sha512` (RSA; ECDSA is sha256-only) |
| Multiple signatures | ✅ | `sign --allow-multiple` + `--field-name` (default stays idempotent single-signature) |
| Visible signature placement | ✅ | `sign --signature-rect "x1,y1,x2,y2"` + `--signature-page` (+ `--placeholder-bytes`) |
| LTV validation data (PAdES B-LT) | ✅ | `ltv collect\|embed\|add` — OCSP + CRL into `/DSS` + `/VRI`; `collect` needs `--online`, `embed` is fully offline (air-gapped) |
| Document timestamp (PAdES B-LTA) | ✅ | `doc-timestamp --url <tsa>` — `/DocTimeStamp` (ETSI.RFC3161) incremental revision, repeatable for renewal |
| Verify B-LTA / sha384-512 | ✅ | `verify` validates `/DocTimeStamp` revisions as RFC 3161 tokens; accepts `rsa-sha384` / `rsa-sha512`; reports `fieldName` + `isDocTimestamp` |
| Signature inventory | ✅ | `inspect --signatures` (fieldName, subFilter, byteRange, isDocTimestamp, isPlaceholder — never signature bytes) + `--check "signatures>=N"` |
| Metadata editing | ✅ | `metadata --title/--author/--subject/--keywords/--mod-date` or `--from-json` — incremental save, signatures stay valid |
| PDF comparison | ✅ | `compare a.pdf b.pdf --mode text\|structure\|both` — exit 0 identical, exit 1 / `E_CHECK_FAILED` on differences; no visual diff |
| Manifest pipelines | ✅ | `batch --manifest tasks.json` — sequential fail-fast tasks, `@<id>` references, `--allow-network` gate, `--continue-on-error` |
| PDF/A strict gating | ✅ | `render --strict` — conformance diagnostics become `E_CHECK_FAILED` before any output byte (else stderr warnings + `diagnostics[]` under `--json`) |
| Charts v2 | ✅ | 9 types (+ stackedBar, stackedBarH, area, scatter), `series.xValues`, `yAxis: right` + `axis2`, log scale, category/linear/time x-axis, data labels, label stride/rotation |
| Print production | ✅ | `layout.print` (bleed, trimBox, bleedBox, artBox, cropBox, marks, userUnit 1–75000), `layout.outputIntent` (ICC RGB), `layout.viewerPreferences` (duplex, pickTrayByPDFSize, printPageRange, numCopies) |
| Image blocks by path | ✅ | `{ "type": "image", "src": "logo.png" }` (relative to the input JSON) or `dataBase64` |
| Encrypted annotate | ✅ | `annotate --password` — appended objects re-encrypted under the existing scheme |
| Page-box preservation | ✅ | `merge` / `split` / `extract` now preserve BleedBox/TrimBox/ArtBox/UserUnit (pdfnative 1.7.0; previously dropped) |
| Anti zip-bomb cap | ✅ | Global `--max-inflate-size <bytes>` — cap on any decompressed stream while parsing (default 100 MiB) |
| Network error code | ✅ | Stable `E_NETWORK` — opt-in network operation failed (TSA / OCSP / CRL fetch) |

**Note:** everything listed works today. Planned work is tracked in [ROADMAP.md](ROADMAP.md).

### PDF/A status (v1.4.0)

The CLI's PDF/A outputs are **validated against the [veraPDF](https://verapdf.org)
reference validator in CI (blocking)**: a 12-file corpus produced by the CLI itself
(renders across all four levels plus attachments, headers/footers, outline, watermark,
an incremental PAdES signature and a `metadata` update) is checked against the profile
each file claims in XMP, and it includes **negative canaries** that veraPDF must
reject — so a validator that accepts everything fails the run instead of turning it
green. The conformance recipe is `--tagged pdfa<level> --font latin --lang latin`
(fonts must be embedded per ISO 19005; the sRGB OutputIntent is emitted automatically
by the engine). Run the same gate locally with `npm run validate:pdfa` — without
veraPDF installed it prints install hints and exits 0 as a **skip, not a pass**. See
[CONTRIBUTING.md](CONTRIBUTING.md#pdfa-validation-verapdf) for details. Not a
certification — validation evidence against a specific veraPDF version (1.30.2).

## Installation

```bash
npm install --global pdfnative-cli
```

Or run without installing:

```bash
npx pdfnative-cli render --input doc.json --output report.pdf
```

**Requirements:** Node.js ≥ 22 (Node 20 reached end-of-life 2026-04-30; CI runs 22/24) | Bun | Deno (`node dist/cli.cjs`)

## Documentation

- 📘 **[Quick Start](#quick-start)** (below) — Get rendering in 5 minutes
- 🏛️ **[KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)** — Full CLI reference, architecture, integration patterns
- 📚 **[samples/README.md](samples/README.md)** — runnable samples organized by feature
- 🔧 **[pdfnative library](https://github.com/Nizoka/pdfnative)** — Underlying PDF engine docs
- ❓ **[FAQ](docs/KNOWLEDGE_BASE.md#12-frequently-asked-questions)** — Common questions & troubleshooting

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

# PDF/A conformance (embed the bundled Latin font — ISO 19005 requires embedded
# fonts; this recipe is what the blocking veraPDF CI gate validates)
pdfnative render --input document.json --output archived.pdf \
  --tagged pdfa2b --font latin --lang latin
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
    "creationDate": "D:20260427120000+00'00'"
  }
}
```

### Merge, split & extract pages (v1.2.0)

```bash
# Concatenate several PDFs (sources as positional args or repeated --input)
pdfnative merge a.pdf b.pdf c.pdf --output combined.pdf

# Split one PDF into one file per page
pdfnative split --input report.pdf --output-dir pages/ --prefix page

# Split into ranges — one output per comma-separated segment
pdfnative split --input report.pdf --output-dir out/ --pages "1-2,3-4"

# Extract selected pages (1-based; order preserved, repeats allowed)
pdfnative extract --input report.pdf --output cover.pdf --pages "4,1-2"
```

### Extract text, fill forms & encrypt (v1.3.0)

```bash
# Extract reading-order text as NDJSON (one object per page — ideal for RAG/agents)
pdfnative extract-text --input report.pdf --format ndjson > pages.ndjson

# Export a form's current values, edit, then fill (read → edit → fill)
pdfnative fill --input form.pdf --export > values.json
pdfnative fill --input form.pdf --data values.json --output filled.pdf
pdfnative fill --input filled.pdf --flatten --output flat.pdf

# Preflight the environment (agents: gate `encrypt` on this)
pdfnative doctor --format json

# Encrypt with AES-256, confirm the scheme, then decrypt
pdfnative encrypt --input report.pdf --output secure.pdf \
  --owner-password "$OWNER" --user-password "$USER" --algorithm aes-256
pdfnative inspect --input secure.pdf --encryption --password "$USER"
pdfnative decrypt --input secure.pdf --output plain.pdf --password "$USER"

# Render native vector charts from a document with a `chart` block
pdfnative render --input dashboard.json --output dashboard.pdf
```

### Long-term signatures, compare & metadata (v1.4.0)

The canonical **PAdES ladder** — each rung is one command, network access is always
an explicit opt-in (`--timestamp` / `--online` / `--url`), SSRF-guarded, no redirects:

```bash
# B-T  — sign with a PAdES profile and an RFC 3161 trusted timestamp
pdfnative sign --input doc.pdf --output signed.pdf \
  --profile pades --timestamp https://tsa.example.com/tsr

# B-LT — archive the OCSP/CRL validation data into /DSS + /VRI
pdfnative ltv add --input signed.pdf --output lt.pdf --online

# B-LTA — append a document timestamp covering every byte (repeat to renew)
pdfnative doc-timestamp --input lt.pdf --output lta.pdf --url https://tsa.example.com/tsr
pdfnative ltv add --input lta.pdf --output archived.pdf --online

# Air-gapped variant: collect on a connected machine, embed fully offline
pdfnative ltv collect --input signed.pdf --output ltv.json --online
pdfnative ltv embed   --input signed.pdf --data ltv.json --output lt.pdf
```

```bash
# Diff two PDFs by text + structure (exit 0 identical, exit 1 on differences)
pdfnative compare original.pdf revised.pdf --mode both --format json

# Update /Info + XMP metadata without breaking existing signatures (incremental save)
pdfnative metadata --input signed.pdf --output retitled.pdf \
  --title "Q3 Report (final)" --author "Finance Team"

# Verify the whole ladder — /DocTimeStamp revisions are validated as RFC 3161 tokens
pdfnative verify --input archived.pdf --strict
pdfnative inspect --input archived.pdf --signatures --check "signatures>=1"
```

### Annotate a PDF (v1.2.0)

```bash
# Attach markup annotations from a JSON spec (incremental save — signatures stay intact)
pdfnative annotate --input report.pdf --output annotated.pdf \
  --annotations notes.json

# List them back out
pdfnative inspect --input annotated.pdf --annotations --format text
```

`notes.json` is a JSON array (or `{ "annotations": [...] }`), each entry a markup annotation
plus a 1-based `page`:

```json
{
  "annotations": [
    { "page": 1, "type": "highlight", "rect": [72, 700, 320, 715], "color": "#FFD400", "contents": "Check this figure." },
    { "page": 1, "type": "text", "rect": [330, 700, 350, 720], "icon": "Comment", "contents": "Needs a citation." }
  ]
}
```

### Render bookmarks & introspect layout (v1.2.0)

```bash
# Add a bookmark tree derived from the document's headings
pdfnative render --input doc.json --output book.pdf --outline auto

# …or supply an explicit OutlineItem[] tree
pdfnative render --input doc.json --output book.pdf --outline outline.json

# Register the bundled math font so ∑ ∫ √ π render as real glyphs
pdfnative render --input math.json --output math.pdf --font latin --font math

# Emit a LayoutInspection JSON report instead of a PDF
pdfnative render --input doc.json --output layout.json --inspect-layout

# Render a PDF with debug guides overlaid
pdfnative render --input doc.json --output debug.pdf --debug-layout margins,content,cells
```

### AI-governance / Human-in-the-Loop (v1.2.0)

Agents act as **draftsmen**: they may draft an issue/PR locally, but a **human** must review
and submit it. Nothing here touches the network.

```bash
# Print the human/agent protocol and the machine-readable policy
pdfnative govern rules
pdfnative govern policy --pretty

# Gate a locally-authored draft (exit 1 / E_POLICY on a violation)
pdfnative govern verify-issue ./draft.md
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
| [`render/watermark/`](samples/render/watermark/) | 3 files | Draft watermark, confidential watermark, CLI-flag styling |
| [`render/layout/`](samples/render/layout/) | 3 files | US Letter, A5 portrait, A4 landscape |
| [`render/pdfa/`](samples/render/pdfa/) | 4 files | PDF/A-1b, PDF/A-2b, PDF/A-2u, PDF/A-3b archival conformance |
| [`render/outline/`](samples/render/outline/) | scripts | PDF bookmarks — `--outline auto` + explicit tree |
| [`render/math/`](samples/render/math/) | scripts | Math/technical symbols via `--font math` |
| [`render/inspect-layout/`](samples/render/inspect-layout/) | scripts | `--inspect-layout` report + `--debug-layout` guides |
| [`render/chart/`](samples/render/chart/) | 5 files | Native vector charts — bar/line/pie/donut plus (v1.4.0) stacked bars, area/scatter, dual axes, log & time axes |
| [`render/print/`](samples/render/print/) | 2 files | (v1.4.0) Print production — bleed/trim boxes + printer's marks, and viewer preferences (duplex, copies, …) |
| [`merge/`](samples/merge/) | scripts | Concatenate PDFs (page-tree) |
| [`split/`](samples/split/) | scripts | Split one PDF per-page or per-range |
| [`extract/`](samples/extract/) | scripts | Pull selected pages into a new PDF |
| [`extract-text/`](samples/extract-text/) | scripts | Reading-order text (text / json / ndjson) |
| [`fill/`](samples/fill/) | scripts | Fill, flatten & export AcroForms |
| [`encrypt/`](samples/encrypt/) | scripts | Encrypt / decrypt round-trip (AES-256, `--stream`) |
| [`doctor/`](samples/doctor/) | scripts | Environment / capability preflight |
| [`metadata/`](samples/metadata/) | scripts | Update /Info + XMP metadata (incremental save) |
| [`compare/`](samples/compare/) | scripts | Diff two PDFs by text + structure |
| [`annotate/`](samples/annotate/) | scripts | Attach markup annotations (incremental save) |
| [`govern/`](samples/govern/) | scripts | AI-governance / HITL: rules, policy, verify-issue |
| [`sign/`](samples/sign/) | 9 script pairs | Digital signature incl. timestamp (B-T), LTV ladder, multi-signatures, native vs pure-JS crypto (Bash + PowerShell) |
| [`inspect/`](samples/inspect/) | 8 script pairs | JSON & text inspection incl. `--annotations` and `--signatures` (Bash + PowerShell) |
| [`streaming/`](samples/streaming/) | 3 scripts | Streaming render (single-pass, page-by-page, true constant-memory) |

**Render all samples at once:**

```bash
node samples/run-all.js
```

See [`samples/README.md`](samples/README.md) for full descriptions, block type reference, and integration patterns (GitHub Actions, Docker, TypeScript).

---

## Command Reference

The 21 commands are grouped by purpose (the global `pdfnative --help` shows the same grouping):

| Group | Commands |
|-------|----------|
| **Create & edit** | [`render`](#pdfnative-render), [`fill`](#pdfnative-fill), [`annotate`](#pdfnative-annotate), [`metadata`](#pdfnative-metadata) |
| **Page tree** | [`merge`](#pdfnative-merge), [`split`](#pdfnative-split), [`extract`](#pdfnative-extract) |
| **Security** | [`sign`](#pdfnative-sign), [`verify`](#pdfnative-verify), [`ltv`](#pdfnative-ltv), [`doc-timestamp`](#pdfnative-doc-timestamp), [`encrypt`](#pdfnative-encrypt), [`decrypt`](#pdfnative-decrypt) |
| **Read & extract** | [`inspect`](#pdfnative-inspect), [`extract-text`](#pdfnative-extract-text), [`compare`](#pdfnative-compare) |
| **Automation & meta** | [`batch`](#pdfnative-batch), [`doctor`](#pdfnative-doctor), [`schema`](#pdfnative-schema), [`completion`](#pdfnative-completion), [`govern`](#pdfnative-govern) |

### `pdfnative render`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to a JSON file (`DocumentParams` or `PdfParams` if `--variant table`) |
| `--output <file>` | stdout | Output PDF path |
| `--stream` | false | Single-pass streaming output (`AsyncGenerator`); no TOC, no `{pages}` |
| `--stream-page-by-page` | false | Stream at PDF object boundaries (TOC- and `{pages}`-compatible) |
| `--stream-true` | false | True constant-memory streaming; parts freed as emitted; byte-identical; no TOC, no `{pages}` |
| `--chunk-size <bytes>` | `65536` | Chunk size for `--stream` / `--stream-true` (not `--stream-page-by-page`) |
| `--variant <kind>` | `document` | `document` (default) or `table` (selects `buildPDFBytes`) |
| `--layout <file.json>` | — | Load a `Partial<PdfLayoutOptions>` (CLI flags override) |
| `--page-size <size>` | from layout file or pdfnative default | Named (`a4`, `letter`, `legal`, `a3`, `tabloid`, `a5`) or `WxH` in points |
| `--margin <N>` or `--margin <t,r,b,l>` | from layout / default | Page margins in points |
| `--compress` | false | Enable FlateDecode compression |
| `--max-blocks <n>` | `100000` | Maximum document blocks before pdfnative aborts (large-report guard) |
| `--tagged <level>` | none | PDF/A: `none`, `pdfa1b`, `pdfa2b`, `pdfa2u`, `pdfa3b` |
| `--strict` | false | Escalate PDF/A conformance diagnostics (`PDFA_NO_FONT_ENTRIES`, `PDFA_UNEMBEDDED_FORM_FONT`, `PDFA_DEVICE_CMYK_IMAGE`) into an error (exit 1, `E_CHECK_FAILED`) **before** any output byte; without it they are stderr warnings + a `diagnostics[]` array in the `--json` envelope |
| `--conformance <1b\|2b\|3b>` | — | **Deprecated** — use `--tagged pdfa<level>` |
| `--watermark-text <s>` / `--watermark-image <path>` | — | Text or image watermark |
| `--watermark-opacity <0-1>` / `--watermark-angle <deg>` / `--watermark-color <#hex>` / `--watermark-font-size <pt>` / `--watermark-position background\|foreground` | — | Watermark styling |
| `--watermark-position background\|foreground` | `background` | Render order |
| `--header-{left,center,right} <tpl>` | — | Header template; placeholders `{page}`, `{pages}`, `{date}`, `{title}` |
| `--footer-{left,center,right} <tpl>` | — | Footer template; same placeholders |
| `--encrypt [aes-128\|aes-256]` | — | Enable encryption (bare = aes-128). Same vocabulary as merge/split/extract |
| `--owner-password <s>` | `$PDFNATIVE_ENCRYPT_OWNER_PASS` | Owner password (required to encrypt) |
| `--user-password <s>` | `$PDFNATIVE_ENCRYPT_USER_PASS` | Optional user (open) password |
| `--permissions <list>` | _all denied_ | Comma list: `print,copy,modify,extract` |
| _(legacy aliases)_ | — | `--encrypt-algorithm`, `--encrypt-owner-pass`, `--encrypt-user-pass`, `--encrypt-permissions` still work |
| `--attachment <path>[:mime[:rel[:desc]]]` _(repeatable)_ | — | PDF/A-3 file attachment |
| `--lang <code,code>` | — | Activate registered font loaders for non-Latin scripts (`th`, `ja`, `ar`, `te`, `si`, `km`, …); Latin is built-in |
| `--font <name>` _(repeatable)_ | — | Register a bundled font shortcut. Allow-list: `latin`, `emoji`, `color-emoji`, `math`, and the 22 script codes `ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`. The name doubles as the `--lang` code. |
| `--outline auto\|<file.json>` | — | Add a PDF bookmark tree: `auto` derives it from headings; a path loads an explicit `OutlineItem[]` tree |
| `--inspect-layout` | false | Emit a `LayoutInspection` JSON report instead of a PDF (document variant only) |
| `--debug-layout [margins,content,cells]` | — | Overlay layout debug guides on the rendered PDF (bare flag = all) |

**Document & layout JSON (v1.4.0, pdfnative 1.7.0)** — no new flags, richer JSON:
image blocks accept `src` (a path resolved relative to the `--input` JSON's directory)
as an alternative to `dataBase64`; `chart` blocks grow to **9 types** (`bar`, `barH`,
`stackedBar`, `stackedBarH`, `line`, `area`, `scatter`, `pie`, `donut`) with
`series[].xValues`, `series[].yAxis: "right"` + `axis2`, `axis.scale: "log"`,
`xAxis: category|linear|time`, `dataLabels`, `labelStride`, and `labelRotation`; the
`--layout` file gains `print` (bleed, `trimBox`, `bleedBox`, `artBox`, `cropBox`,
printer `marks`, `userUnit` 1–75000), `outputIntent` (ICC RGB) and `viewerPreferences`
(`duplex`, `pickTrayByPDFSize`, `printPageRange`, `numCopies`); `params.metadata`
accepts `author`/`subject`/`keywords`/`trapped`. Validate with `pdfnative schema render`.

See `samples/render/` for a working example of every category.

### `pdfnative sign`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to the input PDF |
| `--output <file>` | stdout | Output signed PDF path |
| `--key <file>` | `$PDFNATIVE_SIGN_KEY` | Path to PEM private key (env var takes precedence) |
| `--cert <file>` | `$PDFNATIVE_SIGN_CERT` | Path to PEM certificate (env var takes precedence) |
| `--cert-chain <file>` _(repeatable)_ | `$PDFNATIVE_SIGN_CHAIN` | Intermediate CA PEMs |
| `--algorithm rsa-sha256\|ecdsa-sha256` | `rsa-sha256` | Signature algorithm (RSA or P-256 ECDSA) |
| `--digest sha256\|sha384\|sha512` | `sha256` | CMS digest algorithm (RSA only; `ecdsa-sha256` is sha256-only) |
| `--profile pkcs7\|pades` | `pkcs7` | `pades` = ETSI.CAdES.detached (PAdES B-B: ESS signing-certificate-v2, omits signing-time) |
| `--reason <s>` | — | Reason for signing (PDF metadata) |
| `--name <s>` | — | Signer name (PDF metadata) |
| `--location <s>` | — | Signing location (PDF metadata) |
| `--contact <s>` | — | Signer contact (PDF metadata) |
| `--signing-time <ISO 8601>` | now | Explicit signing timestamp |
| `--timestamp <tsa-url>` | — | Embed a verified **RFC 3161** timestamp token at signing time (PAdES B-T with `--profile pades`). **Opt-in network**, SSRF-guarded. TSA failure → `E_NETWORK`; malformed response → `E_PARSE`; never a silent fallback |
| `--timestamp-digest sha256\|sha384\|sha512` | `sha256` | Digest for the TSA message imprint |
| `--timestamp-nonce <hex>` | random 8 bytes | Explicit TSA request nonce |
| `--allow-multiple` | false | Allow signing an already-signed PDF (appends a signature field); default stays idempotent single-signature (1.x behaviour) |
| `--field-name <name>` | auto | Signature form-field name |
| `--signature-rect "x1,y1,x2,y2"` | invisible | Visible signature widget rectangle (PDF points) |
| `--signature-page <n>` | `1` | 1-based page for the signature widget |
| `--placeholder-bytes <n>` | auto | Explicit `/Contents` placeholder size (overrides the estimate) |
| `--pure-crypto` | false | Force pdfnative's pure-JS RSA/ECDSA math instead of the default native `node:crypto` (constant-time) provider |

Without `--timestamp` the command performs **no network I/O**, and `--dry-run` never
touches the network even when `--timestamp` is present. Under `--json`, a timestamped
signature adds `timestamp: { url, digest }` to the success envelope.

### `pdfnative inspect`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to the PDF to inspect |
| `--output <file>` | stdout | Output report path |
| `--format json\|text` | `json` | Output format |
| `--verbose` | false | Add trailer keys, catalog keys, object count, XMP |
| `--pages` | false | Add per-page metadata array (width/height/rotation + `cropBox`/`trimBox`/`bleedBox`/`artBox`/`userUnit` when present) |
| `--annotations` | false | List markup + link annotations per page (page labels are reported automatically when present) |
| `--form-fields` | false | List AcroForm fields (name, type, value, required/read-only, options) |
| `--encryption` | false | Report the encryption scheme (`algorithm`, `revision`, `authenticatedAs`), or `null` |
| `--signatures` | false | Signature-field inventory: `fieldName`, `subFilter`, `byteRange`, `isDocTimestamp`, `isPlaceholder`, `sigObjNum`, `contentsLength` — never the signature bytes |
| `--password <s>` | — | Password for an encrypted PDF (env: `PDFNATIVE_PASSWORD`) |
| `--pdfua` | false | Add a PDF/UA (ISO 14289-1) structural validation report (`valid` + `errors` + `warnings`) |
| `--check pdfa\|signed\|encrypted\|pdfua\|"signatures>=N"` _(repeatable)_ | — | CI-friendly assertion; AND semantics; sets exit code (0 = pass, 1 = fail). `signatures>=N` counts real signatures (placeholders and `/DocTimeStamp` fields excluded) |

v1.4.0 also fixes the top-level `signatures` and `formFields` counters, which previously
always reported `0`, and reports `metadata.trapped` when present.

### `pdfnative verify`

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Path to the (possibly signed) PDF |
| `--format json\|text` | `json` | Output format |
| `--strict` | false | Exit 1 on any failure or zero signatures (CI-friendly) |
| `--trust <root.pem>` _(repeatable)_ | _self-signed only_ | Trusted root certificates (PEM) |
| `--revocation offline\|online\|disabled` | `offline` | Revocation source: embedded `/DSS` only, also fetch online (SSRF-guarded), or skip |
| `--revocation-policy soft-fail\|strict` | `soft-fail` | `strict` fails the signature on any non-`good` status; `soft-fail` only fails on explicit `revoked` |

**Scope:** byte-range integrity (SHA-256), full CMS signature value
(RSA-PKCS#1 v1.5 — SHA-256/384/512, reported as `rsa-sha256`/`rsa-sha384`/`rsa-sha512` —
plus ECDSA-SHA256 over P-256), certificate chain + trust, **RFC 3161 timestamp validation
(PAdES-T)**, and **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded from the PDF
`/DSS` offline by default, with opt-in online fetching through an SSRF-guarded HTTP client.
v1.4.0 additions: each signature also reports its `fieldName` and `isDocTimestamp`, and
**`/DocTimeStamp` revisions (PAdES B-LTA)** are validated as RFC 3161 timestamp tokens.
Sign-side LTV lives in [`sign --timestamp`](#pdfnative-sign), [`ltv`](#pdfnative-ltv) and
[`doc-timestamp`](#pdfnative-doc-timestamp).

### `pdfnative ltv`

PAdES **B-LT**: archive the certificates, OCSP responses and CRLs needed to validate the
document's signatures long after certificates expire, into the PDF's `/DSS` + `/VRI`
dictionaries (incremental save — existing signatures stay valid).

```bash
pdfnative ltv collect --input signed.pdf --online [--output ltv.json]  # fetch → replayable JSON
pdfnative ltv embed   --input signed.pdf --data ltv.json [--output out.pdf]  # 100 % offline
pdfnative ltv add     --input signed.pdf --online [--output out.pdf]   # collect + embed
```

`collect` **requires `--online`** (explicit network opt-in, SSRF-guarded, no redirects)
and emits a replayable JSON file (schema subject: `ltv-data`). `embed` **never** performs
network I/O — the collect/embed split supports air-gapped pipelines: collect on a
connected machine, embed offline. `add` does both in one pass.

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Signed source PDF |
| `--output <file>` | stdout | Output: JSON (`collect`) or PDF (`embed` / `add`) |
| `--online` | — **(required for `collect` / `add`)** | Explicit opt-in for network fetches (SSRF-guarded, no redirects) |
| `--prefer ocsp\|crl` | `ocsp` | Preferred revocation source |
| `--extra-cert <pem>` _(repeatable)_ | — | Extra chain certificates (PEM) |
| `--data <file>` | — **(required for `embed`)** | Previously collected `ltv-data` JSON |
| `--timeout <ms>` | `10000` | Network timeout |
| `--dry-run` | false | Validate inputs; no output, no network |

**The canonical PAdES ladder:**

```text
sign --timestamp <tsa> --profile pades   →  B-T
ltv add --online                         →  B-LT
doc-timestamp --url <tsa>                →  B-LTA
ltv add --online                         →  LTV for the doc-timestamp itself
```

### `pdfnative doc-timestamp`

PAdES **B-LTA**: append a `/DocTimeStamp` signature field (SubFilter `/ETSI.RFC3161`,
ISO 32000-2 §12.8.5) covering every byte of the document, as an incremental revision —
earlier revisions stay **byte-identical**. Repeat periodically to renew LTA protection.

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Signed source PDF |
| `--output <file>` | stdout | Output PDF |
| `--url <tsa-url>` | — **(required)** | RFC 3161 TSA URL (explicit network opt-in; SSRF-guarded, no redirects) |
| `--digest sha256\|sha384\|sha512` | `sha256` | Timestamp message-imprint digest |
| `--field-name <name>` | `DocTimeStamp1` | Timestamp field name (auto-suffixed on collision) |
| `--placeholder-bytes <n>` | `12288` | `/Contents` placeholder size |
| `--nonce <hex>` | random | Explicit TSA request nonce |
| `--timeout <ms>` | `10000` | Network timeout |
| `--dry-run` | false | Validate inputs; no output, no network |

TSA failures map to `E_NETWORK`; a malformed TSA response maps to `E_PARSE`.
`verify` validates `/DocTimeStamp` revisions as RFC 3161 tokens (`isDocTimestamp: true`).

### `pdfnative batch`

Two modes: **directory mode** (render every `*.json` in a directory, in parallel) and
**manifest mode** (v1.4.0 — run a declarative multi-command pipeline). The modes are
mutually exclusive.

**Directory mode:**

| Flag | Default | Description |
|------|---------|-------------|
| `--input-dir <dir>` | _required_ | Directory of `*.json` document definitions |
| `--output-dir <dir>` | _required_ | Output directory for the rendered `*.pdf` (created if absent) |
| `--concurrency <n>` | `4` | Maximum parallel renders |
| `--fail-fast` | false | Stop at the first failure (default: render all, then report) |
| `--format json\|text` | `text` | Summary format |

All other flags are forwarded to each `render`. Exit code 1 if any file fails.

**Manifest mode (v1.4.0):**

| Flag | Default | Description |
|------|---------|-------------|
| `--manifest <tasks.json>` | — | Declarative pipeline (schema subject: `batch-manifest`): `{ "version": 1, "tasks": [ { "id", "command", "flags" } ] }` |
| `--allow-network` | false | **Required** for any network flag inside the manifest (`--timestamp`, `--url`, `--online`, `--revocation online`) — an untrusted manifest can never trigger network I/O on its own |
| `--continue-on-error` | false | Keep running after a failure; tasks depending (via `@`) on a failed task are skipped |
| `--format json\|text` | `text` | Summary format |
| `--dry-run` | false | Validate the manifest / inputs without executing |

Tasks run **sequentially, fail-fast** by default. A flag value `"@<id>"` references the
output of an **earlier** task; relative paths resolve against the manifest's directory.
14 commands are allowed inside a manifest — `render`, `sign`, `verify`, `inspect`,
`merge`, `split`, `extract`, `extract-text`, `fill`, `encrypt`, `decrypt`, `annotate`,
`metadata`, `doc-timestamp` (`ltv` and `compare` need positional arguments and are not
yet manifest-callable) — never `govern`, `schema`, `completion`, `doctor`, or `batch`
itself. Under `--json` the summary envelope adds `mode: "manifest"`, `skipped`, and a
per-task `tasks[]` array. Exit code 1 if any task fails.

A manifest has the filesystem access of the user who invokes `batch` — the same trust
level as command-line flags; only network access is additionally gated behind
`--allow-network`. The manifest file is size-capped (50 MB) and bounded to 1 000 tasks,
and path values undergo the same anti-traversal check as direct CLI flags.

### `pdfnative merge`

Concatenate several PDFs into one (pdfnative 1.5.0 page-tree API).

| Flag | Default | Description |
|------|---------|-------------|
| _positional paths_ | — | Source PDFs, in order (2–50). May be combined with `--input` |
| `--input <file>` _(repeatable)_ | — | Additional source PDF (appended after positionals) |
| `--output <file>` | stdout | Output combined PDF |
| `--drop-annotations` | false | Strip annotations from the merged output |
| `--max-output-size <bytes>` | 256 MiB | Fail if the merged PDF would exceed this size (`0`/`none` = unlimited) |
| `--password <s>` | — | Password for encrypted source PDFs (env: `PDFNATIVE_PASSWORD`) |
| `--encrypt [aes-128\|aes-256]` | — | Re-encrypt the output (bare = aes-128); needs `--owner-password` |
| `--owner-password` / `--user-password` | — | Passwords for `--encrypt` (env: `PDFNATIVE_ENCRYPT_OWNER_PASS` / `_USER_PASS`) |
| `--permissions <list>` | — | `print,copy,modify,extract` for `--encrypt` |
| `--stream` | false | Constant-memory streaming output (`--chunk-size <bytes>`) |

> **Multiple encrypted sources:** a single `--password` is applied to **every** source.
> Merging encrypted sources that use **different** passwords is not supported and fails with
> `E_PASSWORD`. Decrypt the outliers first (`pdfnative decrypt`), then merge.

The same `--password` / `--encrypt` / `--owner-password` / `--user-password` / `--permissions`
/ `--stream` flags apply to `split` and `extract` (which take a single input, so their
`--password` is unambiguous).

### `pdfnative split`

Split one PDF into several (pdfnative 1.5.0 page-tree API).

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--output-dir <dir>` | — **(required)** | Directory for the output parts (created if absent) |
| `--pages <ranges>` | _one per page_ | 1-based ranges; each comma-separated segment (e.g. `1-2,3-4`) becomes one output |
| `--prefix <name>` | input stem or `part` | Filename prefix; outputs are `<prefix>-<n>.pdf` (zero-padded) |
| `--drop-annotations` | false | Strip annotations from each part |
| `--max-output-size <bytes>` | 256 MiB | Per-part size cap (`0`/`none` = unlimited) |

### `pdfnative extract`

Pull selected pages into a new PDF (pdfnative 1.5.0 page-tree API).

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--output <file>` | stdout | Output PDF |
| `--pages <list>` | — **(required)** | 1-based page list/range (e.g. `4,1-2`); order preserved, repeats allowed |
| `--drop-annotations` | false | Strip annotations from the output |
| `--max-output-size <bytes>` | 256 MiB | Output size cap (`0`/`none` = unlimited) |

_(also supports `--password` / `--encrypt` / `--stream` — see `merge` above.)_

### `pdfnative extract-text`

Extract reading-order Unicode text (pdfnative 1.6.0 `extractText`). No OCR — image-only pages yield empty text.

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--format text\|json\|ndjson` | `text` | Plain text (form-feed between pages), a JSON array, or NDJSON (one object per page) |
| `--pages <list>` | _all_ | 1-based selector to limit pages |
| `--runs` | false | Include positioned runs `{ text, x, y, fontSize, fontName }` |
| `--password <s>` | — | Password for an encrypted PDF (env: `PDFNATIVE_PASSWORD`) |
| `--max-length <n>` | `16000000` | Hard cap on total characters (`0`/`none` disables) |
| `--summary` / `--fields` / `--pretty` | — | Token-economy controls (json format) |

### `pdfnative compare`

Diff two PDFs by extracted reading-order **text** and/or document **structure** — page
count, page/print boxes, metadata, form fields, annotations, encryption, signatures
(v1.4.0). Built for CI and agents: **identical documents exit 0**; any difference exits
**1** with the stable code `E_CHECK_FAILED` (the report is written to stdout first).
Visual/rasterised diffing is out of scope — pdfnative has no rasteriser.

```bash
pdfnative compare a.pdf b.pdf --mode both --format json
```

| Flag | Default | Description |
|------|---------|-------------|
| _positional paths_ | — **(required)** | The two PDFs to compare, `a.pdf b.pdf` |
| `--mode text\|structure\|both` | `both` | What to compare |
| `--format text\|json` | `text` | Report format (stdout) |
| `--tolerance <pt>` | `0` | Geometric tolerance in points for page/box sizes |
| `--ignore-whitespace` | false | Collapse runs of whitespace before the text diff |
| `--pages <list>` | _all_ | 1-based selector limiting the text diff (e.g. `1,3-5`) |
| `--password-a <s>` | — | Password for the first PDF |
| `--password-b <s>` | — | Password for the second PDF |
| `--pretty` | — | Force indented JSON even under `--json` |

### `pdfnative fill`

Fill, flatten, and/or export an existing AcroForm using an incremental save (existing signatures stay valid for their revision). Discover field names with `inspect --form-fields`, or dump the current values with `--export` for a read → edit → fill round-trip.

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source form PDF |
| `--output <file>` | stdout | Filled PDF / exported values |
| `--data <file>` | — | JSON object `name → string\|boolean\|string[]` (or `{ "values": {…} }`) |
| `--flatten` | false | Also flatten (or flatten existing values when `--data` is omitted) |
| `--export` | false | Read-only: emit current values as a `--data`-shaped JSON map (unset choice fields omitted); ignores `--data`/`--flatten` |
| `--force` | false | Flatten even if a signed signature field is present |
| `--on-unknown throw\|ignore` | `throw` | Behaviour for value keys that match no field |
| `--need-appearances` | false | Allow non-WinAnsi values by setting `/NeedAppearances` |
| `--password <s>` | — | Password for an encrypted PDF (env: `PDFNATIVE_PASSWORD`) |

### `pdfnative encrypt`

Re-secure a PDF with AES-128/256 (page-tree re-encryption). Rebuilds the page tree like `merge`, so signatures and form fields are dropped. Requires a Web Crypto CSPRNG; RC4 is never emitted.

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--output <file>` | stdout | Encrypted PDF |
| `--owner-password <s>` | — **(required)** | Owner password (env: `PDFNATIVE_ENCRYPT_OWNER_PASS`) |
| `--user-password <s>` | — | User (open) password (env: `PDFNATIVE_ENCRYPT_USER_PASS`) |
| `--algorithm aes-128\|aes-256` | `aes-128` | Encryption algorithm |
| `--permissions <list>` | _defaults_ | `print,copy,modify,extract` |
| `--password <s>` | — | Open an already-encrypted source (password rotation) |
| `--stream` | false | Constant-memory streaming output (`--chunk-size <bytes>`) |

### `pdfnative decrypt`

Remove encryption, emitting a plaintext copy. Rebuilds the page tree like `merge` (signatures/forms dropped).

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Encrypted source PDF |
| `--output <file>` | stdout | Decrypted PDF |
| `--password <s>` | — | Document password (env: `PDFNATIVE_PASSWORD`) |
| `--stream` | false | Constant-memory streaming output (`--chunk-size <bytes>`) |

### `pdfnative doctor`

Environment / capability preflight — for humans (onboarding) and agents (pre-flight before `encrypt`). Fully offline. Exit code 0 when all checks pass, 1 otherwise.

| Flag | Default | Description |
|------|---------|-------------|
| `--format json\|text` | `text` | Output format (global `--json` also selects JSON) |
| `--pretty` | — | Force indented JSON even under `--json` |

Checks: CLI version, Node version (≥ 22), Web Crypto (CSPRNG) availability, resolved `pdfnative` version, registered command count.

### `pdfnative annotate`

Attach markup annotations to an existing PDF using an incremental save (the original
bytes — and any existing signature — are preserved).

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--output <file>` | stdout | Annotated PDF |
| `--annotations <file>` | — **(required)** | JSON array (or `{ "annotations": [...] }`); each entry is a markup annotation plus a 1-based `page` |
| `--password <s>` | — | Password for an encrypted PDF (env: `PDFNATIVE_PASSWORD`) — appended objects are re-encrypted under the existing scheme (v1.4.0) |

Annotation types: `text`, `highlight`, `underline`, `strikeout`, `squiggly`, `square`,
`circle`, `line`, `freetext`. Every entry needs a `page` and a `rect` `[x1,y1,x2,y2]`;
`line` also needs `start` and `end`. Only known fields are forwarded — unknown keys are
dropped, so nothing can leak into the emitted dictionary.

### `pdfnative metadata`

Update `/Info` + XMP metadata (v1.4.0). The update is an **incremental save**: the
original bytes are preserved as a prefix, so **existing digital signatures remain valid**
for their revision. The XMP packet is kept in sync (`xmp:ModifyDate`, `pdf:Keywords`, …).
Reading metadata stays in [`inspect`](#pdfnative-inspect).

| Flag | Default | Description |
|------|---------|-------------|
| `--input <file>` | stdin | Source PDF |
| `--output <file>` | stdout | Updated PDF |
| `--title <s>` | — | Document title |
| `--author <s>` | — | Author |
| `--subject <s>` | — | Subject |
| `--keywords <s>` | — | Keywords (single string) |
| `--mod-date <ISO 8601>` | now | Modification date (pass a fixed value for reproducible output) |
| `--from-json <file>` | — | JSON file `{ title?, author?, subject?, keywords?, modDate? }` — mutually exclusive with the per-field flags |
| `--password <s>` | — | Password for an encrypted PDF (env: `PDFNATIVE_PASSWORD`) |
| `--dry-run` | false | Validate inputs without writing output |

At least one metadata field is required.

### `pdfnative govern`

Expose pdfnative's AI-governance / Human-in-the-Loop (HITL) contract. Agents act as
**draftsmen**: a human must always review and submit.

```bash
pdfnative govern rules                 # human/agent protocol (AGENT_RULES) on stdout
pdfnative govern policy                # machine-readable policy JSON on stdout
pdfnative govern verify-issue draft.md # validate a draft; exit 1 / E_POLICY on violation
```

`verify-issue` fails a draft that proposes an external runtime dependency or omits a
reproduction code block; missing recommended fields (environment, expected behaviour) are
surfaced as warnings. Add `--json` for a machine-readable `{ ok, errors, warnings }`
report. A passing check is **necessary but not sufficient** — the human review gate always
applies.

### `pdfnative completion`

```bash
pdfnative completion bash > /etc/bash_completion.d/pdfnative
pdfnative completion zsh  > "${fpath[1]}/_pdfnative"
pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
pdfnative completion powershell >> $PROFILE   # Register-ArgumentCompleter
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
pdfnative schema annotate       # annotate --annotations input
pdfnative schema extract-text   # extract-text --format json output
pdfnative schema fill           # fill --data values input
pdfnative schema form-export    # fill --export output
pdfnative schema govern-verify  # govern verify-issue --json output
pdfnative schema metadata       # metadata --from-json input (v1.4.0)
pdfnative schema ltv-data       # replayable JSON emitted/consumed by ltv collect/embed (v1.4.0)
pdfnative schema compare        # compare --format json output (v1.4.0)
pdfnative schema batch-manifest # batch --manifest pipeline file (v1.4.0)
pdfnative schema status         # the --json success envelope (write commands)
pdfnative schema manifest       # capability manifest: commands, flags, error codes
pdfnative schema doctor         # doctor --format json output
pdfnative schema list       # list the available subjects (19 in v1.4.0)
```

The **manifest** (`schema manifest`) is a machine-readable capability document — every
command, its flags, the global flags, and the stable error codes — for AI-agent tool
discovery. A prose/LLM-facing version ships as [`llms.txt`](llms.txt) at the package root.

### Global options

| Flag | Description |
|------|-------------|
| `--config <file>` | Use a specific `.pdfnativerc.json` (default: nearest upward from cwd) |
| `--no-config` | Ignore any `.pdfnativerc.json` |
| `--quiet`, `-q` | Suppress progress output on stderr |
| `--no-color` | Disable ANSI colour (also respects the `NO_COLOR` env var) |
| `--json` | Agent mode: emit a JSON status/error envelope on stderr (data stays on stdout) |
| `--dry-run` | Validate inputs and exit without writing output (`render` / `sign` / `batch` / `merge` / `split` / `extract` / `annotate` / `fill` / `encrypt` / `decrypt` / `metadata` / `ltv` / `doc-timestamp`). Never performs network I/O, even when a network flag is present |
| `--max-inflate-size <bytes>` | Cap the decompressed size of any single PDF stream while parsing untrusted input (anti zip-bomb; default 100 MiB) — v1.4.0 |
| `--version --json` | Machine-readable version output |

## Driving from AI agents

`pdfnative-cli` is designed so an autonomous agent (or any program) can drive it
deterministically — no MCP server, no daemon, just the process contract:

- **stdout = the artifact** (PDF, JSON report, schema, completion script);
  **stderr = diagnostics.**
- Pass **`--json`** to get a single machine-readable envelope on stderr. On failure:
  `{ "ok": false, "command": "...", "error": { "code": "E_*", "message": "..." } }`.
  On success for the write commands (`render` / `sign` / `batch` / `merge` / `split` /
  `extract` / `annotate` / `fill` / `encrypt` / `decrypt` / `metadata` / `ltv` /
  `doc-timestamp`): a `{ "ok": true, ... }` status line.
- Branch on the **stable error code** (`E_USAGE`, `E_INPUT`, `E_PARSE`, `E_IO`, `E_SIGN`,
  `E_VERIFY_FAILED`, `E_CHECK_FAILED`, `E_POLICY`, `E_UNSUPPORTED`, `E_PASSWORD`,
  `E_NETWORK`, `E_RUNTIME`)
  rather than the message text. Numeric **exit codes** stay `0` (success), `1` (runtime), `2` (usage).
- Use **`--dry-run`** to validate input without producing output.
- Fetch a **`schema`** (or **`schema manifest`** / **`llms.txt`**) to discover and validate
  before calling, and run **`doctor --format json`** as a capability pre-flight.

See [AGENTS.md](AGENTS.md) and the [`samples/agent/`](samples/agent) scripts.

## Security

- **Offline by default** — no network access unless you explicitly opt in with
  `verify --revocation online`, `sign --timestamp <url>`, `ltv collect|add --online`,
  `doc-timestamp --url`, or `batch --allow-network` (which gates network flags inside a
  manifest). Every request passes an **SSRF guard** (scheme allow-list, private/loopback/
  link-local/CGNAT address blocking, no redirects, timeout + size caps). A failed opt-in
  network operation maps to the stable `E_NETWORK` code — never a silent fallback.
- **Anti zip-bomb cap** — the global `--max-inflate-size <bytes>` bounds the decompressed
  size of any single PDF stream while parsing untrusted input (default 100 MiB).
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