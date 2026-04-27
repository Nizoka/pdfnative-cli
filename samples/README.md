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
│   └── pdfa/                     PDF/A archival conformance
├── sign/                         Digital signature shell / PowerShell scripts
├── inspect/                      PDF inspection shell / PowerShell scripts
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

PDF/A conformance can also be set from the CLI via the `--conformance` flag instead of the JSON `layout.tagged` field:

```bash
pdfnative render --input doc.json --output doc.pdf --conformance pdfa2b
```

---

## Sign Samples

Demonstrate the `pdfnative sign` command. Both Unix shell and PowerShell scripts are provided.

| Script | Description |
|--------|-------------|
| [sign/01-basic.sh](sign/01-basic.sh) | Render a PDF, generate a self-signed certificate, then sign it (Bash) |
| [sign/01-basic.ps1](sign/01-basic.ps1) | Same workflow for Windows PowerShell |

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

Examples:

```bash
# Render only barcode samples
node samples/run-all.js --category barcode

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
