# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
