# pdfnative-cli — Samples

A comprehensive collection of sample files covering every feature of pdfnative-cli, organized by category. Each category corresponds to a distinct capability of the `pdfnative` library.

> **Generated PDFs are not committed.** The per-script demos write to `samples/output/`; the generator writes the baseline corpus to `test-output/samples/` — both git-ignored.

---

## Quick Navigation

**New to pdfnative-cli?** Follow this path:
1. ✅ Run a quick sample: `npm run build && npx tsx scripts/generate-samples.ts --category document`
2. ✅ View sample JSON: [render/document/01-minimal.json](render/document/01-minimal.json)
3. ✅ Try a different feature: `npx tsx scripts/generate-samples.ts --category typography`
4. ✅ Read the docs: [../docs/KNOWLEDGE_BASE.md](../docs/KNOWLEDGE_BASE.md)
5. ✅ Check FAQ: [../docs/KNOWLEDGE_BASE.md#12-frequently-asked-questions](../docs/KNOWLEDGE_BASE.md#12-frequently-asked-questions)

---

## Quick Start

### Run every sample at once (v1.5.0 — the baseline run)

```bash
# From the repo root: build the CLI, then render every sample JSON, the multilang
# drivers and the derived outputs (merge/split/extract, annotate, fill, metadata,
# encrypt/decrypt, sign) into test-output/samples/ with the BUILT binary — 91 sample PDFs,
# byte-stable (TZ=UTC, creation date pinned to 2026-01-01T00:00:00Z)
npm run build && npm run test:generate

# Compare the run with the committed baseline (tests/regression/baselines/samples.sha256.json)
npx tsx scripts/verify-samples.ts

# One category only, or a globally installed binary
npx tsx scripts/generate-samples.ts --category typography
PDFNATIVE_CLI="$(which pdfnative)" npm run test:generate
```

The shell / PowerShell scripts under each directory are self-contained demos that write to
`samples/output/` (git-ignored); they assume `pdfnative` on the PATH (`npm install -g pdfnative-cli`).

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
├── README.md                     This file (the generator is scripts/generate-samples.ts — `npm run test:generate`)
├── render/                       JSON payloads for pdfnative render
│   ├── document/                 General-purpose documents (06-max-blocks.* = --max-blocks guard, v1.1.0)
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
│   │   ├── 04-multilingual.js    Node.js driver: registerFonts(th,ja,ar,ru) → render 04-multilingual.json
│   │   ├── 05-lao.json           (v1.5.0) Lao — `--font lo --lang lo`
│   │   ├── 06-tai-tham-cham.json (v1.5.0) Tai Tham, New Tai Lue, Tai Le, Cham — `nod khb tdd cjm`
│   │   ├── 07-african-latin.json (v1.5.0) Hausa, Yoruba, Igbo, Swahili — the `ha yo ig sw` aliases of `latin`
│   │   ├── 08-european-caucasian.json (v1.5.0) Greek, Russian, Georgian, Armenian, Polish, Turkish, Vietnamese
│   │   ├── 09-rtl.json           (v1.5.0) Arabic and Hebrew — bidi, contextual forms, marks
│   │   ├── 10-indic.json         (v1.5.0) Hindi, Bengali, Tamil — the 1.8.0 Indic OpenType engine
│   │   ├── 11-cjk.json           (v1.5.0) Chinese and Korean
│   │   └── 08-language-families.*  (v1.5.0) Renders 08–11 with the --font / --lang list of each family
│   ├── table-variant/            (v0.2.0) Table-centric PdfParams (--variant table; fonts embedded since v1.5.0)
│   ├── font/                     (v0.3.0) `--font` / `--lang` flag demo (latin preset)
│   │   ├── 01-latin.*            Latin preset shortcut
│   │   ├── 02-new-scripts.*      (v1.1.0) Six 1.3.0 scripts + COLRv1 colour emoji
│   │   ├── 03-emoji.*            (v1.1.0) Monochrome emoji preset (`--font emoji`)
│   │   ├── 04-new-scripts-1.8.*  (v1.5.0) The five 1.8.0 scripts (Lao, Tai Tham, New Tai Lue, Tai Le, Cham)
│   │   ├── 05-font-file.*        (v1.5.0) `--font-file <path.ttf>[:name]` — a custom font from disk
│   │   └── 06-color-emoji-sequences.* (v1.5.0) Colour emoji: skin tones, ZWJ sequences, flags (COLRv1)
│   ├── template/                 (v0.3.0) `--template` deep-merge demo (base + override)
│   ├── watch/                    (v0.3.0) `--watch` interactive auto-rebuild demo
│   ├── table-smart/              (v1.0.0) Smart tables: zebra, caption, repeat-header, wrap
│   ├── outline/                  (v1.2.0) PDF bookmarks — `--outline auto` + explicit tree
│   ├── math/                     (v1.2.0) Math/technical symbols via `--font math`
│   ├── inspect-layout/           (v1.2.0) `--inspect-layout` report + `--debug-layout` guides
│   ├── chart/                    (v1.3.0) Native vector charts
│   │   ├── 01-bar-chart.json     Multi-series bar chart with legend
│   │   ├── 02-line-and-pie.json  Line chart + donut chart
│   │   ├── 03-stacked-bars.json  (v1.4.0) stackedBar / stackedBarH + dataLabels
│   │   ├── 04-area-scatter.json  (v1.4.0) area + dual axes (axis2) + log-scale scatter
│   │   └── 05-time-axis.json     (v1.4.0) time x-axis (ISO xValues) + labelRotation
│   ├── print/                    (v1.4.0) Print production & viewer preferences (pdfnative ≥ 1.7.0)
│   │   ├── 01-bleed-marks.json   (v1.4.0) layout.print — bleed, TrimBox, crop/registration marks, trapped
│   │   ├── 02-viewer-prefs.json  (v1.4.0) layout.viewerPreferences — duplex, copies, print range, tray
│   │   ├── 03-cmyk-colours.json  (v1.5.0) CMYK colours ("c m y k" / [c,m,y,k]) in headings, tables, charts
│   │   ├── 04-colour-bars.json   (v1.5.0) layout.print.marks.colourBars — printer's colour bars
│   │   ├── 05-pdfx4.json + .sh/.ps1 (v1.5.0) PDF/X-4: --pdfx pdfx4 --output-intent-icc, then inspect --check pdfx
│   │   ├── 06-gray-pdfx4.*       (v1.5.0) PDF/X-4 under a Gray output intent; CMYK content refused by --strict
│   │   ├── 07-tight-bleed-marks.* (v1.5.0) Marks in a 3 mm bleed — the 1.8.0 marks clearance
│   │   ├── 03-cmyk-colours.sh/.ps1, 04-colour-bars.sh/.ps1 (v1.5.0) Drivers for 03 and 04
│   │   ├── synthetic-cmyk.icc    (v1.5.0) Synthetic prtr CMYK profile — NOT a press profile
│   │   └── synthetic-gray.icc    (v1.5.0) Synthetic prtr Gray profile — NOT a press profile
│   ├── typography/               (v1.5.0) layout.typography — the 1.8.0 typography engine
│   │   ├── 01-paragraph-breaking.json        widows/orphans, keepWithNext, splittable paragraphs
│   │   ├── 02-justify-optical-hyphenation.json  justify, optical margins, soft hyphens
│   │   ├── 03-french-spacing-units-short-words.json  punctuationSpacing "fr", unitBinding, short words
│   │   ├── 04-kerning-features-metrics.json  kerning, OpenType features
│   │   ├── 05-french-canadian-spacing.json   punctuationSpacing "fr-CA"
│   │   ├── 06-custom-spacing-rules.json      punctuationSpacing as explicit rules
│   │   ├── 07-soft-hyphen-keep-with-next.json  soft hyphens, per-block keepWithNext / splittable
│   │   ├── 01-typography.*       Renders 01–04 with --font latin --lang latin (+ the four flags)
│   │   └── 05-spacing-and-keep-rules.*  Renders 05–07, extracts the no-break spaces, writes the page map
│   ├── base14/                   (v1.5.0) The base-14 path: no --font flag on purpose
│   │   └── 01-exact-metrics.*    layout.typography.metrics "exact" — Adobe Core 14 widths for Helvetica
│   └── reproducible/             (v1.5.0) Byte-reproducible output
│       ├── 01-pinned-date.json   Rendered with --creation-date 2026-01-01T00:00:00Z
│       ├── 02-source-date-epoch.json  Same document, rendered with SOURCE_DATE_EPOCH=1767225600
│       └── 01-double-render.*    Renders twice under different TZ values and compares SHA-256 (the proof)
├── merge/                        (v1.2.0) Concatenate PDFs (pdfnative page-tree)
├── split/                        (v1.2.0) Split one PDF into many (per-page or per-range)
├── extract/                      (v1.2.0) Pull selected pages into a new PDF
├── extract-text/                 (v1.3.0) Reading-order text (text | json | ndjson); 02-actualtext.* = v1.5.0 /ActualText
├── fill/                         (v1.3.0) Fill, flatten & export AcroForms
├── encrypt/                      (v1.3.0) Encrypt / decrypt (AES-128/256, --password, --stream)
├── doctor/                       (v1.3.0) Environment / capability preflight (02-capabilities.* = v1.5.0 fonts/unicode/conformance)
├── annotate/                     (v1.2.0) Attach markup annotations (incremental save); 02-link.* = v1.5.0 link annotations
├── metadata/                     (v1.4.0) Incremental /Info + XMP metadata update (keeps signatures)
├── compare/                      (v1.4.0) Text/structure diff of two PDFs (CI exit codes)
├── govern/                       (v1.2.0) AI-governance / HITL: rules, policy, verify-issue
├── batch/                        (v1.0.0) Parallel directory render + manifest pipelines
│   ├── 01-batch.*                Parallel directory render
│   ├── 02-fail-fast.*            (v1.1.0) --fail-fast abort demo
│   ├── 03-manifest.*             (v1.4.0) `batch --manifest` — render → encrypt → inspect pipeline
│   └── manifest/                 (v1.4.0) tasks.json (@id refs) + report.json input
├── agent/                        (v1.1.0) Agent-native contract: --json envelope, --dry-run, schema
│   ├── 01-json-and-dry-run.*     --json status envelope + --dry-run validation
│   ├── 02-schema.*               `schema` command — versioned JSON Schemas
│   ├── 03-error-envelope.*       Deterministic failures (stable E_* error codes)
│   ├── 04-token-economy.*        ~90% smaller output via --summary / --fields / compact JSON
│   └── 05-global-flags-first.*   (v1.5.0) `pdfnative --json --dry-run render …` — global flags before the command
├── completion/                   (v1.0.0) Shell-completion script generation
├── config/                       (v1.0.0) `.pdfnativerc.json` default-flags demo
├── sign/                         Digital signature shell / PowerShell scripts
│   ├── 01-basic.*                Self-signed RSA-SHA256 sign
│   ├── 02-with-metadata.*        (v0.2.0) Sign with reason / location / signing-time
│   ├── 03-ecdsa.*                (v0.3.0) P-256 ECDSA-SHA256 sign
│   ├── 04-roundtrip.*            (v0.3.0) render → sign → verify pipeline
│   ├── 05-cert-chain.*           (v1.1.0) Root-CA → signer chain via --cert-chain + verify --trust
│   ├── 06-timestamp.*            (v1.4.0) PAdES B-T — sign --timestamp <tsa> --profile pades
│   ├── 07-native-crypto.*        (v1.2.0) Native node:crypto (default) vs pure-JS (--pure-crypto)
│   ├── 08-ltv.*                  (v1.4.0) Full PAdES ladder: B-B → B-T → B-LT → B-LTA
│   ├── 09-multiple-signatures.*  (v1.4.0) Two signers via --allow-multiple / --field-name
│   └── 10-timestamp-timeout.*    (v1.5.0) sign --timestamp <tsa> --timestamp-timeout <ms> (network only with PDFNATIVE_TSA_URL)
├── inspect/                      PDF inspection shell / PowerShell scripts
│   ├── 01-json.*                 JSON metadata report
│   ├── 02-text.*                 Human-readable text report
│   ├── 03-verbose-pages.*        Per-page detail + verbose trailer/catalog keys
│   ├── 04-check-pdfa.*           CI gate: assert PDF/A conformance
│   ├── 05-pdfua.*                (v1.1.0) PDF/UA (ISO 14289-1) structural validation gate
│   ├── 06-check-signed-encrypted.* (v1.1.0) CI gates for --check signed / --check encrypted
│   ├── 07-annotations.*          (v1.2.0) List markup + link annotations (inspect --annotations)
│   ├── 08-list-signatures.*      (v1.4.0) inspect --signatures inventory + --check "signatures>=N"
│   ├── 09-check-pdfx.*           (v1.5.0) inspect --pdfx / --check pdfx on a PDF/X-4 render (pass, then broken by annotate)
│   └── 10-iso-dates.*            (v1.5.0) inspect --iso-dates — PDF dates as ISO 8601
├── verify/                       Signature verification shell / PowerShell scripts
│   ├── 01-self-signed.*          (v0.2.0) Verify a self-signed PDF
│   ├── 02-strict-mode.*          (v0.2.0) `--strict` exits non-zero on failure
│   ├── 03-cms-rsa.*              (v0.3.0) Verify CMS RSA-SHA256 signature value
│   ├── 04-cms-ecdsa.*            (v0.3.0) Verify CMS ECDSA-SHA256 signature value
│   ├── 05-revocation.*           (v1.0.0) OCSP/CRL revocation + timestamp (PAdES-T)
│   ├── 06-online-revocation.*    (v1.1.0) Offline default + commented SSRF-guarded online variant
│   └── 07-weak-digest.*          (v1.5.0) timestampDigest + the SHA-1 weak-digest note, refused under --strict
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
| [06-max-blocks.json](render/document/06-max-blocks.json) | (v1.1.0) Document body for the `--max-blocks` large-report guard demo |
| [06-max-blocks.sh](render/document/06-max-blocks.sh) | (v1.1.0) Render with a generous `--max-blocks 10000`, then trip the guard with `--max-blocks 3` |
| [06-max-blocks.ps1](render/document/06-max-blocks.ps1) | (v1.1.0) PowerShell equivalent |

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
| [01-contact-form.json](render/form/01-contact-form.json) | Contact form: `text` fields (name, e-mail, phone) and a `multilineText` message |
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
| [03-cli-flags.json](render/watermark/03-cli-flags.json) | (v1.1.0) Document body for the CLI watermark-flag demo |
| [03-cli-flags.sh](render/watermark/03-cli-flags.sh) | (v1.1.0) Overlay a real watermark via `--watermark-text/-opacity/-angle/-color/-font-size/-position` |
| [03-cli-flags.ps1](render/watermark/03-cli-flags.ps1) | (v1.1.0) PowerShell equivalent |

**Note:** Visual watermark overlays are exposed through the CLI via the `--watermark-text` / `--watermark-image` flags (plus `--watermark-opacity`, `--watermark-angle`, `--watermark-color`, `--watermark-font-size`, `--watermark-position`) — see `03-cli-flags.*`. The `01`/`02` samples instead show the heading/footer-text approach for status indication. Watermarks can also be set programmatically:
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
| [04-pdfa-2u.json](render/pdfa/04-pdfa-2u.json) | PDF/A-2u | ISO 19005-2 — every glyph mapped to Unicode |
| [05-form-pdfa2b.json](render/pdfa/05-form-pdfa2b.json) | PDF/A-2b | (v1.5.0) An **AcroForm under a PDF/A claim** — the six field types; the fields' default-resources font is the embedded Latin font (pdfnative 1.8.0), so veraPDF accepts the file |
| [05-form-pdfa2b.sh](render/pdfa/05-form-pdfa2b.sh) | — | (v1.5.0) Renders it with `--font latin --lang latin --strict`, asserts `inspect --check pdfa`, then lists the fields with `fill --export` |
| [05-form-pdfa2b.ps1](render/pdfa/05-form-pdfa2b.ps1) | — | (v1.5.0) PowerShell equivalent |

PDF/A conformance can also be set from the CLI via the `--tagged` flag (or the deprecated `--conformance` alias) instead of the JSON `layout.tagged` field:

```bash
# Preferred (v0.2.0+)
pdfnative render --input doc.json --output doc.pdf --tagged pdfa2b --font latin --lang latin

# Deprecated alias — still works, prints a stderr deprecation notice
pdfnative render --input doc.json --output doc.pdf --conformance 2b --font latin --lang latin
```

> **PDF/A conformance:** the `--tagged pdfa*` flag only *declares* the claim —
> real conformance requires embedded fonts (ISO 19005 §6.2.11.4.1 / §6.3.4), so
> always pass `--font latin --lang latin` (the generator's plan,
> `scripts/lib/sample-plan.ts`, applies them to the `pdfa` and `attachments`
> categories). Without them the render emits a `PDFA_NO_FONT_ENTRIES` warning and
> the output fails the reference validator. PDF/A outputs are validated with
> veraPDF in CI (blocking — a 16-file conformance corpus with negative canaries;
> its PDF/X-4 entries are validated by pdfnative's validator); run
> `npm run corpus:pdfa && npm run validate:pdfx && npm run validate:pdfa`
> locally, but note the PDF/A step exits 0 as a *skip* when veraPDF is not
> installed — that is not a proof of conformance.

### `render/encryption/` — Password Protection (v0.2.0)

| File | Description |
|------|-------------|
| [01-aes128-protected.json](render/encryption/01-aes128-protected.json) | Document body for an AES-128 encrypted PDF |
| [01-aes128-protected.sh](render/encryption/01-aes128-protected.sh) | Bash driver — sets `$PDFNATIVE_ENCRYPT_OWNER_PASS` / `$PDFNATIVE_ENCRYPT_USER_PASS` and calls `--encrypt-algorithm aes128 --encrypt-permissions print` |
| [01-aes128-protected.ps1](render/encryption/01-aes128-protected.ps1) | PowerShell equivalent |
| [02-aes256-protected.json](render/encryption/02-aes256-protected.json) | (v1.1.0) Document body for an AES-256 encrypted PDF |
| [02-aes256-protected.sh](render/encryption/02-aes256-protected.sh) | (v1.1.0) Bash driver — `--encrypt-algorithm aes256 --encrypt-permissions print` |
| [02-aes256-protected.ps1](render/encryption/02-aes256-protected.ps1) | (v1.1.0) PowerShell equivalent |

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

pdfnative ships Noto Sans font data for 27 Unicode scripts (plus a math font and
COLRv1 colour emoji — 31 font modules) inside the package itself
(`pdfnative/dist/../fonts/noto-*-data.js`). No external font files, no network
access, no extra dependencies. Font data is loaded lazily on first use and cached.
The `render --font <code>` allow-list covers all 27 script codes plus the
`ha` / `yo` / `ig` / `sw` aliases of `latin` — see the README feature table.

`--font <code> --lang <code>` registers a bundled script for the duration of one
render, so no driver script is needed (`01-thai.json` renders with
`--font th --lang th`). The two `.js` driver scripts below show the programmatic
pattern instead — `registerFonts()` + `buildDocumentPDFBytes` from the pdfnative
API — and honour `PDFNATIVE_SAMPLES_OUT` and `SOURCE_DATE_EPOCH` so the generator
can include their output in the baseline.

#### JSON samples (content + documentation)

| File | Description |
|------|-------------|
| [01-thai.json](render/multilang/01-thai.json) | Thai through the CLI alone — `--font th --font latin --lang th,latin` (the text also explains the `registerFonts` route of the Node drivers) |
| [02-japanese.json](render/multilang/02-japanese.json) | Japanese through the CLI alone — `--font ja --font latin --lang ja,latin` |
| [03-thai.json](render/multilang/03-thai.json) | **Real Thai document** — monthly report with headings, paragraphs, list, table (all in Thai) |
| [04-multilingual.json](render/multilang/04-multilingual.json) | **Real multilingual document** — English + Thai + Japanese + Arabic (RTL) + Russian in one PDF |
| [05-lao.json](render/multilang/05-lao.json) | (v1.5.0) **Lao** — `--font lo --lang lo` (the 1.8.0 Lao shaper) |
| [06-tai-tham-cham.json](render/multilang/06-tai-tham-cham.json) | (v1.5.0) **Tai Tham, New Tai Lue, Tai Le, Cham** — `--font nod --font khb --font tdd --font cjm` (USE engine) |
| [07-african-latin.json](render/multilang/07-african-latin.json) | (v1.5.0) **Hausa, Yoruba, Igbo, Swahili** — `--font ha --font yo --font ig --font sw` resolve to the Latin font |
| [08-european-caucasian.json](render/multilang/08-european-caucasian.json) | (v1.5.0) **Greek, Russian, Georgian, Armenian, Polish, Turkish, Vietnamese** — one section per language: a native paragraph, a table of the cases its module must draw (ogonek letters, dotted / dotless i, stacked Vietnamese diacritics — the glyphs pdfnative 1.8.0 made every module able to draw), a list |
| [09-rtl.json](render/multilang/09-rtl.json) | (v1.5.0) **Arabic and Hebrew** — contextual forms, lam-alef, harakat, niqqud, mixed direction, and an ARABIC LETTER MARK (U+061C) the engine strips before measuring |
| [10-indic.json](render/multilang/10-indic.json) | (v1.5.0) **Hindi, Bengali, Tamil** — the 1.8.0 Indic OpenType engine: reph, rakar, conjuncts, pre-base and two-part vowel signs |
| [11-cjk.json](render/multilang/11-cjk.json) | (v1.5.0) **Chinese and Korean** — a Simplified Chinese statement table and Hangul with complex finals (Japanese is `02-japanese.json`) |
| [08-language-families.sh](render/multilang/08-language-families.sh) | (v1.5.0) Renders `08`–`11`, each with the `--font` / `--lang` list of its family |
| [08-language-families.ps1](render/multilang/08-language-families.ps1) | (v1.5.0) PowerShell equivalent |

The native text of `05`–`11` and of `render/font/04` is demonstration content taken from the language documents of the pdfnative repository (`scripts/data/language-docs-data.ts`, MIT, same author); with `01`–`04`, `render/font/02` and `render/font/04` **every one of the 27 script codes is rendered by the corpus** (`tests/regression/engine-surface.test.ts` holds the plan to it).

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
| Telugu / Sinhala / Khmer / Myanmar / Tibetan / Amharic | `te` `si` `km` `my` `bo` `am` | `noto-*-data.js` (1.3.0) |
| Lao | `lo` | `noto-lao-data.js` (1.8.0) |
| Tai Tham (Lanna) | `nod` | `noto-taitham-data.js` (1.8.0) |
| New Tai Lue | `khb` | `noto-newtailue-data.js` (1.8.0) |
| Tai Le | `tdd` | `noto-taile-data.js` (1.8.0) |
| Cham | `cjm` | `noto-cham-data.js` (1.8.0) |
| Hausa / Yoruba / Igbo / Swahili | `ha` `yo` `ig` `sw` | aliases of `latin` (`noto-sans-data.js`) |

`pdfnative doctor` lists the whole inventory (`fonts: 31 modules / 27 scripts`) and checks every module is on disk.

### `render/table-variant/` — Table-centric API (v0.2.0)

| File | Description |
|------|-------------|
| [01-financial-transactions.json](render/table-variant/01-financial-transactions.json) | `PdfParams` payload — title, infoItems, headers, rows, balanceText, countText, footerText |
| [01-financial-transactions.sh](render/table-variant/01-financial-transactions.sh) | Driver using `--variant table` |
| [01-financial-transactions.ps1](render/table-variant/01-financial-transactions.ps1) | PowerShell equivalent |

`--variant table` switches the renderer to `buildPDFBytes` / `buildPDFStream`, which accept the lower-level `PdfParams` shape (suitable for ledger / transactional reports). Since v1.5.0 `--font latin --lang latin` embeds fonts on this path too, so a table render can claim PDF/A (`--tagged pdfa2b --strict`).

### `render/font/` — Font & Language Presets (v0.3.0)

| File | Description |
|------|-------------|
| [01-latin.json](render/font/01-latin.json) | Plain Latin-1 document body |
| [01-latin.sh](render/font/01-latin.sh) | Renders with `--font latin --lang latin` |
| [01-latin.ps1](render/font/01-latin.ps1) | PowerShell equivalent |
| [02-new-scripts.json](render/font/02-new-scripts.json) | (v1.1.0) Six 1.3.0 scripts (Telugu, Sinhala, Khmer, Burmese, Tibetan, Amharic) + COLRv1 colour emoji |
| [02-new-scripts.sh](render/font/02-new-scripts.sh) | (v1.1.0) Renders the new scripts with per-script `--font`/`--lang` flags |
| [02-new-scripts.ps1](render/font/02-new-scripts.ps1) | (v1.1.0) PowerShell equivalent |
| [03-emoji.json](render/font/03-emoji.json) | (v1.1.0) Monochrome emoji document body |
| [03-emoji.sh](render/font/03-emoji.sh) | (v1.1.0) Renders with `--font emoji --lang emoji` |
| [03-emoji.ps1](render/font/03-emoji.ps1) | (v1.1.0) PowerShell equivalent |
| [04-new-scripts-1.8.json](render/font/04-new-scripts-1.8.json) | (v1.5.0) A table of the five 1.8.0 scripts — Lao, Tai Tham, New Tai Lue, Tai Le, Cham |
| [04-new-scripts-1.8.sh](render/font/04-new-scripts-1.8.sh) | (v1.5.0) Renders with `--font lo --font nod --font khb --font tdd --font cjm --font latin` and the matching `--lang` list |
| [04-new-scripts-1.8.ps1](render/font/04-new-scripts-1.8.ps1) | (v1.5.0) PowerShell equivalent |
| [05-font-file.sh](render/font/05-font-file.sh) | (v1.5.0) `--font-file <path.ttf>[:name]` — registers a TrueType/OpenType file from disk (32 MiB cap, magic bytes, validated by the engine) and uses it as a `--lang` |
| [05-font-file.ps1](render/font/05-font-file.ps1) | (v1.5.0) PowerShell equivalent |
| [06-color-emoji-sequences.json](render/font/06-color-emoji-sequences.json) | (v1.5.0) **Colour emoji sequences** — eight gestures and people in the five Fitzpatrick skin tones, ZWJ sequences (rainbow flag, professions, family), regional-indicator flags, and the glyphs of the 1.8.0 alpha-ramp fix; every one a single COLRv1 vector form |
| [06-color-emoji-sequences.sh](render/font/06-color-emoji-sequences.sh) | (v1.5.0) Renders with `--font color-emoji --font latin --lang color-emoji,latin` |
| [06-color-emoji-sequences.ps1](render/font/06-color-emoji-sequences.ps1) | (v1.5.0) PowerShell equivalent |

The `--font` and `--lang` flags select a preset (or, repeated, multiple scripts) from pdfnative's bundled font registry without requiring a `registerFonts` driver script. `latin` is the safe baseline; non-Latin presets can be selected directly by code (`te`, `si`, `km`, `my`, `bo`, `am`, `lo`, `nod`, `khb`, `tdd`, `cjm`, `emoji`, `color-emoji`, …), and `--font-file` adds your own font — only from a command-line path, never from a JSON payload.

### `render/template/` — `--template` Deep Merge (v0.3.0)

| File | Description |
|------|-------------|
| [base.json](render/template/base.json) | Reusable base — common metadata, headers/footers |
| [override.json](render/template/override.json) | Document-specific blocks; merged on top of the base |
| [01-merge.sh](render/template/01-merge.sh) | `pdfnative render --template base.json --input override.json --output …` |
| [01-merge.ps1](render/template/01-merge.ps1) | PowerShell equivalent |

The CLI deep-merges `--template` into `--input` before rendering. Use this to share boilerplate across many documents (e.g. corporate header/footer templates). This category is **skipped by the generator** (`scripts/lib/sample-plan.ts`) because both files are partial payloads.

### `render/watch/` — `--watch` Auto-Rebuild (v0.3.0, interactive)

| File | Description |
|------|-------------|
| [01-basic.sh](render/watch/01-basic.sh) | Starts `pdfnative render … --watch` and re-renders on JSON change (Bash) |
| [01-basic.ps1](render/watch/01-basic.ps1) | PowerShell equivalent |

`--watch` keeps the process running and rebuilds the PDF whenever the input JSON changes. **Skipped by the generator** because it never exits — run manually and Ctrl-C when done.

### `render/table-smart/` — Smart Tables (v1.0.0)

| File | Description |
|------|-------------|
| [01-smart-invoice.json](render/table-smart/01-smart-invoice.json) | Invoice using the smart-table fields (pdfnative ≥ 1.2.0) set directly in JSON: `zebra`, `caption`, `repeatHeader`, `wrap`, `minRowHeight`, `cellPadding` |
| [01-smart-invoice.sh](render/table-smart/01-smart-invoice.sh) | Renders the smart-table invoice (Bash) |
| [01-smart-invoice.ps1](render/table-smart/01-smart-invoice.ps1) | PowerShell equivalent |

Smart-table fields live on the `table` block in the JSON payload (no extra CLI flags required), so the generator renders this category like any other document. Document-wide defaults can also be supplied via the `--table-wrap` and `--zebra` render flags.

### `render/outline/` — PDF Bookmarks (v1.2.0)

| File | Description |
|------|-------------|
| [01-headings.json](render/outline/01-headings.json) | Multi-section document used for both bookmark demos |
| [02-outline-tree.json](render/outline/02-outline-tree.json) | Explicit `OutlineItem[]` tree (nested, bold, coloured, collapsed) |
| [01-outline.sh](render/outline/01-outline.sh) | Renders bookmarks two ways: `--outline auto` (from headings) and `--outline <tree.json>` |
| [01-outline.ps1](render/outline/01-outline.ps1) | PowerShell equivalent |

`--outline auto` derives the bookmark tree from the document's headings; `--outline <file.json>` supplies an explicit tree. The generator renders `01-headings.json` with `--outline auto` and skips the non-document `02-outline-tree.json`.

### `render/math/` — Mathematical Symbols (v1.2.0)

| File | Description |
|------|-------------|
| [01-math.json](render/math/01-math.json) | Identities using operators, Greek letters, set relations, blackboard-bold |
| [01-math.sh](render/math/01-math.sh) | Renders with the bundled math font (`--font math`) registered alongside Latin |
| [01-math.ps1](render/math/01-math.ps1) | PowerShell equivalent |

Registering `--font math` lets pdfnative auto-route math/technical code points to the Noto Sans Math font instead of rendering `.notdef` tofu.

### `render/inspect-layout/` — Layout Introspection (v1.2.0)

| File | Description |
|------|-------------|
| [01-inspect-layout.sh](render/inspect-layout/01-inspect-layout.sh) | `--inspect-layout` emits a `LayoutInspection` JSON report; `--debug-layout` overlays margin/content/cell guides on a PDF |
| [01-inspect-layout.ps1](render/inspect-layout/01-inspect-layout.ps1) | PowerShell equivalent |

`--inspect-layout` replaces the PDF output with a JSON report describing every page's blocks, positions and sizes — ideal for regression-testing layout. `--debug-layout [margins,content,cells]` instead renders a normal PDF with visual guides overlaid.

---

## Page-Tree Samples (v1.2.0)

The engine's page-tree API (pdfnative ≥ 1.5.0) powers three composable document operations. Each ships Bash + PowerShell drivers that render their inputs first, then transform them.

### `merge/` — Concatenate PDFs

| File | Description |
|------|-------------|
| [01-merge.sh](merge/01-merge.sh) | Renders three documents, then merges them into one PDF (sources as positional args) |
| [01-merge.ps1](merge/01-merge.ps1) | PowerShell equivalent |

### `split/` — Split One PDF Into Many

| File | Description |
|------|-------------|
| [multipage.json](split/multipage.json) | Four-page source document |
| [01-split.sh](split/01-split.sh) | Splits per-page (default) and per-range (`--pages 1-2,3-4`) |
| [01-split.ps1](split/01-split.ps1) | PowerShell equivalent |

### `extract/` — Pull Selected Pages

| File | Description |
|------|-------------|
| [01-extract.sh](extract/01-extract.sh) | Extracts pages in arbitrary order (`--pages 4,1-2`; order preserved, repeats allowed) |
| [01-extract.ps1](extract/01-extract.ps1) | PowerShell equivalent |

Page-tree commands (`merge`, `split`, `extract`) also accept `--password` for encrypted sources, `--encrypt [aes-128|aes-256]` (with `--owner-password`) to re-encrypt the output, and `--stream` for constant-memory output — all since pdfnative ≥ 1.6.0.

---

## Text, Forms & Encryption Samples (v1.3.0, pdfnative ≥ 1.6.0)

### `extract-text/` — Reading-Order Text Extraction

| File | Description |
|------|-------------|
| [document.json](extract-text/document.json) | A two-page source document |
| [01-extract-text.sh](extract-text/01-extract-text.sh) | Extracts text as plain text, JSON, and NDJSON (`--runs` for positioned runs) |
| [01-extract-text.ps1](extract-text/01-extract-text.ps1) | PowerShell equivalent |
| [02-actualtext.sh](extract-text/02-actualtext.sh) | (v1.5.0) `/ActualText` (pdfnative 1.8.0): renders `render/multilang/10-indic.json` tagged and untagged, then extracts both — the tagged file returns the logical order of reph and pre-base vowel signs, the untagged one the glyph order |
| [02-actualtext.ps1](extract-text/02-actualtext.ps1) | (v1.5.0) PowerShell equivalent |

No OCR — image-only pages yield empty text. NDJSON (one object per page) streams cleanly into RAG/agent pipelines.

### `fill/` — Fill & Flatten AcroForms

| File | Description |
|------|-------------|
| [form.json](fill/form.json) | An interactive form (text, checkbox, dropdown fields) |
| [form-values.json](fill/form-values.json) | Field name → value map for `--data` |
| [01-fill.sh](fill/01-fill.sh) | Lists fields, **exports a `--data` template** (`--export`), fills them, then flattens |
| [01-fill.ps1](fill/01-fill.ps1) | PowerShell equivalent |

The fill uses an incremental save, so an existing signature stays valid for its revision. `fill --export` dumps the current field values as a ready-to-edit `--data` map (read → edit → fill round-trip).

### `encrypt/` — Encrypt & Decrypt

| File | Description |
|------|-------------|
| [01-encrypt-decrypt.sh](encrypt/01-encrypt-decrypt.sh) | Encrypts (AES-256), confirms with `inspect --encryption`, then decrypts |
| [01-encrypt-decrypt.ps1](encrypt/01-encrypt-decrypt.ps1) | PowerShell equivalent |

Passwords are read from `$PDFNATIVE_ENCRYPT_OWNER_PASS` / `$PDFNATIVE_ENCRYPT_USER_PASS` (or `$PDFNATIVE_PASSWORD` to open), winning over flags (a non-empty env value only) and never logged. `encrypt`/`decrypt` rebuild the page tree (like `merge`), so signatures and form fields are dropped. Add `--stream` (+ `--chunk-size`) to process a large PDF at constant memory.

### `doctor/` — Environment / Capability Preflight

| File | Description |
|------|-------------|
| [01-doctor.sh](doctor/01-doctor.sh) | Human-readable + `--format json` capability report (agent pre-flight) |
| [01-doctor.ps1](doctor/01-doctor.ps1) | PowerShell equivalent |
| [02-capabilities.sh](doctor/02-capabilities.sh) | (v1.5.0) Projects the `fonts` (31 modules / 27 scripts), `unicode` and `conformance` checks with `--fields` — the pre-flight an agent runs before `--pdfx` or `--font lo` |
| [02-capabilities.ps1](doctor/02-capabilities.ps1) | (v1.5.0) PowerShell equivalent |

`doctor` checks the CLI/Node/pdfnative versions, Web Crypto (CSPRNG) availability — which `encrypt` requires — the registered command count and, since v1.5.0, the bundled font inventory (each module probed on disk), the engine's Unicode version and the claimable conformance targets (`pdfa1b,pdfa2b,pdfa2u,pdfa3b,pdfx4`). Exit code 0 when all checks pass, 1 otherwise. Fully offline.

### `render/chart/` — Native Vector Charts

| File | Description |
|------|-------------|
| [01-bar-chart.json](render/chart/01-bar-chart.json) | Multi-series bar chart with legend |
| [02-line-and-pie.json](render/chart/02-line-and-pie.json) | Line chart + donut chart |
| [03-stacked-bars.json](render/chart/03-stacked-bars.json) | (v1.4.0) `stackedBar` / `stackedBarH` with per-segment `dataLabels` (prefix/suffix/decimals) |
| [04-area-scatter.json](render/chart/04-area-scatter.json) | (v1.4.0) `area` with a secondary right axis (`series.yAxis` + `axis2`) and a `scatter` on a linear `xAxis` with a log-scale value axis |
| [05-time-axis.json](render/chart/05-time-axis.json) | (v1.4.0) `line` on a time `xAxis` (ISO 8601 `xValues`) + bar chart with `labelRotation: 45` |

Charts render as pure PDF path operators — zero dependencies, no rasterisation, tagged `/Figure` with alt text. Charts v2 (v1.4.0, pdfnative ≥ 1.7.0) grows the family to 9 types (`bar`, `barH`, `stackedBar`, `stackedBarH`, `line`, `area`, `scatter`, `pie`, `donut`) with dual axes (`axis2`), `xAxis` `category|linear|time`, logarithmic value scale, `dataLabels`, and `labelStride`/`labelRotation`. Series colours accept CMYK since v1.5.0. Rendered by the generator like any other document sample.

---

## Annotate Samples (v1.2.0)

### `annotate/` — Markup Annotations

| File | Description |
|------|-------------|
| [01-annotations.json](annotate/01-annotations.json) | Three markup annotations (highlight, sticky text note, review square) on page 1 |
| [01-annotate.sh](annotate/01-annotate.sh) | Attaches the annotations with an incremental save (original bytes preserved) |
| [01-annotate.ps1](annotate/01-annotate.ps1) | PowerShell equivalent |
| [02-links.json](annotate/02-links.json) | (v1.5.0) Two `link` annotations (`rect` + `url`) — one `https`, one `mailto` |
| [02-link.sh](annotate/02-link.sh) | (v1.5.0) Attaches them, lists them back with `inspect --annotations`, then shows a `javascript:` URL refused with `E_INPUT` |
| [02-link.ps1](annotate/02-link.ps1) | (v1.5.0) PowerShell equivalent |

Annotations are attached with an incremental save, so any existing signature stays intact. Read them back with `inspect --annotations`. `link` URLs go through pdfnative's `validateURL` (`http`, `https`, `mailto` only); a link added to a PDF/X-4 file breaks its claim (see `inspect/09-check-pdfx.*`).

---

## Long-term signatures & document ops Samples (v1.4.0, pdfnative ≥ 1.7.0)

v1.4.0 lights up the sign-side LTV ladder (PAdES B-T → B-LT → B-LTA) and adds document
operations: metadata editing, PDF comparison, manifest pipelines, and print production.

### `metadata/` — Incremental Metadata Update (v1.4.0)

| File | Description |
|------|-------------|
| [document.json](metadata/document.json) | (v1.4.0) Source document with placeholder `/Info` metadata |
| [01-update-metadata.sh](metadata/01-update-metadata.sh) | (v1.4.0) Render → `metadata --title --author` (incremental save — existing signatures stay valid) → `inspect` |
| [01-update-metadata.ps1](metadata/01-update-metadata.ps1) | (v1.4.0) PowerShell equivalent |

`metadata` rewrites `/Info` and keeps the XMP packet in sync (`xmp:ModifyDate`, `pdf:Keywords`, …). Pass a fixed `--mod-date` for reproducible output. Reading metadata stays in `inspect`.

### `compare/` — Text & Structure Diff (v1.4.0)

| File | Description |
|------|-------------|
| [document-a.json](compare/document-a.json) | (v1.4.0) Baseline contract document |
| [document-b.json](compare/document-b.json) | (v1.4.0) Near-identical contract with one changed clause |
| [01-compare.sh](compare/01-compare.sh) | (v1.4.0) Renders both, then `compare` — differences exit 1 (`E_CHECK_FAILED`), identical documents exit 0 |
| [01-compare.ps1](compare/01-compare.ps1) | (v1.4.0) PowerShell equivalent |

`compare` diffs extracted reading-order text and/or structure (`--mode text|structure|both`, `--tolerance`, `--ignore-whitespace`, `--pages`, `--password-a`/`--password-b`). The non-zero exit on difference is the CI feature. Visual/pixel diffing is out of scope (pdfnative has no rasteriser).

### `render/print/` — Print Production & Viewer Preferences (v1.4.0)

| File | Description |
|------|-------------|
| [01-bleed-marks.json](render/print/01-bleed-marks.json) | (v1.4.0) `layout.print` — 9 pt bleed shorthand (derives `/TrimBox`, sets `/BleedBox`), crop + registration marks, `metadata.trapped` |
| [02-viewer-prefs.json](render/print/02-viewer-prefs.json) | (v1.4.0) `layout.viewerPreferences` — duplex, `numCopies`, `printPageRange`, `pickTrayByPDFSize` print-dialog defaults |
| [03-cmyk-colours.json](render/print/03-cmyk-colours.json) | (v1.5.0) CMYK colours — `"c m y k"` (0–1) and `[c,m,y,k]` (percent) on headings, paragraphs, a table and a chart; the content stream carries `k` / `K` operators |
| [04-colour-bars.json](render/print/04-colour-bars.json) | (v1.5.0) `layout.print.marks.colourBars` — printer's colour bars beside the crop and registration marks (`{ tints, size }` form) |
| [05-pdfx4.json](render/print/05-pdfx4.json) | (v1.5.0) A PDF/X-4 brochure body: CMYK text, bleed, trapped |
| [05-pdfx4.sh](render/print/05-pdfx4.sh) | (v1.5.0) `render --pdfx pdfx4 --output-intent-icc synthetic-cmyk.icc --font latin --lang latin --trapped false --strict`, then `inspect --check pdfx` (exit 0), then an `annotate` link that breaks the claim (exit 1) |
| [05-pdfx4.ps1](render/print/05-pdfx4.ps1) | (v1.5.0) PowerShell equivalent |
| [06-gray-pdfx4.json](render/print/06-gray-pdfx4.json) | (v1.5.0) A one-ink press file: **PDF/X-4 under a Gray output intent** (`/N 1`, RGB remapped through `/DefaultRGB`), marks in a 3 mm bleed |
| [06-gray-pdfx4.sh](render/print/06-gray-pdfx4.sh) | (v1.5.0) `render --pdfx pdfx4 --output-intent-icc synthetic-gray.icc … --strict`, `inspect --check pdfx` (exit 0), then the CMYK sample under the same intent: refused by `--strict` (`PDFX_DEVICE_CMYK`) |
| [06-gray-pdfx4.ps1](render/print/06-gray-pdfx4.ps1) | (v1.5.0) PowerShell equivalent |
| [07-tight-bleed-marks.json](render/print/07-tight-bleed-marks.json) | (v1.5.0) Crop marks, registration targets and colour bars in a **3 mm (8.5 pt) bleed** — the 1.8.0 marks clearance: re-centred, shrunk, strokes inside the MediaBox |
| [07-tight-bleed-marks.sh](render/print/07-tight-bleed-marks.sh) | (v1.5.0) Renders it and prints the page boxes (`inspect --pages`) |
| [07-tight-bleed-marks.ps1](render/print/07-tight-bleed-marks.ps1) | (v1.5.0) PowerShell equivalent |
| [03-cmyk-colours.sh](render/print/03-cmyk-colours.sh) | (v1.5.0) Renders `03`, then under `--tagged pdfa2b`: the `PDFA_DEVICE_CMYK_CONTENT` warning, and the `--strict` refusal |
| [03-cmyk-colours.ps1](render/print/03-cmyk-colours.ps1) | (v1.5.0) PowerShell equivalent |
| [04-colour-bars.sh](render/print/04-colour-bars.sh) | (v1.5.0) Renders `04` and prints the page boxes |
| [04-colour-bars.ps1](render/print/04-colour-bars.ps1) | (v1.5.0) PowerShell equivalent |
| [synthetic-cmyk.icc](render/print/synthetic-cmyk.icc) | (v1.5.0) A synthetic ICC v2 `prtr` CMYK profile (from pdfnative's docs) — valid for the validators, **not a press profile** |
| [synthetic-gray.icc](render/print/synthetic-gray.icc) | (v1.5.0) A synthetic ICC v2 `prtr` **Gray** profile (408 bytes, generated by `scripts/lib/synthetic-gray-profile.ts`) — valid for the validators, **not a press profile** |

`01`–`04` and `07` are plain document samples rendered by the generator; `05-pdfx4.json` and `06-gray-pdfx4.json` are rendered with the PDF/X-4 flags and their output profile (`scripts/lib/sample-plan.ts`, `FILE_FLAGS` + `FILE_ICC`). `layout.print` also accepts explicit `trimBox`/`bleedBox`/`artBox`/`cropBox` and `userUnit`; an `outputIntent` (ICC RGB for PDF/A-style characterisation, ICC `prtr` CMYK for PDF/X) can be declared in the JSON as a number array or passed with `--output-intent-icc`.

### `render/typography/` — The Typography Engine (v1.5.0)

| File | Description |
|------|-------------|
| [01-paragraph-breaking.json](render/typography/01-paragraph-breaking.json) | `layout.typography.widows` / `orphans`, `keepWithNext` on headings, `splittable` paragraphs — long paragraphs break across pages without a stranded line |
| [02-justify-optical-hyphenation.json](render/typography/02-justify-optical-hyphenation.json) | `align: "justify"`, `opticalMargins`, `hyphenationLanguage`, soft hyphens (U+00AD break opportunities, always honoured) |
| [03-french-spacing-units-short-words.json](render/typography/03-french-spacing-units-short-words.json) | `punctuationSpacing: "fr"` (narrow no-break space before `; : ! ?`, inside guillemets), `unitBinding` (`150 €`, `20 %` never break), short-word rules — the demonstrated content is French (`demo-language: fr`) |
| [04-kerning-features-metrics.json](render/typography/04-kerning-features-metrics.json) | `kerning`, OpenType `fontFeatures` (`onum`, `smcp`); the `metrics: "exact"` key it carries is inert here (a registered font measures the text) — see `render/base14/` |
| [05-french-canadian-spacing.json](render/typography/05-french-canadian-spacing.json) | `punctuationSpacing: "fr-CA"` — the Canadian convention (no-break space before the colon and inside guillemets, nothing before `; ! ?`); a different file from the `"fr"` preset of `03` |
| [06-custom-spacing-rules.json](render/typography/06-custom-spacing-rules.json) | `punctuationSpacing` as an explicit `PunctuationSpacingRule[]` (`{ char, side, space: "nbsp" \| "narrow" }`) — a house style for `%`, `°`, `§` and the em dash |
| [07-soft-hyphen-keep-with-next.json](render/typography/07-soft-hyphen-keep-with-next.json) | Soft hyphens (U+00AD) in a justified paragraph, `orphans` / `widows`, `keepHeadingsWithNext: { minLines }`, and the per-block keys `keepWithNext: true` and `splittable: false` |
| [05-spacing-and-keep-rules.sh](render/typography/05-spacing-and-keep-rules.sh) | (v1.5.0) Renders `05`–`07`, extracts the no-break spaces of `05` (`extract-text --format json`), and writes the page map of `07` (`render --inspect-layout`) |
| [05-spacing-and-keep-rules.ps1](render/typography/05-spacing-and-keep-rules.ps1) | (v1.5.0) PowerShell equivalent |
| [01-typography.sh](render/typography/01-typography.sh) | Renders all four with `--font latin --lang latin`, then re-renders `01` with the flags `--split-paragraphs --keep-headings-with-next --kerning --font-features onum,smcp` and shows `--inspect-layout` |
| [01-typography.ps1](render/typography/01-typography.ps1) | PowerShell equivalent |

Every typography option lives in `layout.typography` (JSON, `--layout` file or the four flags; flags win, nested objects merge one level). Requesting a feature the font cannot honour (`tnum` on a font without the table) emits `TYPOGRAPHY_FEATURE_INEFFECTIVE` — a warning, or `E_CHECK_FAILED` under `--strict`. Tagged output carries `/ActualText`, so `extract-text` returns the source text, not the inserted spaces.

### `render/base14/` — The Base-14 Path (v1.5.0)

| File | Description |
|------|-------------|
| [01-exact-metrics.json](render/base14/01-exact-metrics.json) | `layout.typography.metrics: "exact"` — Adobe Core 14 widths for Helvetica. Rendered with **no** `--font` flag: the option only acts where no registered font measures the text |
| [01-exact-metrics.sh](render/base14/01-exact-metrics.sh) | Renders it as is, then with `--font latin --lang latin` to show the option no longer acts |
| [01-exact-metrics.ps1](render/base14/01-exact-metrics.ps1) | PowerShell equivalent |

The category has no flags in `scripts/lib/sample-plan.ts` on purpose (`tests/tools/sample-plan.test.ts` holds it to that).

### `render/reproducible/` — Byte-Reproducible Output (v1.5.0)

| File | Description |
|------|-------------|
| [01-pinned-date.json](render/reproducible/01-pinned-date.json) | A document with a `{date}` header placeholder, rendered with the global `--creation-date 2026-01-01T00:00:00Z` |
| [02-source-date-epoch.json](render/reproducible/02-source-date-epoch.json) | The same document, rendered with `SOURCE_DATE_EPOCH=1767225600` (the same instant) — the baseline lists the two outputs as an identical pair |
| [01-double-render.sh](render/reproducible/01-double-render.sh) | **The proof**: renders `01` under `TZ=Europe/Paris` and `TZ=UTC`, compares the SHA-256 (exit 1 if they differ), renders once more through `SOURCE_DATE_EPOCH`, then renders without a pin to show the bytes vary |
| [01-double-render.ps1](render/reproducible/01-double-render.ps1) | PowerShell equivalent |

`--creation-date` (or `SOURCE_DATE_EPOCH`) pins `/CreationDate`, `xmp:CreateDate`, the `{date}` placeholder and the trailer `/ID`, all in UTC. Encrypted output is never reproducible (CSPRNG keys), and a signed file's incremental revision carries a per-revision `/ID` — the baseline fingerprints those semantically.

### Network-dependent samples

The timestamp / LTV samples ([sign/06-timestamp.*](sign/06-timestamp.sh),
[sign/08-ltv.*](sign/08-ltv.sh) and [sign/10-timestamp-timeout.*](sign/10-timestamp-timeout.sh))
run **offline by default**: they always perform the
offline part (render → PAdES B-B sign) and only exercise the network — through the
CLI's SSRF-guarded client — when the `PDFNATIVE_TSA_URL` environment variable points
at an RFC 3161 TSA. Without it, the network rungs are printed as explained commands.
Network access in pdfnative-cli is always an explicit opt-in (`sign --timestamp`,
`doc-timestamp --url`, `ltv --online`, `verify --revocation online`,
`batch --allow-network`).

---

## Govern Samples — AI Governance / HITL (v1.2.0)

### `govern/` — Human-in-the-Loop Contract

| File | Description |
|------|-------------|
| [draft-good.md](govern/draft-good.md) | A compliant issue draft (repro block + environment; no runtime dependency) |
| [draft-bad.md](govern/draft-bad.md) | A non-compliant draft (proposes `npm install …`, no repro) |
| [01-rules.sh](govern/01-rules.sh) | Prints the human/agent protocol (`govern rules`) and machine policy (`govern policy`) |
| [01-rules.ps1](govern/01-rules.ps1) | PowerShell equivalent |
| [02-verify-issue.sh](govern/02-verify-issue.sh) | Gates a draft: PASS (exit 0) for the compliant one, BLOCK (exit 1, `E_POLICY`) for the bad one |
| [02-verify-issue.ps1](govern/02-verify-issue.ps1) | PowerShell equivalent |

Agents act as **draftsmen**: `govern verify-issue` is a local pre-flight, but a **human** must always review and submit under their own GitHub identity. Nothing here touches the network.

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
| [sign/05-cert-chain.sh](sign/05-cert-chain.sh) | (v1.1.0) Build a root-CA → signer chain, sign with `--cert-chain`, then `verify --trust <root>` |
| [sign/05-cert-chain.ps1](sign/05-cert-chain.ps1) | (v1.1.0) PowerShell equivalent |
| [sign/06-timestamp.sh](sign/06-timestamp.sh) | (v1.4.0) PAdES B-T — `sign --timestamp <tsa> --profile pades` embeds a verified RFC 3161 token at signing time (network only when `PDFNATIVE_TSA_URL` is set) |
| [sign/06-timestamp.ps1](sign/06-timestamp.ps1) | (v1.4.0) PowerShell equivalent |
| [sign/07-native-crypto.sh](sign/07-native-crypto.sh) | (v1.2.0) Signs the same PDF with native `node:crypto` (default) and pure-JS (`--pure-crypto`), verifying both |
| [sign/07-native-crypto.ps1](sign/07-native-crypto.ps1) | (v1.2.0) PowerShell equivalent |
| [sign/08-ltv.sh](sign/08-ltv.sh) | (v1.4.0) The full PAdES ladder — B-B → B-T (`--timestamp`) → B-LT (`ltv add --online`) → B-LTA (`doc-timestamp --url`); offline by default |
| [sign/08-ltv.ps1](sign/08-ltv.ps1) | (v1.4.0) PowerShell equivalent |
| [sign/09-multiple-signatures.sh](sign/09-multiple-signatures.sh) | (v1.4.0) Two signers on one PDF with `--allow-multiple` / `--field-name`, inventoried with `inspect --signatures` and both verified — fully offline |
| [sign/09-multiple-signatures.ps1](sign/09-multiple-signatures.ps1) | (v1.4.0) PowerShell equivalent |
| [sign/10-timestamp-timeout.sh](sign/10-timestamp-timeout.sh) | (v1.5.0) `sign --timestamp <tsa> --timestamp-timeout <ms>` — a bounded TSA round-trip reported as `timestamp.timeoutMs`; the `--dry-run` never opens a socket; network only when `PDFNATIVE_TSA_URL` is set |
| [sign/10-timestamp-timeout.ps1](sign/10-timestamp-timeout.ps1) | (v1.5.0) PowerShell equivalent |

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
| [inspect/05-pdfua.sh](inspect/05-pdfua.sh) | (v1.1.0) PDF/UA (ISO 14289-1) structural validation gate via `--check pdfua` |
| [inspect/05-pdfua.ps1](inspect/05-pdfua.ps1) | (v1.1.0) PowerShell equivalent |
| [inspect/06-check-signed-encrypted.sh](inspect/06-check-signed-encrypted.sh) | (v1.1.0) CI gates for `--check encrypted` (PASS) and `--check signed` (FAIL on unsigned) |
| [inspect/06-check-signed-encrypted.ps1](inspect/06-check-signed-encrypted.ps1) | (v1.1.0) PowerShell equivalent |
| [inspect/07-annotations.sh](inspect/07-annotations.sh) | (v1.2.0) Render → annotate → `inspect --annotations` to list markup + link annotations |
| [inspect/07-annotations.ps1](inspect/07-annotations.ps1) | (v1.2.0) PowerShell equivalent |
| [inspect/08-list-signatures.sh](inspect/08-list-signatures.sh) | (v1.4.0) `inspect --signatures` JSON inventory + `--check "signatures>=N"` CI gates (pass and clean-fail shown) — fully offline |
| [inspect/08-list-signatures.ps1](inspect/08-list-signatures.ps1) | (v1.4.0) PowerShell equivalent |
| [inspect/09-check-pdfx.sh](inspect/09-check-pdfx.sh) | (v1.5.0) Render a PDF/X-4 file, `inspect --pdfx --fields pdfx.valid,pdfxConformance` and `--check pdfx` (exit 0); then `annotate` a link and watch the claim fail (exit 1, `E_CHECK_FAILED`) |
| [inspect/09-check-pdfx.ps1](inspect/09-check-pdfx.ps1) | (v1.5.0) PowerShell equivalent |
| [inspect/10-iso-dates.sh](inspect/10-iso-dates.sh) | (v1.5.0) `inspect --iso-dates` — `metadata.creationDate` / `modDate` as ISO 8601 instead of `D:YYYYMMDD…` (pinned with `--creation-date` so the value is predictable) |
| [inspect/10-iso-dates.ps1](inspect/10-iso-dates.ps1) | (v1.5.0) PowerShell equivalent |

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
| [verify/06-online-revocation.sh](verify/06-online-revocation.sh) | (v1.1.0) Offline-by-default verify, with a commented SSRF-guarded `--revocation online` variant |
| [verify/06-online-revocation.ps1](verify/06-online-revocation.ps1) | (v1.1.0) PowerShell equivalent |
| [verify/07-weak-digest.sh](verify/07-weak-digest.sh) | (v1.5.0) Shows `timestampDigest` in the report and the `weak digest: RFC 3161 messageImprint uses SHA-1` note a legacy token produces; under `--strict` such a timestamp fails (`E_VERIFY_FAILED`) — fully offline |
| [verify/07-weak-digest.ps1](verify/07-weak-digest.ps1) | (v1.5.0) PowerShell equivalent |

**Scope:** verify checks **integrity** (byte-range SHA-256), **CMS signature value** (RSA-PKCS#1 v1.5 — SHA-256/384/512 since v1.4.0 — and ECDSA-SHA256 over P-256), **certificate chain signatures**, **trust** (against `--trust <root.pem>` PEM roots, or self-signed acceptance), **RFC 3161 timestamp validation (PAdES-T)**, and **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded from the PDF `/DSS` offline by default, with opt-in SSRF-guarded online fetching via `--revocation online`. Since v1.4.0 each signature also reports its `fieldName`, and `/DocTimeStamp` revisions (PAdES B-LTA) are validated as RFC 3161 tokens (`isDocTimestamp: true`); since v1.5.0 each timestamp reports its `timestampDigest` and a SHA-1 imprint is refused under `--strict`. Sign-side LTV **shipped in v1.4.0** — see [sign/06-timestamp.*](sign/06-timestamp.sh), [sign/08-ltv.sh](sign/08-ltv.sh), and [SECURITY.md](../SECURITY.md#network-access-opt-in-only).

---

## Batch Samples (v1.0.0)

Demonstrate the `pdfnative batch` command — renders every `*.json` in a directory to `<output-dir>/<name>.pdf` in parallel, reusing the full render pipeline. Exits non-zero if any file fails.

| Script | Description |
|--------|-------------|
| [batch/01-batch.sh](batch/01-batch.sh) | Batch-render `render/document/*.json` with `--concurrency 4 --compress` (Bash) |
| [batch/01-batch.ps1](batch/01-batch.ps1) | PowerShell equivalent |
| [batch/02-fail-fast.sh](batch/02-fail-fast.sh) | (v1.1.0) `--fail-fast` aborts on the first failure (one valid + one invalid input); asserts non-zero exit |
| [batch/02-fail-fast.ps1](batch/02-fail-fast.ps1) | (v1.1.0) PowerShell equivalent |
| [batch/03-manifest.sh](batch/03-manifest.sh) | (v1.4.0) `batch --manifest` — declarative render → encrypt → inspect pipeline; fully offline (network flags in a manifest require `--allow-network`) |
| [batch/03-manifest.ps1](batch/03-manifest.ps1) | (v1.4.0) PowerShell equivalent |
| [batch/manifest/tasks.json](batch/manifest/tasks.json) | (v1.4.0) The pipeline manifest (schema subject `batch-manifest`) — `"@id"` flag values reference an earlier task's output |
| [batch/manifest/report.json](batch/manifest/report.json) | (v1.4.0) Document definition rendered by the manifest's first task |

In directory mode, render flags other than `--input-dir` / `--output-dir` / `--concurrency` / `--fail-fast` / `--format` are forwarded to every file. In manifest mode (v1.4.0), tasks run sequentially and may use the 14 whitelisted manifest commands (of the 21 commands); add `--continue-on-error` to keep going past a failure (tasks depending on it via `@` are skipped). A global `--creation-date` pins every task of the run (v1.5.0).

---

## Agent Samples (v1.1.0)

Demonstrate the agent-native contract — see [../docs/AGENT_CONTRACT.md](../docs/AGENT_CONTRACT.md).

| Script | Description |
|--------|-------------|
| [agent/01-json-and-dry-run.sh](agent/01-json-and-dry-run.sh) | `--json` status envelope on stderr + `--dry-run` validation without output |
| [agent/02-schema.sh](agent/02-schema.sh) | `schema list` / `schema render` / `schema manifest` — self-description before invoking |
| [agent/03-error-envelope.sh](agent/03-error-envelope.sh) | Deterministic failures: the `{ ok: false, error: { code } }` envelope and the 12 stable error codes |
| [agent/04-token-economy.sh](agent/04-token-economy.sh) | `--summary`, `--fields` and compact JSON — ~90 % smaller stdout |
| [agent/05-global-flags-first.sh](agent/05-global-flags-first.sh) | (v1.5.0) `pdfnative --json --dry-run render …` and `pdfnative --creation-date … render …` — global flags before the command name |

Each script has a `.ps1` twin.

---

## Completion Samples (v1.0.0)

Demonstrate the `pdfnative completion` command — emits shell-completion scripts for **bash**, **zsh**, **fish**, and **powershell**.

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
| [streaming/01-large-document.js](streaming/01-large-document.js) | Generates a 200-section document via the `--stream` render path |
| [streaming/02-page-by-page.sh](streaming/02-page-by-page.sh) | (v1.0.0) `--stream-page-by-page` — emit one page at a time (bounded memory; no TOC) |
| [streaming/02-page-by-page.ps1](streaming/02-page-by-page.ps1) | PowerShell equivalent |
| [streaming/03-true-streaming.sh](streaming/03-true-streaming.sh) | (v1.1.0) `--stream-true` — fully incremental streaming render |
| [streaming/03-true-streaming.ps1](streaming/03-true-streaming.ps1) | PowerShell equivalent |

```bash
node samples/streaming/01-large-document.js
bash samples/streaming/02-page-by-page.sh
bash samples/streaming/03-true-streaming.sh
```

---

## Generating every sample (the baseline)

```
npm run build && npm run test:generate          # every sample → test-output/samples/
npx tsx scripts/generate-samples.ts --category <name>   # one category (render/<name>/ or a command family)
npx tsx scripts/verify-samples.ts [--strict] [--json]   # compare with the committed baseline
npx tsx scripts/verify-samples.ts --update      # rebaseline — declare it in the release note
```

`scripts/generate-samples.ts` (v1.5.0, replaces `run-all.js`) clears `test-output/samples/`
and drives the **built** CLI (`dist/cli.cjs`, or `PDFNATIVE_CLI`) under `TZ=UTC` with the
creation instant pinned twice — `--creation-date 2026-01-01T00:00:00Z` and
`SOURCE_DATE_EPOCH=1767225600` — so every run yields the same 91 sample PDFs. The plan is
`scripts/lib/sample-plan.ts`: per-category flags (`pdfa` / `attachments` → `--font latin
--lang latin --tagged …`, `typography` → `--font latin --lang latin`, `base14` → none on purpose, `print/05-pdfx4.json`
and `06-gray-pdfx4.json` → the PDF/X-4 flags and their output profile, the `multilang` families
→ their `--font` / `--lang` lists, …), the multilang driver scripts, deterministic passwords for the encryption samples,
and the derived steps (`merge` / `split` / `extract`, `annotate`, `fill`, `metadata`,
`encrypt` / `decrypt`, `sign` with the committed test key pair and `--signing-time`).

**Skipped:** `watch/` (never exits), `template/` (partial payloads), `outline/02-outline-tree.json`
(not a document), `multilang/03-thai.json` and `04-multilingual.json` (rendered by their Node
driver scripts, which the generator runs too). Network samples (`sign --timestamp`, `doc-timestamp`,
`ltv --online`) are out of the corpus by design.

The baseline `tests/regression/baselines/samples.sha256.json` records a SHA-256 per sample —
byte-exact for plain output, a canonical projection for the encrypted and signed ones — and
the release each hash dates from (`since`). `tests/regression/samples.test.ts` and the
`sample-regression` workflow hold every run to it.

---

## Integration Patterns

### npm script in `package.json`

```json
{
  "scripts": {
    "build:pdf": "pdfnative render --input data/document.json --output dist/report.pdf",
    "build:pdf:archive": "pdfnative render --input data/document.json --output dist/report.pdf --tagged pdfa2b"
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

> `SvgBlock` is fully usable from JSON (its `data` field is an SVG **string**, pdfnative ≥ 1.5.0). `ImageBlock` is JSON-usable since v1.4.0 via `src` (a JPEG/PNG path, resolved relative to the `--input` JSON's directory) or `dataBase64` (inline base64).

---

## See Also

- [../README.md](../README.md) — Installation, quick start, command reference
- [../docs/KNOWLEDGE_BASE.md](../docs/KNOWLEDGE_BASE.md) — Full CLI documentation, architecture, FAQ
- [../docs/AGENT_CONTRACT.md](../docs/AGENT_CONTRACT.md) — The process contract for autonomous agents
- [pdfnative library](https://github.com/Nizoka/pdfnative) — Core PDF generation engine (Node.js API with more features)
