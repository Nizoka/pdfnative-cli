# pdfnative-cli — Samples

A comprehensive collection of sample files covering every feature of pdfnative-cli, organized by category. Each category corresponds to a distinct capability of the `pdfnative` library.

> **Generated PDFs are not committed.** All output goes to `samples/output/` which is git-ignored.

---

## Quick Navigation

**New to pdfnative-cli?** Follow this path:
1. ✅ Run a quick sample: `node samples/run-all.js --category document`
2. ✅ View sample JSON: [render/document/01-minimal.json](render/document/01-minimal.json)
3. ✅ Try a different feature: `node samples/run-all.js --category barcode`
4. ✅ Read the docs: [../docs/KNOWLEDGE_BASE.md](../docs/KNOWLEDGE_BASE.md)
5. ✅ Check FAQ: [../docs/KNOWLEDGE_BASE.md#11-frequently-asked-questions](../docs/KNOWLEDGE_BASE.md#11-frequently-asked-questions)

---

## Quick Start

### Run all render samples at once

```bash
# Prerequisites: pdfnative-cli installed globally
npm install -g pdfnative-cli

# From the repo root — renders all JSON samples to samples/output/
node samples/run-all.js
```

Run a single sample:

```bash
pdfnative render \
  --input  samples/render/document/01-minimal.json \
  --output samples/output/document/01-minimal.pdf
```

**Windows (PowerShell):**

```powershell
pdfnative render `
  --input  samples\render\document\01-minimal.json `
  --output samples\output\document\01-minimal.pdf
```

---

## Directory Structure

```
samples/
├── run-all.js                    Cross-platform batch renderer (Node.js ≥ 20)
├── render/                       JSON payloads for pdfnative render
│   ├── document/                 General-purpose documents
│   ├── table/                    Table-heavy layouts
│   ├── barcode/                  QR codes, Code 128, EAN-13
│   ├── form/                     Interactive PDF form fields
│   ├── toc/                      Table of contents
│   ├── link/                     Hyperlinks
│   ├── watermark/                Draft / confidential watermarks
│   ├── layout/                   Custom page sizes and orientations
│   ├── pdfa/                     PDF/A archival conformance
│   ├── encryption/               (v0.2.0) AES-128/256 password protection
│   ├── headers-footers/          (v0.2.0) Page templates with placeholders
│   ├── attachments/              (v0.2.0) PDF/A-3 hybrid invoice (XML attachment)
│   ├── multilang/                (v0.2.0) Real Thai + multilingual PDFs; font loader pattern
│   │   ├── 01-thai.json          (guide) Font loader registration — how to enable Thai
│   │   ├── 02-japanese.json      (guide) Font loader registration — how to enable Japanese
│   │   ├── 03-thai.json          Real Thai monthly report (headings, list, table in Thai)
│   │   ├── 03-thai.js            Node.js driver: registerFonts(th) → render 03-thai.json
│   │   ├── 04-multilingual.json  Real multilingual doc (EN + Thai + Japanese + Arabic + Russian)
│   │   └── 04-multilingual.js    Node.js driver: registerFonts(th,ja,ar,ru) → render 04-multilingual.json
│   ├── table-variant/            (v0.2.0) Table-centric PdfParams (--variant table)
│   ├── font/                     (v0.3.0) `--font` / `--lang` flag demo (latin preset)
│   ├── template/                 (v0.3.0) `--template` deep-merge demo (base + override)
│   ├── watch/                    (v0.3.0) `--watch` interactive auto-rebuild demo
│   └── table-smart/              (v1.0.0) Smart tables: zebra, caption, repeat-header, wrap
├── batch/                        (v1.0.0) Parallel directory render (pdfnative batch)
├── completion/                   (v1.0.0) Shell-completion script generation
├── config/                       (v1.0.0) `.pdfnativerc.json` default-flags demo
├── sign/                         Digital signature shell / PowerShell scripts
│   ├── 01-basic.*                Self-signed RSA-SHA256 sign
│   ├── 02-with-metadata.*        (v0.2.0) Sign with reason / location / signing-time
│   ├── 03-ecdsa.*                (v0.3.0) P-256 ECDSA-SHA256 sign
│   └── 04-roundtrip.*            (v0.3.0) render → sign → verify pipeline
├── inspect/                      PDF inspection shell / PowerShell scripts
├── verify/                       Signature verification shell / PowerShell scripts
│   ├── 01-self-signed.*          (v0.2.0) Verify a self-signed PDF
│   ├── 02-strict-mode.*          (v0.2.0) `--strict` exits non-zero on failure
│   ├── 03-cms-rsa.*              (v0.3.0) Verify CMS RSA-SHA256 signature value
│   ├── 04-cms-ecdsa.*            (v0.3.0) Verify CMS ECDSA-SHA256 signature value
│   └── 05-revocation.*           (v1.0.0) OCSP/CRL revocation + timestamp (PAdES-T)
└── streaming/                    Streaming render Node.js scripts
```

---

## Render Samples

### `render/document/` — Documents

| File | Description |
|------|-------------|
| [01-minimal.json](render/document/01-minimal.json) | Bare-minimum document: a single heading and paragraph |
| [02-report.json](render/document/02-report.json) | Business report with metadata, headers/footers, mixed blocks |
| [03-all-blocks.json](render/document/03-all-blocks.json) | **Reference** — every block type in one document (heading, paragraph, list, table, barcode, link, form fields, page break, spacer) |
| [04-invoice.json](render/document/04-invoice.json) | Invoice with line-item table, totals, and company branding |
| [05-technical-spec.json](render/document/05-technical-spec.json) | Technical specification with multi-level headings and code-style paragraphs |

### `render/table/` — Tables

| File | Description |
|------|-------------|
| [01-project-status.json](render/table/01-project-status.json) | Project status table with milestone tracking |
| [02-financial-summary.json](render/table/02-financial-summary.json) | Financial summary with revenue, cost, and margin rows |

### `render/barcode/` — Barcodes

| File | Description |
|------|-------------|
| [01-qr-url.json](render/barcode/01-qr-url.json) | QR code linking to a URL (`format: "qr"`) |
| [02-code128-shipping.json](render/barcode/02-code128-shipping.json) | Code 128 barcode for a shipping label (`format: "code128"`) |
| [03-ean13-product.json](render/barcode/03-ean13-product.json) | EAN-13 product barcode (`format: "ean13"`) |

### `render/form/` — Interactive Forms

| File | Description |
|------|-------------|
| [01-contact-form.json](render/form/01-contact-form.json) | Contact form: `text`, `email`, `phone`, `textarea` fields |
| [02-survey.json](render/form/02-survey.json) | Survey with `radio`, `checkbox`, and `select` fields |

### `render/toc/` — Table of Contents

| File | Description |
|------|-------------|
| [01-document-with-toc.json](render/toc/01-document-with-toc.json) | Multi-section document with auto-generated TOC block |

### `render/link/` — Hyperlinks

| File | Description |
|------|-------------|
| [01-resource-directory.json](render/link/01-resource-directory.json) | Resource directory page with inline hyperlinks |

### `render/watermark/` — Watermarks

| File | Description |
|------|-------------|
| [01-draft.json](render/watermark/01-draft.json) | Document with DRAFT status indicator (heading + footer) |
| [02-confidential.json](render/watermark/02-confidential.json) | Document with CONFIDENTIAL status indicator (heading + footer) |

**Note:** Visual watermark overlays are supported by `pdfnative` but not yet exposed through the CLI JSON interface. These samples demonstrate using heading and footer text to indicate document status. For programmatic watermarks, use the `pdfnative` Node.js API directly:
```typescript
import { buildDocumentPDFBytes } from 'pdfnative';
const pdf = buildDocumentPDFBytes(params, {
  watermark: { text: { text: 'DRAFT', opacity: 0.15, angle: 45 } }
});
```

### `render/layout/` — Page Sizes & Orientation

| File | Description |
|------|-------------|
| [01-us-letter.json](render/layout/01-us-letter.json) | US Letter (612 × 792 pt) — default US paper format |
| [02-a5-portrait.json](render/layout/02-a5-portrait.json) | A5 portrait (419.53 × 595.28 pt) — compact booklet size |
| [03-landscape-a4.json](render/layout/03-landscape-a4.json) | A4 landscape (841.89 × 595.28 pt) — wide-format reports |

### `render/pdfa/` — PDF/A Archival Conformance

| File | Conformance | Standard |
|------|-------------|----------|
| [01-pdfa-1b.json](render/pdfa/01-pdfa-1b.json) | PDF/A-1b | ISO 19005-1 — baseline archival |
| [02-pdfa-2b.json](render/pdfa/02-pdfa-2b.json) | PDF/A-2b | ISO 19005-2 — transparency, JPEG 2000 |
| [03-pdfa-3b.json](render/pdfa/03-pdfa-3b.json) | PDF/A-3b | ISO 19005-3 — embedded file attachments |

PDF/A conformance can also be set from the CLI via the `--tagged` flag (or the deprecated `--conformance` alias) instead of the JSON `layout.tagged` field:

```bash
# Preferred (v0.2.0+)
pdfnative render --input doc.json --output doc.pdf --tagged pdfa2b

# Deprecated alias — still works, prints a stderr deprecation notice
pdfnative render --input doc.json --output doc.pdf --conformance 2b
```

### `render/encryption/` — Password Protection (v0.2.0)

| File | Description |
|------|-------------|
| [01-aes128-protected.json](render/encryption/01-aes128-protected.json) | Document body for an AES-128 encrypted PDF |
| [01-aes128-protected.sh](render/encryption/01-aes128-protected.sh) | Bash driver — sets `$PDFNATIVE_ENCRYPT_OWNER_PASS` / `$PDFNATIVE_ENCRYPT_USER_PASS` and calls `--encrypt-algorithm aes128 --encrypt-permissions print` |
| [01-aes128-protected.ps1](render/encryption/01-aes128-protected.ps1) | PowerShell equivalent |

**Security:** owner / user passwords are read from environment variables first, then `--encrypt-owner-pass` / `--encrypt-user-pass` flags. Encryption is mutually exclusive with `--tagged pdfa*` (ISO 19005 forbids encrypted PDF/A).

### `render/headers-footers/` — Page Templates (v0.2.0)

| File | Description |
|------|-------------|
| [01-page-numbers.json](render/headers-footers/01-page-numbers.json) | Multi-page document body |
| [01-page-numbers.sh](render/headers-footers/01-page-numbers.sh) | Demonstrates `--header-left/-center/-right` and `--footer-*` with `{page}`, `{pages}`, `{date}`, `{title}` placeholders |
| [01-page-numbers.ps1](render/headers-footers/01-page-numbers.ps1) | PowerShell equivalent |

**Note:** the `{pages}` placeholder requires multi-pass pagination; it is rejected when combined with `--stream`.

### `render/attachments/` — PDF/A-3 Hybrid Documents (v0.2.0)

| File | Description |
|------|-------------|
| [01-pdfa3-with-xml.json](render/attachments/01-pdfa3-with-xml.json) | PDF/A-3b invoice body |
| [invoice.xml](render/attachments/invoice.xml) | Structured payload to embed |
| [01-pdfa3-with-xml.sh](render/attachments/01-pdfa3-with-xml.sh) | Renders with `--tagged pdfa3b --attachment <path>:<mime>:<rel>:<desc>` |
| [01-pdfa3-with-xml.ps1](render/attachments/01-pdfa3-with-xml.ps1) | PowerShell equivalent |

This is the Factur-X / ZUGFeRD pattern — a human-readable PDF/A-3 with a machine-readable XML attachment.

### `render/multilang/` — Non-Latin Scripts & Multilingual PDFs (v0.2.0)

pdfnative ships Noto Sans font data for 16 scripts inside the package itself
(`pdfnative/dist/../fonts/noto-*-data.js`). No external font files, no network
access, no extra dependencies. Font data is loaded lazily on first use and cached.

Because the pdfnative CLI starts a fresh process per invocation, font loaders must
be registered via `registerFonts()` **before** the render call — which is only
possible from a programmatic Node.js context. The two `.js` driver scripts below
do exactly that and then call `buildDocumentPDFBytes` directly.

#### JSON samples (content + documentation)

| File | Description |
|------|-------------|
| [01-thai.json](render/multilang/01-thai.json) | Guide: how to enable Thai rendering via `registerFonts({ th: () => import(...) })` |
| [02-japanese.json](render/multilang/02-japanese.json) | Guide: how to enable Japanese / CJK rendering |
| [03-thai.json](render/multilang/03-thai.json) | **Real Thai document** — monthly report with headings, paragraphs, list, table (all in Thai) |
| [04-multilingual.json](render/multilang/04-multilingual.json) | **Real multilingual document** — English + Thai + Japanese + Arabic (RTL) + Russian in one PDF |

#### Node.js driver scripts (Font loader + render)

| File | Description |
|------|-------------|
| [03-thai.js](render/multilang/03-thai.js) | Registers Noto Thai → renders `03-thai.json` → `output/multilang/03-thai.pdf` |
| [04-multilingual.js](render/multilang/04-multilingual.js) | Registers Thai + Japanese + Arabic + Russian → renders `04-multilingual.json` → `output/multilang/04-multilingual.pdf` |
| [01-thai.sh](render/multilang/01-thai.sh) | Bash: runs `03-thai.js` then `04-multilingual.js` |
| [01-thai.ps1](render/multilang/01-thai.ps1) | PowerShell equivalent |

```bash
# Run Thai sample only
node samples/render/multilang/03-thai.js

# Run multilingual sample (Thai + Japanese + Arabic + Russian)
node samples/render/multilang/04-multilingual.js

# Run both via the shell script
bash samples/render/multilang/01-thai.sh
```

**Font loader pattern (how it works):**

```js
import { registerFonts, loadFontData, buildDocumentPDFBytes } from 'pdfnative';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve pdfnative's bundled fonts directory (works with any package manager)
const fontsDir = join(dirname(fileURLToPath(import.meta.resolve('pdfnative'))), '..', 'fonts');
const fontUrl  = (name) => pathToFileURL(join(fontsDir, name)).href;

// Register loaders (lazy — fonts are not loaded until first use)
registerFonts({
  th: () => import(fontUrl('noto-thai-data.js')),    // Thai
  ja: () => import(fontUrl('noto-jp-data.js')),      // Japanese
  ar: () => import(fontUrl('noto-arabic-data.js')),  // Arabic (RTL)
  ru: () => import(fontUrl('noto-cyrillic-data.js')), // Russian
});

// Load font data (async, cached after first call)
const thFont = await loadFontData('th');

// Inject into DocumentParams
const pdf = buildDocumentPDFBytes({
  blocks: [{ type: 'paragraph', text: 'สวัสดีครับ Hello!' }],
  fontEntries: thFont ? [{ fontData: thFont, fontRef: '/F3', lang: 'th' }] : [],
});
```

**Supported font packages** (all bundled with pdfnative ≥ 1.0.5):

| Language | Code | Font package |
|----------|------|--------------|
| Thai | `th` | `noto-thai-data.js` |
| Japanese | `ja` | `noto-jp-data.js` |
| Chinese Simplified | `zh` | `noto-sc-data.js` |
| Korean | `ko` | `noto-kr-data.js` |
| Arabic | `ar` | `noto-arabic-data.js` |
| Russian / Cyrillic | `ru` | `noto-cyrillic-data.js` |
| Hindi / Devanagari | `hi` | `noto-devanagari-data.js` |
| Hebrew | `he` | `noto-hebrew-data.js` |
| Greek | `el` | `noto-greek-data.js` |
| Turkish | `tr` | `noto-turkish-data.js` |
| Vietnamese | `vi` | `noto-vietnamese-data.js` |
| Polish | `pl` | `noto-polish-data.js` |
| Bengali | `bn` | `noto-bengali-data.js` |
| Tamil | `ta` | `noto-tamil-data.js` |
| Georgian | `ka` | `noto-georgian-data.js` |
| Armenian | `hy` | `noto-armenian-data.js` |

### `render/table-variant/` — Table-centric API (v0.2.0)

| File | Description |
|------|-------------|
| [01-financial-transactions.json](render/table-variant/01-financial-transactions.json) | `PdfParams` payload — title, infoItems, headers, rows, balanceText, countText, footerText |
| [01-financial-transactions.sh](render/table-variant/01-financial-transactions.sh) | Driver using `--variant table` |
| [01-financial-transactions.ps1](render/table-variant/01-financial-transactions.ps1) | PowerShell equivalent |

`--variant table` switches the renderer to `buildPDFBytes` / `buildPDFStream`, which accept the lower-level `PdfParams` shape (suitable for ledger / transactional reports).

### `render/font/` — Font & Language Presets (v0.3.0)

| File | Description |
|------|-------------|
| [01-latin.json](render/font/01-latin.json) | Plain Latin-1 document body |
| [01-latin.sh](render/font/01-latin.sh) | Renders with `--font latin --lang latin` |
| [01-latin.ps1](render/font/01-latin.ps1) | PowerShell equivalent |

The `--font` and `--lang` flags select a preset from pdfnative's bundled font registry without requiring a `registerFonts` driver script. `latin` is the safe baseline; non-Latin presets still need a driver (see `render/multilang/`).

### `render/template/` — `--template` Deep Merge (v0.3.0)

| File | Description |
|------|-------------|
| [base.json](render/template/base.json) | Reusable base — common metadata, headers/footers |
| [override.json](render/template/override.json) | Document-specific blocks; merged on top of the base |
| [01-merge.sh](render/template/01-merge.sh) | `pdfnative render --template base.json --input override.json --output …` |
| [01-merge.ps1](render/template/01-merge.ps1) | PowerShell equivalent |

The CLI deep-merges `--template` into `--input` before rendering. Use this to share boilerplate across many documents (e.g. corporate header/footer templates). This category is **skipped by `run-all.js`** because both files are partial payloads.

### `render/watch/` — `--watch` Auto-Rebuild (v0.3.0, interactive)

| File | Description |
|------|-------------|
| [01-basic.sh](render/watch/01-basic.sh) | Starts `pdfnative render … --watch` and re-renders on JSON change (Bash) |
| [01-basic.ps1](render/watch/01-basic.ps1) | PowerShell equivalent |

`--watch` keeps the process running and rebuilds the PDF whenever the input JSON changes. **Skipped by `run-all.js`** because it never exits — run manually and Ctrl-C when done.

### `render/table-smart/` — Smart Tables (v1.0.0)

| File | Description |
|------|-------------|
| [01-smart-invoice.json](render/table-smart/01-smart-invoice.json) | Invoice using pdfnative 1.2.0 smart-table fields set directly in JSON: `zebra`, `caption`, `repeatHeader`, `wrap`, `minRowHeight`, `cellPadding` |
| [01-smart-invoice.sh](render/table-smart/01-smart-invoice.sh) | Renders the smart-table invoice (Bash) |
| [01-smart-invoice.ps1](render/table-smart/01-smart-invoice.ps1) | PowerShell equivalent |

Smart-table fields live on the `table` block in the JSON payload (no extra CLI flags required), so `run-all.js` renders this category automatically. Document-wide defaults can also be supplied via the `--table-wrap` and `--zebra` render flags.

---

## Sign Samples

Demonstrate the `pdfnative sign` command. Both Unix shell and PowerShell scripts are provided.

| Script | Description |
|--------|-------------|
| [sign/01-basic.sh](sign/01-basic.sh) | Render a PDF, generate a self-signed certificate, then sign it (Bash) |
| [sign/01-basic.ps1](sign/01-basic.ps1) | Same workflow for Windows PowerShell |
| [sign/02-with-metadata.sh](sign/02-with-metadata.sh) | (v0.2.0) Sign with `--reason`, `--name`, `--location`, `--contact`, `--signing-time` (Bash) |
| [sign/02-with-metadata.ps1](sign/02-with-metadata.ps1) | (v0.2.0) PowerShell equivalent |
| [sign/03-ecdsa.sh](sign/03-ecdsa.sh) | (v0.3.0) Generate a P-256 keypair and sign with `--algorithm ecdsa-sha256` (Bash) |
| [sign/03-ecdsa.ps1](sign/03-ecdsa.ps1) | (v0.3.0) PowerShell equivalent |
| [sign/04-roundtrip.sh](sign/04-roundtrip.sh) | (v0.3.0) Full **render → sign → verify** pipeline; asserts `signatureValid: true` via `jq` |
| [sign/04-roundtrip.ps1](sign/04-roundtrip.ps1) | (v0.3.0) PowerShell equivalent |

**Prerequisites:** `openssl` on your PATH (ships with Git for Windows).

**Security note:** The generated key/certificate in `samples/output/sign/keys/` is for demonstration only. Never use a demo certificate in production.

Using environment variables for key material (recommended for CI):

```bash
PDFNATIVE_SIGN_KEY="$(cat signing.key)" \
PDFNATIVE_SIGN_CERT="$(cat signing.crt)" \
pdfnative sign --input unsigned.pdf --output signed.pdf
```

---

## Inspect Samples

Demonstrate the `pdfnative inspect` command.

| Script | Description |
|--------|-------------|
| [inspect/01-json.sh](inspect/01-json.sh) | Inspect a PDF and write a JSON metadata report (Bash) |
| [inspect/01-json.ps1](inspect/01-json.ps1) | Same for Windows PowerShell |
| [inspect/02-text.sh](inspect/02-text.sh) | Inspect a PDF/A document, print human-readable text to stdout (Bash) |
| [inspect/02-text.ps1](inspect/02-text.ps1) | Same for Windows PowerShell |
| [inspect/03-verbose-pages.sh](inspect/03-verbose-pages.sh) | (v0.2.0) `--verbose` + `--pages` deep inspection report |
| [inspect/03-verbose-pages.ps1](inspect/03-verbose-pages.ps1) | (v0.2.0) PowerShell equivalent |
| [inspect/04-check-pdfa.sh](inspect/04-check-pdfa.sh) | (v0.2.0) Assert PDF/A conformance via `--check pdfa` (CI-friendly exit code) |
| [inspect/04-check-pdfa.ps1](inspect/04-check-pdfa.ps1) | (v0.2.0) PowerShell equivalent |

---

## Verify Samples

Demonstrate the `pdfnative verify` command — verifies CMS/PKCS#7 signatures embedded in a PDF (integrity, certificate chain, trust evaluation, and CMS signature-value verification).

| Script | Description |
|--------|-------------|
| [verify/01-self-signed.sh](verify/01-self-signed.sh) | Verify a PDF signed with a self-signed certificate (Bash) |
| [verify/01-self-signed.ps1](verify/01-self-signed.ps1) | PowerShell equivalent |
| [verify/02-strict-mode.sh](verify/02-strict-mode.sh) | `--strict` mode — exits non-zero if any signature fails (CI-friendly) |
| [verify/02-strict-mode.ps1](verify/02-strict-mode.ps1) | PowerShell equivalent |
| [verify/03-cms-rsa.sh](verify/03-cms-rsa.sh) | (v0.3.0) Verify CMS **RSA-SHA256** signature value end-to-end |
| [verify/03-cms-rsa.ps1](verify/03-cms-rsa.ps1) | (v0.3.0) PowerShell equivalent |
| [verify/04-cms-ecdsa.sh](verify/04-cms-ecdsa.sh) | (v0.3.0) Verify CMS **ECDSA-SHA256 (P-256)** signature value end-to-end |
| [verify/04-cms-ecdsa.ps1](verify/04-cms-ecdsa.ps1) | (v0.3.0) PowerShell equivalent |
| [verify/05-revocation.sh](verify/05-revocation.sh) | (v1.0.0) Revocation checking — `--revocation offline\|online` + `--revocation-policy strict\|soft-fail` (OCSP/CRL + PAdES-T timestamp) |
| [verify/05-revocation.ps1](verify/05-revocation.ps1) | (v1.0.0) PowerShell equivalent |

**Scope (v1.0.0):** verify checks **integrity** (byte-range SHA-256), **CMS signature value** (RSA-PKCS#1 v1.5 SHA-256 and ECDSA-SHA256 over P-256), **certificate chain signatures**, **trust** (against `--trust <root.pem>` PEM roots, or self-signed acceptance), **RFC 3161 timestamp validation (PAdES-T)**, and **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded from the PDF `/DSS` offline by default, with opt-in SSRF-guarded online fetching via `--revocation online`. Sign-side LTV (embedding timestamps/DSS at signing time) is upstream-blocked in pdfnative — see [ROADMAP.md](../ROADMAP.md) and [SECURITY.md](../SECURITY.md#network-access--revocation-checking).

---

## Batch Samples (v1.0.0)

Demonstrate the `pdfnative batch` command — renders every `*.json` in a directory to `<output-dir>/<name>.pdf` in parallel, reusing the full render pipeline. Exits non-zero if any file fails.

| Script | Description |
|--------|-------------|
| [batch/01-batch.sh](batch/01-batch.sh) | Batch-render `render/document/*.json` with `--concurrency 4 --compress` (Bash) |
| [batch/01-batch.ps1](batch/01-batch.ps1) | PowerShell equivalent |

Render flags other than `--input-dir` / `--output-dir` / `--concurrency` / `--fail-fast` / `--format` are forwarded to every file.

---

## Completion Samples (v1.0.0)

Demonstrate the `pdfnative completion` command — emits shell-completion scripts for **bash**, **zsh**, and **fish**.

| Script | Description |
|--------|-------------|
| [completion/01-generate.sh](completion/01-generate.sh) | Prints install one-liners for each shell, then previews the bash script (Bash) |
| [completion/01-generate.ps1](completion/01-generate.ps1) | PowerShell equivalent |

```bash
# bash (system-wide)
pdfnative completion bash | sudo tee /etc/bash_completion.d/pdfnative >/dev/null
# zsh (first fpath entry)
pdfnative completion zsh > "${fpath[1]}/_pdfnative"
# fish
pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish
```

---

## Config Samples (v1.0.0)

Demonstrate `.pdfnativerc.json` — a config file discovered cwd-upward that supplies **default flags**. Top-level keys are global defaults; keys named after a command (`render`, `verify`, `batch`, …) are per-command sections. Precedence is **CLI flags > env > config**.

| File | Description |
|------|-------------|
| [config/.pdfnativerc.json](config/.pdfnativerc.json) | Sample config: letter page size + compression + zebra tables for `render`, offline soft-fail revocation for `verify`, concurrency 8 for `batch` |
| [config/01-config.sh](config/01-config.sh) | Renders from the config dir (defaults apply) vs `--no-config` (built-in defaults) (Bash) |
| [config/01-config.ps1](config/01-config.ps1) | PowerShell equivalent |

Use `--config <path>` to point at an explicit config file, or `--no-config` to ignore config discovery entirely.

---

## Streaming Sample

Demonstrates piping a large JSON payload directly to `pdfnative render --stream`, writing the PDF to disk without buffering the whole document in Node.js.

| Script | Description |
|--------|-------------|
| [streaming/01-large-document.js](streaming/01-large-document.js) | Generates a 200-section document via the streaming render path |

```bash
node samples/streaming/01-large-document.js
```

---

## run-all.js Options

```
node samples/run-all.js [--category <name>] [--clean]

  --category <name>   Only render samples in render/<name>/
                      e.g. --category barcode
  --clean             Delete samples/output/ before running
```

**Skipped categories:** `watch/` and `template/` are skipped by default — `watch/` runs forever, and `template/` contains partial payloads that must be merged via `--template`. Run them manually using the per-script `.sh` / `.ps1` drivers.

Examples:

```bash
# Render only barcode samples
node samples/run-all.js --category barcode

# Render the v0.3.0 font preset sample
node samples/run-all.js --category font

# Run the full render → sign → verify pipeline
bash samples/sign/04-roundtrip.sh

# Clean output and re-render everything
node samples/run-all.js --clean
```

---

## Integration Patterns

### npm script in `package.json`

```json
{
  "scripts": {
    "build:pdf": "pdfnative render --input data/document.json --output dist/report.pdf",
    "build:pdf:archive": "pdfnative render --input data/document.json --output dist/report.pdf --conformance pdfa2b"
  }
}
```

### GitHub Actions CI

```yaml
- name: Render PDF
  run: pdfnative render --input docs/spec.json --output dist/spec.pdf

- name: Sign PDF
  env:
    PDFNATIVE_SIGN_KEY: ${{ secrets.SIGN_KEY }}
    PDFNATIVE_SIGN_CERT: ${{ secrets.SIGN_CERT }}
  run: pdfnative sign --input dist/spec.pdf --output dist/spec-signed.pdf

- name: Upload artifact
  uses: actions/upload-artifact@v4
  with:
    name: signed-pdf
    path: dist/spec-signed.pdf
```

### Docker

```dockerfile
FROM node:22-alpine
RUN npm install --global pdfnative-cli
WORKDIR /work
COPY document.json .
RUN pdfnative render --input document.json --output output.pdf
```

### TypeScript integration (spawn child process)

```typescript
import { spawn } from 'node:child_process';

function renderToFile(params: object, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('pdfnative', ['render', '--output', outputPath], {
            stdio: ['pipe', 'ignore', 'inherit'],
        });
        child.stdin.end(JSON.stringify(params), 'utf8');
        child.on('close', (code) => {
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
        });
    });
}

await renderToFile(
    { title: 'Invoice', blocks: [{ type: 'paragraph', text: 'Amount due: $100' }] },
    'invoice.pdf',
);
```

---

## Block Type Reference

Every block type accepted by `pdfnative render` is demonstrated in [render/document/03-all-blocks.json](render/document/03-all-blocks.json).

| Block type | Key fields | Sample |
|------------|-----------|--------|
| `heading` | `text`, `level` (1–6) | [03-all-blocks.json](render/document/03-all-blocks.json) |
| `paragraph` | `text`, `align`, `fontSize` | [02-report.json](render/document/02-report.json) |
| `table` | `headers[]`, `rows[][]` | [01-project-status.json](render/table/01-project-status.json) |
| `list` | `style` (`bullet`\|`numbered`), `items[]` | [03-all-blocks.json](render/document/03-all-blocks.json) |
| `barcode` | `format`, `data`, `width` | [01-qr-url.json](render/barcode/01-qr-url.json) |
| `link` | `text`, `url` | [01-resource-directory.json](render/link/01-resource-directory.json) |
| `toc` | `title`, `maxLevel` | [01-document-with-toc.json](render/toc/01-document-with-toc.json) |
| `formField` | `fieldType`, `name`, `label`, `value` | [01-contact-form.json](render/form/01-contact-form.json) |
| `spacer` | `height` | any document sample |
| `pageBreak` | *(no fields)* | [03-all-blocks.json](render/document/03-all-blocks.json) |

> `ImageBlock` and `SvgBlock` require binary data (`Uint8Array`) and cannot be expressed in plain JSON. Use the `pdfnative` Node.js API directly for those block types.

---

## See Also

- [../README.md](../README.md) — Installation, quick start, command reference
- [../docs/KNOWLEDGE_BASE.md](../docs/KNOWLEDGE_BASE.md) — Full CLI documentation, architecture, FAQ
- [pdfnative library](https://github.com/Nizoka/pdfnative) — Core PDF generation engine (Node.js API with more features)
