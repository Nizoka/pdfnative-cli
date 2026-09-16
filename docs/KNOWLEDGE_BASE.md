# pdfnative-cli — Knowledge Base

> This document is structured for AI assistants (GitHub Copilot, Claude, Cursor, Continue, Zed).  
> It provides the full context needed to understand, extend, and debug pdfnative-cli without reading all source files.

---

## 1. Context

**What is pdfnative-cli?**
The official command-line interface for [`pdfnative`](https://github.com/Nizoka/pdfnative) — a zero-dependency, ISO 32000-1 compliant PDF generation library. The CLI exposes 21 commands, grouped by purpose (the global `--help` shows the same grouping):

| Group | Commands |
|-------|----------|
| Create & edit | `render`, `fill`, `annotate`, `metadata` |
| Page tree | `merge`, `split`, `extract` |
| Security | `sign`, `verify`, `ltv`, `doc-timestamp`, `encrypt`, `decrypt` |
| Read & extract | `inspect`, `extract-text`, `compare` |
| Automation & meta | `batch`, `doctor`, `schema`, `completion`, `govern` |

`schema` (self-validation + capability manifest) and `doctor` (capability pre-flight) support agent automation.

**Philosophy:**
- Zero extra runtime dependencies — `pdfnative` (`^1.8.0`) is the *only* dependency, and every symbol enters through `src/core-bridge/index.ts`.
- Pure dispatch layer — no PDF logic lives in the CLI itself.
- Composable — every command reads from stdin and writes to stdout by default.
- Offline by default — network I/O only on explicit opt-in flags (`sign --timestamp`, `doc-timestamp --url`, `ltv --online`, `verify --revocation online`, `batch --allow-network`), always through the SSRF guard.
- Reproducible (v1.5.0) — the global `--creation-date` / `SOURCE_DATE_EPOCH` pins every date in UTC, so the same input yields byte-identical output on every host; the repository's sample corpus is held to a committed SHA-256 baseline.
- Agent-first — stdout = artifact, stderr = envelopes, 12 stable error codes, global flags before or after the command; the consumer contract is [AGENT_CONTRACT.md](AGENT_CONTRACT.md).

**Targets:** Node.js ≥ 22 (Node 20 is EOL), Bun, Deno (via `node dist/cli.cjs`)

**Repository:** https://github.com/Nizoka/pdfnative-cli  
**npm:** https://www.npmjs.com/package/pdfnative-cli  
**Parent library:** https://github.com/Nizoka/pdfnative

---

## 2. Architecture

```
src/
├── index.ts              # Entry: parse argv (global flags before OR after the command) → config merge
│                         #   → --creation-date pin (setDefaultCreationDate) → loadCommand() → process.exit
├── commands/
│   ├── render.ts         # JSON → PDF (buildDocumentPDF*, fonts + --font-file, PDF/A, PDF/X-4, typography, streaming, outline, layout inspect)
│   ├── sign.ts           # PDF + key/cert → addSignaturePlaceholder → signPdfBytes (native node:crypto default; --timestamp-timeout)
│   ├── inspect.ts        # PDF → PdfReader → metadata JSON/text (+ annotations, page labels, --pdfua, --pdfx, --iso-dates)
│   ├── verify.ts         # PDF → CMS + timestamp (PAdES-T) + OCSP/CRL revocation
│   ├── merge.ts          # Several PDFs → mergePdfs → combined PDF (+ password/encrypt/stream)
│   ├── split.ts          # One PDF → splitPdf → many PDFs (per-page or per-range)
│   ├── extract.ts        # One PDF + --pages → extractPages → new PDF
│   ├── extract-text.ts   # PDF → extractText → reading-order text (text|json|ndjson)
│   ├── fill.ts           # AcroForm → fillForm/flattenForm/readFormFields (fill|flatten|export)
│   ├── encrypt.ts        # PDF → page-tree re-encryption (AES-128/256)
│   ├── decrypt.ts        # Encrypted PDF + --password → plaintext copy
│   ├── annotate.ts       # PDF + --annotations → createModifier + buildAnnotationBody / a /Link body (validateURL) → incremental save
│   ├── metadata.ts       # (v1.4.0) /Info + XMP update → modifier.updateMetadata → incremental save
│   ├── ltv.ts            # (v1.4.0) PAdES B-LT: collect | embed | add — /DSS + /VRI validation data
│   ├── docTimestamp.ts   # (v1.4.0) PAdES B-LTA: /DocTimeStamp via addDocumentTimestamp (--url opt-in)
│   ├── compare.ts        # (v1.4.0) Text + structural diff of two PDFs (E_CHECK_FAILED on difference)
│   ├── govern.ts         # AI-governance / HITL: rules | policy | verify-issue
│   ├── schema.ts         # Versioned JSON Schemas (Draft 2020-12) + capability manifest
│   ├── batch.ts          # Directory of JSON → parallel render, or --manifest task pipeline (v1.4.0)
│   ├── completion.ts     # bash/zsh/fish/powershell completion scripts
│   └── doctor.ts         # Environment / capability preflight (text | --json; fonts, unicode, conformance since v1.5.0)
├── utils/
│   ├── args.ts           # Zero-dep argument parser (booleanFlags table for the global flags)
│   ├── argv.ts           # (v1.5.0) splitCommandArgv — finds the command wherever the global flags sit
│   ├── io.ts             # stdin/stdout/file I/O helpers, path-traversal guard, readBinaryFileCapped
│   ├── fonts.ts          # (v1.5.0) BUNDLED_FONT_MODULES (31 modules / 27 scripts), FONT_ALIASES, --font-file loading + validation
│   ├── reproducible.ts   # (v1.5.0) --creation-date / SOURCE_DATE_EPOCH resolution (strict; invalid → exit 2)
│   ├── build-errors.ts   # (v1.5.0) classifyBuildError — the engine's PDF/X / print / OutputIntent coherence messages → E_INPUT
│   ├── pdfdate.ts        # (v1.5.0) pdfDateToIso — D:YYYYMMDDHHmmSS+HH'mm' → ISO 8601 (inspect --iso-dates)
│   ├── config.ts         # `.pdfnativerc.json` discovery + flag-default merge
│   ├── colors.ts         # NO_COLOR/TTY-aware ANSI helper
│   ├── pages.ts          # 1-based page-list / page-range parsing (zero-dep)
│   ├── pdfops.ts         # page-tree helpers: max-output-size/chunk-size parsing, source-path
│   │                     #   collection (traversal guard), password/encrypt resolution, mapPdfError
│   ├── version.ts        # bundle-safe CLI version resolution (name-guarded package.json probe)
│   ├── governance.ts     # AI-governance policy + AGENT_RULES text + pure draft validator
│   ├── layout.ts         # Layout option composer (CLI flags + --layout / --debug-layout merge; PDF/X, output intent, typography,
│   │                     #   reviveLayoutJson + mergeNestedLayout — v1.5.0)
│   ├── keys.ts           # PEM / PEM-chain loader + native node:crypto provider (key redaction on error)
│   ├── asn1-walk.ts      # ASN.1/DER walker with absolute byte offsets (50 MiB cap)
│   ├── cms-verify.ts     # RSA/ECDSA CMS + verifySignedStructure (CRL/OCSP)
│   ├── cert-chain.ts     # X.509 chain construction + trust evaluation
│   ├── timestamp-verify.ts # RFC 3161 timestamp validation (PAdES-T)
│   ├── revocation.ts     # OCSP (RFC 6960) + CRL (RFC 5280), DSS + online
│   ├── fetch-guard.ts    # SSRF-guarded HTTP(S) client (every opt-in network path goes through it)
│   ├── tsa.ts            # (v1.4.0) RFC 3161 TSA provider (TimestampProvider injected into pdfnative)
│   ├── ltv-provider.ts   # (v1.4.0) OCSP/CRL RevocationProvider for `ltv` (AIA / CDP fetch via fetch-guard)
│   ├── manifest.ts       # (v1.4.0) batch --manifest: parse/validate tasks.json, @id refs, network gate
│   ├── agent.ts          # --json envelopes, stable-code default messages, dry-run helpers
│   ├── projection.ts     # Token economy: --summary / --fields / compact JSON
│   └── error.ts          # CliError class + die() + deprecate() helpers (stable E_* codes)
└── core-bridge/
    └── index.ts          # Selective re-exports from pdfnative (one `(pdfnative X.Y.Z)` block per engine release; pdfnative/tools too)

scripts/                  # (v1.5.0) repository tooling — TypeScript, run with tsx, never shipped
├── gate.ts               # THE quality gate: STEPS table, profiles fast / ci / publish, --only, --json, --require-all
├── generate-samples.ts   # Sample corpus over the BUILT CLI (generators/render|drivers|derived.ts, plan in lib/sample-plan.ts)
├── verify-samples.ts     # Byte/semantic fingerprints vs tests/regression/baselines/samples.sha256.json (lib/sample-fingerprint.ts)
├── generate-pdfa-corpus.ts, validate-pdfa.ts, validate-pdfx.ts   # Conformance corpus (lib/pdfa-corpus.ts, lib/verapdf.ts, lib/pdfx.ts)
├── verify-docs.ts        # 25 documentation rules over docs/assets/ecosystem.json (lib/cli-surface.ts, lib/agent-config.ts, lib/prose-language.ts)
├── release-prepare.ts    # One-pass version bump; build-claude-rules.ts → .claude/rules/; helpers/{tz,io,cli}.ts
tests/
├── commands/ utils/ integration/ tools/ regression/ docs/   # vitest suites (helpers/cli-harness.ts, fixtures/)
├── helpers/der.ts + mock-pki.ts   # (v1.4.0) Offline mock PKI: in-process RFC 3161 TSA + OCSP/CRL responders
└── regression/baselines/samples.sha256.json   # (v1.5.0) the sample baseline — 79 entries, chained by `since`
```

### Data Flow

```
process.argv
    │
    ▼
src/index.ts
  parseArgs(argv, { booleanFlags })   ← src/utils/args.ts (global flags never swallow the command name)
  splitCommandArgv()                  ← src/utils/argv.ts (the command may follow the global flags)
  applyConfigDefaults()               ← src/utils/config.ts
  setDefaultCreationDate()            ← --creation-date / SOURCE_DATE_EPOCH (src/utils/reproducible.ts), process-wide
  loadCommand(command)
    │
    ├── render   → src/commands/render.ts
    │               readFileOrStdin(--input)
    │               JSON.parse (50 MB cap) → reviveLayoutJson (attachments, ICC arrays, creationDate)
    │               buildLayoutOptions (flags + --layout, nested typography/outputIntent merge, PDF/X pre-checks)
    │               applyFontFlags / loadCustomFonts (--font, --lang, --font-file) → fontEntries
    │               buildDocumentPDFBytes (or a stream* builder) — build errors → classifyBuildError → E_INPUT
    │               writeOutput(--output or stdout); emitStatus (pdfx, creationDate, diagnostics)
    │
    ├── sign     → src/commands/sign.ts
    │               readFileOrStdin(--input) [PDF bytes]
    │               loadSecret(PDFNATIVE_SIGN_KEY env || --key file)
    │               loadSecret(PDFNATIVE_SIGN_CERT env || --cert file)
    │               signPdfBytes(pdf, { rsaKey, signerCert, algorithm: 'rsa-sha256' })
    │               writeOutput(--output or stdout)
    │
    └── inspect  → src/commands/inspect.ts
                    readFileOrStdin(--input) [PDF bytes]
                    openPdf(bytes) → PdfReader
                    extract: version, pageCount, encrypted, pdfaConformance, signatures, metadata
                    JSON.stringify or text table → process.stdout.write
    │
    └── verify   → src/commands/verify.ts
                    readFileOrStdin(--input) [PDF bytes]
                    openPdf(bytes) → PdfReader
                    extract CMS signatures → verify byte-range SHA-256
                    verifyCertSignature() per signer → trust evaluation against --trust roots
                    JSON.stringify or text table → process.stdout.write
                    --strict → exit 1 on any failure or zero signatures
```

---

## 3. Core Concepts

### Zero-Dep Arg Parser (`src/utils/args.ts`)

```typescript
type ParsedArgs = {
    readonly flags: Record<string, string | boolean>;
    readonly positionals: string[];
};

function parseArgs(argv: string[], options?: { booleanFlags?: ReadonlySet<string> }): ParsedArgs
```

Handles:
- `--flag value` → `flags.flag = 'value'`
- `--flag=value` → `flags.flag = 'value'`
- `-f value` → `flags.f = 'value'` (single dash, one char)
- `--flag` (no following value) → `flags.flag = true`
- a flag listed in `booleanFlags` never consumes the next token (`GLOBAL_BOOLEAN_FLAGS` in
  `args.ts`: `help`, `h`, `version`, `V`, `json`, `dry-run`, `quiet`, `q`, `no-color`,
  `no-config`), so `pdfnative --json render …` keeps `render` positional (v1.5.0)
- `--` → everything after goes into `positionals`
- Positional args (no leading `--`/`-`) → `positionals[]`

`splitCommandArgv(argv)` (`src/utils/argv.ts`) returns `{ commandName, commandArgv }` — the
first non-flag token is the command wherever the global flags sit before it.

Helper: `getFlag(flags, ...names): string | boolean | undefined` — returns first matching flag.

### Core Bridge (`src/core-bridge/index.ts`)

Re-exports the minimum pdfnative surface needed by commands:

```typescript
// Render
export { buildDocumentPDFBytes, buildDocumentPDFStream, buildPDFBytes, buildPDFStream } from 'pdfnative';
// Sign
export { signPdfBytes, parseRsaPrivateKey, parseCertificate, pemToDer } from 'pdfnative';
// Inspect / Verify
export { openPdf, verifyCertSignature } from 'pdfnative';
// Font loading (multilingual)
export { registerFont, registerFonts, loadFontData, hasFontLoader } from 'pdfnative';
// Types
export type { DocumentParams, PdfParams, PdfLayoutOptions, FontEntry, FontData, PdfSignOptions, PdfReader, RsaPrivateKey, X509Certificate } from 'pdfnative';
// (pdfnative 1.8.0) — PDF/X, reproducible dates, URLs, fonts
export { PDF_X_CONFORMANCE_TARGETS, validatePdfX, setDefaultCreationDate, getDefaultCreationDate, validateURL, USE_UNICODE_VERSION, validateFontData } from 'pdfnative';
export { parseFontData } from 'pdfnative/tools';
export type { PdfXConformanceTarget, PdfXValidationResult, TypographyOptions, ColourBarOptions, PdfCmykTuple, PdfCmykString, LinkAnnotation, FontValidationResult, FontDataObject } from 'pdfnative';
```

This keeps the rest of the CLI decoupled from pdfnative internal paths: a command or util
never imports `pdfnative` directly, and each engine release adds one labelled block.

### CliError (`src/utils/error.ts`)

```typescript
class CliError extends Error {
    constructor(message: string, public readonly exitCode: number = 1) { ... }
}

function die(message: string, exitCode = 1): never
```

Exit code conventions:
- `0` — success
- `1` — runtime error (invalid JSON, I/O error, PDF parse failure)
- `2` — usage error (missing required flag)

### I/O Helpers (`src/utils/io.ts`)

```typescript
// Read from stdin as a Buffer
function readStdin(): Promise<Buffer>

// Read from file path OR stdin if path is undefined
function readFileOrStdin(filePath?: string): Promise<Buffer>

// Write Uint8Array to file OR stdout if filePath is undefined
function writeOutput(data: Uint8Array, filePath?: string): Promise<void>

// Validate a path against traversal attacks
function validatePath(p: string): void  // throws CliError if ../  found
```

---

## 4. CLI Commands — Full Reference

### `render`

**Purpose:** Convert a `DocumentParams` JSON file to a PDF.

```bash
pdfnative render [--input <file.json>] [--output <out.pdf>] [--stream|--stream-page-by-page|--stream-true] [--tagged pdfa2b | --pdfx pdfx4 --output-intent-icc <cmyk.icc>] [--font <code>] [--lang <code>] [--font-file <ttf>] [--max-blocks <n>]
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Path to JSON file |
| `--output` | string | stdout | Output PDF path |
| `--stream` | boolean | false | Single-pass streaming (`buildDocumentPDFStream`); no TOC, no `{pages}` |
| `--stream-page-by-page` | boolean | false | Object-boundary streaming; TOC- and `{pages}`-compatible |
| `--stream-true` | boolean | false | True constant-memory streaming (`buildDocumentPDFStreamTrue`); parts freed as emitted; byte-identical |
| `--max-blocks` | integer | 100000 | Maximum document blocks (`layout.maxBlocks`) before pdfnative aborts |
| `--font` | string (repeatable) | — | Register a bundled font shortcut (`latin`, `emoji`, `color-emoji`, `math`, 27 script codes; `ha`/`yo`/`ig`/`sw` alias `latin`) |
| `--lang` | string (comma list) | — | Preferred font code per script (`th`, `ja`, `ar`, `lo`, …); aliases resolve to `latin` |
| `--font-file` | `<path.ttf>[:name]` (repeatable) | — | (v1.5.0) Register a custom TrueType/OpenType font from disk: `validatePath`, 32 MiB cap, magic bytes (`00 01 00 00` / `true` / `OTTO`), `parseFontData` + `validateFontData` → `E_INPUT`; the name (file stem, `[a-z0-9-]`) joins `--lang`; a bundled name is a usage error. Never from JSON |
| `--pdfx` | `pdfx4` | — | (v1.5.0) PDF/X-4 claim (`layout.pdfx`); needs a `prtr` CMYK output intent; refused with `--tagged` / `--conformance` or any encryption flag (exit 2); envelope `pdfx` |
| `--output-intent-icc` | path | — | (v1.5.0) ICC profile → `layout.outputIntent.iccProfile` (16 MiB cap, `acsp` at byte 36); merged into a `--layout` `outputIntent` (only `iccProfile` is replaced) |
| `--output-intent-id` | string | ICC basename | (v1.5.0) `outputIntent.outputConditionIdentifier` |
| `--trapped` | `true`\|`false`\|`unknown` | — | (v1.5.0) `metadata.trapped` (`/Trapped`, `pdf:Trapped`); PDF/X-4 requires `true` or `false` |
| `--split-paragraphs` / `--keep-headings-with-next` / `--kerning` | boolean | false | (v1.5.0) `layout.typography.splitParagraphs` / `keepHeadingsWithNext` / `kerning` |
| `--font-features` | `tag,tag` | — | (v1.5.0) `layout.typography.features` — OpenType tags, each `/^[a-z0-9]{4}$/i` (invalid → exit 2) |
| `--outline` | `auto`\|`<file.json>` | — | PDF bookmarks: `auto` from headings, or an explicit `OutlineItem[]` tree |
| `--inspect-layout` | boolean | false | Emit a `LayoutInspection` JSON report instead of a PDF (document variant only) |
| `--debug-layout` | `[margins,content,cells]` | — | Overlay layout debug guides on the PDF (bare flag = all) |
| `--strict` | boolean | false | (v1.4.0) Escalate the engine's diagnostics — 9 codes: `PDFA_NO_FONT_ENTRIES`, `PDFA_UNEMBEDDED_FORM_FONT`, `PDFA_DEVICE_CMYK_IMAGE` and the other `PDFA_*`, (v1.5.0) `PDFX_NO_FONT_ENTRIES`, `PDFX_DEVICE_CMYK`, `PDFX_ANNOTATIONS`, `TYPOGRAPHY_FEATURE_INEFFECTIVE` — into an error **before any output byte** (exit 1, `E_CHECK_FAILED`). Without it they are stderr warnings, plus a `diagnostics[]` array in the `--json` envelope |
| `--chunk-size` | bytes | 65536 | (v1.4.0) Chunk size for `--stream` / `--stream-true` (not `--stream-page-by-page`) |
| `--conformance` | `1b`\|`2b`\|`3b` | — | **Deprecated** — use `--tagged pdfa<level>` |

**JSON schema:** Full [`DocumentParams`](https://github.com/Nizoka/pdfnative) — same object passed to `buildDocumentPDFBytes()`.

**Minimal valid input:**
```json
{
  "blocks": [
    { "type": "paragraph", "text": "Hello, World!" }
  ]
}
```

**Full example with metadata and layout:**
```json
{
  "title": "Q1 Report",
  "blocks": [
    { "type": "heading", "text": "Overview", "level": 1 },
    { "type": "paragraph", "text": "Body copy here." },
    { "type": "spacer", "height": 12 },
    { "type": "list", "style": "bullet", "items": ["Point A", "Point B"] }
  ],
  "footerText": "Confidential",
  "metadata": { "author": "Finance", "subject": "Q1 2026" },
  "layout": { "margins": { "t": 60, "r": 50, "b": 60, "l": 50 } }
}
```

**Block types (`blocks[]`):**

| `type` | Required fields | Optional fields | Sample |
|--------|-----------------|-----------------|--------|
| `heading` | `text`, `level` (1–6) | `color` | [03-all-blocks.json](../samples/render/document/03-all-blocks.json) |
| `paragraph` | `text` | `fontSize`, `align` (`left`\|`center`\|`right`\|`justify` — v1.5.0), `lineHeight`, `indent`, `color` (hex, `r g b`, CMYK `"c m y k"` / `[c,m,y,k]`), `keepWithNext`, `splittable` (v1.5.0) | [02-report.json](../samples/render/document/02-report.json), [typography/](../samples/render/typography/) |
| `table` | `headers` (string[]), `rows` (string[][]) | smart-table fields (`zebra`, `caption`, `repeatHeader`, `wrap`, …) | [01-project-status.json](../samples/render/table/01-project-status.json) |
| `list` | `items` (string[]), `style` (`bullet`\|`numbered`) | `fontSize` | [03-all-blocks.json](../samples/render/document/03-all-blocks.json) |
| `barcode` | `format` (`qr`\|`code128`\|`ean13`\|`datamatrix`\|`pdf417`), `data` | `width`, `caption` | [01-qr-url.json](../samples/render/barcode/01-qr-url.json) |
| `link` | `text`, `url` | `fontSize`, `color` | [01-resource-directory.json](../samples/render/link/01-resource-directory.json) |
| `toc` | — | `title`, `maxLevel` | [01-document-with-toc.json](../samples/render/toc/01-document-with-toc.json) |
| `formField` | `fieldType` (`text`\|`textarea`\|`checkbox`\|`radio`\|`select`), `name` | `label`, `value`, `placeholder`, `options`, `readOnly`, `required`, `maxLength`, `width` | [01-contact-form.json](../samples/render/form/01-contact-form.json) |
| `chart` | `chartType` (`bar`\|`barH`\|`stackedBar`\|`stackedBarH`\|`line`\|`area`\|`scatter`\|`pie`\|`donut`), `series` (`{ label, values[], xValues?, yAxis? }[]`) | `title`, `categories`, `legend`, `width`, `height`, `axis` (incl. `scale: "log"`), `axis2`, `xAxis` (`category`\|`linear`\|`time`), `dataLabels`, `labelStride`, `labelRotation`, `markers` | [01-bar-chart.json](../samples/render/chart/01-bar-chart.json), [03-stacked-bars.json](../samples/render/chart/03-stacked-bars.json), [04-area-scatter.json](../samples/render/chart/04-area-scatter.json), [05-time-axis.json](../samples/render/chart/05-time-axis.json) |
| `image` | `src` (path) **or** `dataBase64` (base64 JPEG/PNG) | `width`, `height`, `align`, `alt` | — |
| `svg` | `data` (SVG path `d` string or SVG markup) | `width`, `height`, `align`, `viewBox`, `fill`, `stroke`, `strokeWidth`, `alt` | — |
| `spacer` | `height` (points) | — | any sample |
| `pageBreak` | — | — | [03-all-blocks.json](../samples/render/document/03-all-blocks.json) |

> **`svg` is fully JSON-usable** (pdfnative ≥ 1.5.0): `SvgBlock.data` is a **string** (an SVG path `d` attribute, or SVG markup). **`image` is JSON-usable since v1.4.0**: give it `src` (a JPEG/PNG path, resolved relative to the `--input` JSON's directory) or `dataBase64` (inline base64) — the CLI resolves either to the `data: Uint8Array` pdfnative's `ImageBlock` requires (a raw JSON number array `data` also works). `src` + `dataBase64` together is an `E_INPUT` error.

**Print production & viewer preferences (v1.4.0, `--layout` JSON):**
- `layout.print` — `bleed` shorthand or explicit `trimBox` / `bleedBox` / `artBox` / `cropBox` page boxes, `marks: true` (crop + registration marks) or `marks: { …, colourBars: true | { tints, size } }` (v1.5.0 printer's colour bars), `userUnit` (large-format pages).
- `layout.outputIntent` — ICC output intent: RGB for PDF/A-style colour characterisation, `prtr` CMYK for PDF/X-4 (`iccProfile` as a number array in JSON, or `--output-intent-icc`).
- `layout.viewerPreferences` — print-dialog defaults: `duplex`, `pickTrayByPDFSize`, `printPageRange`, `numCopies`.
- `params.metadata.trapped` — `/Trapped` flag (`True` \| `False` \| `Unknown`; `--trapped` since v1.5.0).

**Typography (v1.5.0, pdfnative ≥ 1.8.0 — `layout.typography`):**
- Paragraph breaking — `widows`, `orphans`, `keepWithNext`, `splitParagraphs`, `keepHeadingsWithNext`; block-level `keepWithNext` / `splittable`.
- Line composition — `justify` (with `align: "justify"`), `opticalMargins`, `softHyphens` (breaks at existing U+00AD), `punctuationSpacing: "fr" | { … }` (narrow no-break spaces before `; : ! ?` and inside guillemets), `unitBinding` (a number never separates from its unit or currency), short-word rules.
- Glyphs — `kerning` (GPOS pairs of embedded fonts), `features` (OpenType tags such as `onum`, `smcp`, `tnum`, `liga`), `metrics: "exact"` (base-14 widths from the real metrics).
- Flags: `--split-paragraphs`, `--keep-headings-with-next`, `--kerning`, `--font-features <tag,…>`. Precedence: flags > `--layout` file > document `layout`; `typography` and `outputIntent` merge one level deep (`mergeNestedLayout`), every other layout key is replaced whole.
- A feature the font cannot honour emits `TYPOGRAPHY_FEATURE_INEFFECTIVE` (warning, or `E_CHECK_FAILED` under `--strict`). Tagged output carries `/ActualText`, so `extract-text` returns the source text.

**CMYK and PDF/X-4 (v1.5.0):**
- Every colour field and colour flag (`--watermark-color`, `--zebra`, chart series, table styles, annotation colours) accepts CMYK as `"c m y k"` (components 0–1) or `[c, m, y, k]` (percent) beside hex / `r g b` / `[r,g,b]`; the content stream then carries `k` / `K` operators.
- `layout.pdfx: "pdfx4"` (`--pdfx pdfx4`) requires a `prtr` CMYK `outputIntent`, embedded fonts (`--font latin --lang latin`), `trapped` `true` or `false`, and no encryption or PDF/A in the same file; the engine's coherence messages map to `E_INPUT` (`src/utils/build-errors.ts`), the `PDFX_*` diagnostics to `--strict`. The XMP carries `pdfxid:GTS_PDFXVersion`; `inspect --pdfx` / `--check pdfx` re-validate with `validatePdfX` (structural, not a certified preflight). `metadata` rewrites the XMP without the PDF/X identification (upstream limit — see ROADMAP.md).

**Reproducible output (v1.5.0):** the global `--creation-date <iso8601>` (or `SOURCE_DATE_EPOCH`) calls `setDefaultCreationDate()` once per process; `/CreationDate`, `xmp:CreateDate`, the `{date}` placeholder and the trailer `/ID` derive from it, in UTC. A `creationDate` string in a `--layout` file or the document `layout` is revived to a `Date` (`reviveLayoutJson`); the flag wins. Encrypted output is never reproducible (CSPRNG keys); `sign --signing-time` and `metadata --mod-date` are separate instants.

See `pdfnative schema render` for the exact shapes, and [`samples/render/print/`](../samples/render/print/), [`samples/render/typography/`](../samples/render/typography/), [`samples/render/reproducible/`](../samples/render/reproducible/).

See [`samples/`](../samples/) for complete working examples of every supported block type.

**Security:** JSON buffer size is checked before parse. If > 50 MB → `CliError(exit 1)`; the same cap guards `--layout` files (v1.5.0).

**Streaming behaviour:** Three mutually-exclusive modes. `--stream` uses a single-pass
AsyncGenerator; `--stream-page-by-page` streams at PDF object boundaries (TOC- and
`{pages}`-compatible); `--stream-true` (pdfnative ≥ 1.3.0) emits and frees parts as it goes for
the lowest peak memory and is byte-identical to the buffered builders. Each writes every
`Uint8Array` chunk immediately to the output and is compatible with piping to compression tools.

**Multilingual rendering (`--font` / `--lang` flags):**

The `--font <code>` flag (repeatable) registers a **bundled** pdfnative font for the duration of
the render — no wrapper script required. The allow-list (`src/utils/fonts.ts`,
`BUNDLED_FONT_MODULES`, 31 modules) is `latin`, `emoji`, `color-emoji`, `math`, and the 27
script codes `ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi` + (v1.5.0)
`lo nod khb tdd cjm`; `ha`, `yo`, `ig` and `sw` are aliases of `latin` (`FONT_ALIASES`,
applied to `--font` and `--lang` with de-duplication). Each name doubles as its `--lang`
code; pdfnative routes each code point to the font whose cmap covers it, so mixed-script and
colour-emoji text renders automatically. `--variant table` embeds the same fonts through
`PdfParams.fontEntries` (v1.5.0). `pdfnative doctor` probes every module on disk.

```bash
# Telugu (one of the six scripts added in pdfnative ≥ 1.3.0)
pdfnative render --input te.json --font te --lang te --output te.pdf

# Lao, Cham (pdfnative ≥ 1.8.0) and the African-Latin aliases
pdfnative render --input lo.json --font lo --lang lo --output lo.pdf
pdfnative render --input yo.json --font yo --lang yo --output yo.pdf   # = latin

# COLRv1 colour emoji
pdfnative render --input party.json --font color-emoji --lang color-emoji --output party.pdf

# Mixed: English (built-in) + Japanese + Arabic in one document
pdfnative render --input multi.json --font ja --font ar --output multi.pdf

# A custom TrueType/OpenType font from disk (v1.5.0) — name defaults to the file stem
pdfnative render --input brand.json --font-file ./fonts/Brand-Regular.ttf:brand --lang brand --output brand.pdf
```

**Custom fonts (`--font-file`, v1.5.0):** `src/utils/fonts.ts loadCustomFonts()` validates the
path, reads at most 32 MiB (`readBinaryFileCapped`), checks the magic bytes (`00 01 00 00`,
`true`, `OTTO`; collections `ttcf` and WOFF are refused), parses the bytes with
`parseFontData` (`pdfnative/tools`, through the bridge — a parse failure is `E_INPUT` with the
engine's message only) and runs `validateFontData` (errors → `E_INPUT`, warnings → stderr),
then `registerFont(name, () => Promise.resolve(fontData))` and adds the name to `--lang`. A
name that collides with the bundled allow-list is a usage error; a document or `--layout` JSON
can never name a font path.

**Advanced (programmatic fonts):** to supply your own `fontData` from code, use the pdfnative
Node.js API directly from a thin wrapper script:

```js
// myscript.js (Node.js >= 22, ESM)
import { registerFonts, loadFontData, buildDocumentPDFBytes } from 'pdfnative';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

// Locate pdfnative's bundled fonts (works with npm / pnpm / Yarn)
const fontsDir = join(dirname(fileURLToPath(import.meta.resolve('pdfnative'))), '..', 'fonts');
const fontUrl  = (name) => pathToFileURL(join(fontsDir, name)).href;

// Register the font loaders (lazy — loaded on first use, then cached)
registerFonts({
  th: () => import(fontUrl('noto-thai-data.js')),   // Thai
  ja: () => import(fontUrl('noto-jp-data.js')),     // Japanese
  ar: () => import(fontUrl('noto-arabic-data.js')), // Arabic (RTL)
});

// Load font data (async)
const [thFont, jaFont, arFont] = await Promise.all([
  loadFontData('th'), loadFontData('ja'), loadFontData('ar'),
]);

// Build fontEntries for DocumentParams
const fontEntries = [
  thFont && { fontData: thFont, fontRef: '/F3', lang: 'th' },
  jaFont && { fontData: jaFont, fontRef: '/F4', lang: 'ja' },
  arFont && { fontData: arFont, fontRef: '/F5', lang: 'ar' },
].filter(Boolean);

// Parse the JSON document and inject font entries
const params = JSON.parse(readFileSync('my-doc.json', 'utf-8'));
params.fontEntries = fontEntries;

// Render (synchronous) — pdfnative automatically routes each text run to the correct font
const pdf = buildDocumentPDFBytes(params);
writeFileSync('output.pdf', pdf);
```

All Noto font data packages (`noto-thai-data.js`, `noto-jp-data.js`, `noto-arabic-data.js`, `noto-cyrillic-data.js`, `noto-devanagari-data.js`, `noto-lao-data.js`, `noto-cham-data.js`, … — the 31 font modules) are **bundled with pdfnative** — no external file downloads needed.

See [`samples/render/multilang/`](../samples/render/multilang/) for complete working examples:
- `03-thai.js` + `03-thai.json` — full Thai monthly report
- `04-multilingual.js` + `04-multilingual.json` — English + Thai + Japanese + Arabic + Russian in one PDF
- `05-lao.json`, `06-tai-tham-cham.json`, `07-african-latin.json` — the 1.8.0 scripts and aliases through `--font` / `--lang` (v1.5.0)

---

### `sign`

**Purpose:** Apply a CMS/PKCS#7 or PAdES digital signature to an existing PDF — optionally with an RFC 3161 trusted timestamp (PAdES B-T) and/or as an additional signature on an already-signed document.

```bash
pdfnative sign --input <file.pdf> [--output <out.pdf>] [--key <key.pem>] [--cert <cert.pem>]
pdfnative sign --input in.pdf --profile pades --timestamp https://tsa.example/rfc3161 --output b-t.pdf
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Input PDF path |
| `--output` | string | stdout | Signed PDF path |
| `--key` | string | `PDFNATIVE_SIGN_KEY` env | Path to PEM private key file |
| `--cert` | string | `PDFNATIVE_SIGN_CERT` env | Path to PEM certificate file |
| `--cert-chain` | string (repeatable) | `PDFNATIVE_SIGN_CHAIN` env | PEM intermediate CA file(s) |
| `--algorithm` | `rsa-sha256`\|`ecdsa-sha256` | `rsa-sha256` | Signature algorithm (ECDSA = P-256) |
| `--digest` | `sha256`\|`sha384`\|`sha512` | `sha256` | (v1.4.0) CMS digest — RSA only; ecdsa is sha256-only |
| `--profile` | `pkcs7`\|`pades` | `pkcs7` | (v1.4.0) `pades` = ETSI.CAdES.detached, PAdES B-B (ESS signing-certificate-v2, omits signing-time) |
| `--pure-crypto` | boolean | false | Force pdfnative's pure-JS signer (default: native constant-time `node:crypto`) |
| `--reason` / `--name` / `--location` / `--contact` / `--signing-time` | string | — | Signature metadata |
| `--timestamp` | TSA URL | — | (v1.4.0) **Opt-in network.** Embed a verified RFC 3161 timestamp token in the CMS unsigned attributes (PAdES B-T with `--profile pades`). Formerly a reserved flag |
| `--timestamp-digest` | `sha256`\|`sha384`\|`sha512` | `sha256` | (v1.4.0) TSA message-imprint digest |
| `--timestamp-nonce` | hex | random 8 bytes | (v1.4.0) TSA request nonce |
| `--timestamp-timeout` | ms | 10000 | (v1.5.0) Bound on the TSA round-trip (positive integer; usage error without `--timestamp`); `createTsaProvider(url, { timeoutMs })`; envelope `timestamp.timeoutMs` |
| `--allow-multiple` | boolean | false | (v1.4.0) Allow signing an already-signed PDF (appends a signature field; default is idempotent single-signature) |
| `--field-name` | string | auto | (v1.4.0) Signature form-field name |
| `--signature-rect` | `"x1,y1,x2,y2"` | invisible | (v1.4.0) Visible signature widget rectangle (PDF points) |
| `--signature-page` | integer | 1 | (v1.4.0) 1-based page for the signature widget |
| `--placeholder-bytes` | integer | auto estimate | (v1.4.0) Explicit `/Contents` placeholder size |

Without `--timestamp` the command performs **no network I/O**; with it, the TSA request goes through the SSRF-guarded client (see §6). `--signing-time` is a deliberate instant, never pinned by the global `--creation-date`; the incremental revision carries a per-revision `/ID` the engine derives at signing time, so signed output is not byte-reproducible (the sample baseline fingerprints it semantically — see ROADMAP.md).

**Secret loading priority:**
1. `PDFNATIVE_SIGN_KEY` env var (PEM string of private key)
2. `--key <path>` flag (file read as PEM string)
3. Same for cert: `PDFNATIVE_SIGN_CERT` → `--cert`

**Security invariants:**
- Key material is **never** included in error messages or debug output.
- Path arguments are validated against `../` traversal.
- If neither env nor flag provides a key/cert → `CliError(exit 2)`.

**pdfnative API called:** `signPdfBytes(pdfBytes: Uint8Array, options: PdfSignOptions): Uint8Array`

`PdfSignOptions` shape:
```typescript
interface PdfSignOptions {
    rsaKey?: RsaPrivateKey;     // parsed with parseRsaPrivateKey(derBytes)
    signerCert: X509Certificate; // parsed with parseCertificate(derBytes)
    algorithm?: 'rsa-sha256' | 'rsa-sha384' | 'rsa-sha512';
}
```

**PEM to DER pipeline (handled internally in `sign.ts`):**
```typescript
// Strip headers, base64-decode to Uint8Array
const keyDer = pemToDer(keyPem);
const rsaKey = parseRsaPrivateKey(keyDer);
const signerCert = parseCertificate(certDer);
```

> **Note:** `signPdfBytes` is synchronous — it returns `Uint8Array` directly (not a Promise).
> With `--timestamp`, the CLI instead calls the **async** `signPdfBytesWithTimestamp(bytes, options)` after injecting a `TimestampProvider` (built in [`src/utils/tsa.ts`](../src/utils/tsa.ts) over the SSRF-guarded client) via `setTimestampProvider` — the engine itself never opens a socket.

---

### `verify`

**Purpose:** Verify embedded CMS/PKCS#7 signatures — integrity, signature value, certificate chain, trust, RFC 3161 timestamps, and OCSP/CRL revocation.

```bash
pdfnative verify [--input <file.pdf>] [--trust <root.pem>]... [--strict] [--revocation offline|online|disabled] [--revocation-policy soft-fail|strict] [--format json|text]
```

Per signature the JSON report covers: byte-range integrity (CMS `messageDigest`), signer subject/issuer, chain validity, trust evaluation (against `--trust` PEM roots; self-signed accepted when omitted), cryptographic signature-value verification (RSA / ECDSA-P-256 — **SHA-256/384/512 CMS digests since v1.4.0**), RFC 3161 timestamp-token validation (PAdES-T), and revocation status (`--revocation offline` reads the PDF `/DSS`; `online` additionally fetches via AIA/CDP URLs through the SSRF guard; `disabled` skips).

**v1.4.0:** each signature also reports its **`fieldName`**, and `/DocTimeStamp` revisions (PAdES B-LTA) are validated as RFC 3161 tokens and flagged **`isDocTimestamp: true`**. `--strict` exits 1 on any failing signature. Token-economy flags: `--summary` (`{ valid, signatures, invalid }`), `--fields`, `--pretty`.

**v1.5.0:** each timestamp reports its `messageImprint` algorithm as **`timestampDigest`** (`src/utils/timestamp-verify.ts`, `imprintAlgorithm`); a SHA-1 imprint adds the note `weak digest: RFC 3161 messageImprint uses SHA-1 (refused under --strict)` to `notes[]`, and under `--strict` the timestamp is reported invalid (`E_VERIFY_FAILED`). The CLI always requests SHA-256+ imprints when it timestamps.

---

### `inspect`

**Purpose:** Analyse a PDF and output structured metadata.

```bash
pdfnative inspect [--input <file.pdf>] [--format json|text]
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Input PDF path |
| `--format` | `json`\|`text` | `json` | Output format |
| `--verbose` | boolean | false | Add trailer keys, catalog keys, object count, XMP |
| `--pages` | boolean | false | Add per-page metadata array — width/height/rotation, annotation/formField/signature counts, and (v1.4.0) `cropBox` / `bleedBox` / `trimBox` / `artBox` / `userUnit` when present |
| `--annotations` | boolean | false | List markup + link annotations per page (page labels reported automatically) |
| `--form-fields` | boolean | false | List AcroForm fields (name, type, value, required/read-only) |
| `--encryption` | boolean | false | Report the encryption scheme (algorithm, revision, opened-as) |
| `--password` | string | — | Password for an encrypted PDF (env `PDFNATIVE_PASSWORD`) |
| `--pdfua` | boolean | false | Add a PDF/UA (ISO 14289-1) structural validation report |
| `--signatures` | boolean | false | (v1.4.0) List signature fields via `listSignatures` — `fieldName`, `subFilter`, `byteRange`, `isDocTimestamp`, `isPlaceholder`, `sigObjNum`, `contentsLength` (never the signature bytes) |
| `--pdfx` | boolean | false | (v1.5.0) Add a PDF/X-4 validation report `pdfx: { valid, target, errors, warnings }` (`validatePdfX`); `pdfxConformance` (XMP `pdfxid:GTS_PDFXVersion`) is always present |
| `--iso-dates` | boolean | false | (v1.5.0) Normalise `metadata.creationDate` / `modDate` from `D:YYYYMMDDHHmmSS+HH'mm'` to ISO 8601 (`src/utils/pdfdate.ts`; unparsable strings unchanged) |
| `--check` | `pdfa`\|`signed`\|`encrypted`\|`pdfua`\|`pdfx`\|`"signatures>=N"` (repeatable, AND) | — | CI assertion; sets exit code (0 = pass, 1 = fail). `"signatures>=N"` is new in v1.4.0, `pdfx` in v1.5.0 |

**v1.4.0:** `metadata.trapped` (`/Trapped`) is reported, and a bug where the per-page `signatures` / `formFields` counters always reported `0` is fixed. **v1.5.0:** `--summary` returns `{ pages, encrypted, signatures, pdfa, pdfx }`; the text report prints `PDF/X:` and `PDF/X check:` lines.

**JSON output shape:**
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

**pdfnative API used:** `openPdf(bytes: Uint8Array): PdfReader`, and (for `--pdfua` / `--check pdfua`) `validatePdfUA(bytes: Uint8Array): { valid: boolean; errors: readonly string[]; warnings: readonly string[] }`.

**PDF/UA validation (`--pdfua`):** a fast, read-only structural check (`/MarkInfo /Marked`, `/StructTreeRoot` + `/ParentTree`, `/Metadata`, `/Lang`, per-page `/MCID` uniqueness). It is a developer-time gate, not a substitute for a full reference validator such as veraPDF. With `--check pdfua` the command exits 1 when the structural prerequisites fail.

`PdfReader` interface (relevant methods):
```typescript
interface PdfReader {
    readonly pageCount: number;
    readonly trailer: PdfDict;    // PdfDict = Map<string, PdfValue>
    readonly bytes: Uint8Array;
    getCatalog(): PdfDict;
    getInfo(): PdfDict | null;
    resolve(ref: PdfRef): PdfValue;
    resolveValue(val: PdfValue): PdfValue;
    decodeStream(stream: PdfStream): Uint8Array;
}
```

`PdfDict` is a `Map<string, PdfValue>` — use `.get('Key')` to access entries (no bracket notation).

pdfnative also exports typed accessors: `dictGet`, `dictGetName`, `dictGetNum`, `dictGetDict`, `dictGetArray`.

---

### `merge`

**Purpose:** Concatenate several PDFs into one (pdfnative ≥ 1.5.0 page-tree API).

```bash
pdfnative merge <a.pdf> <b.pdf> [...] --output <combined.pdf>
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| _positionals_ | string[] | — | Source PDFs in order (2–50); may combine with `--input` |
| `--input` | string (repeatable) | — | Additional source PDF |
| `--output` | string | stdout | Output combined PDF |
| `--drop-annotations` | boolean | false | Strip annotations from the merged output |
| `--max-output-size` | bytes | 256 MiB | Fail if the output would exceed this size (`0`/`none` = unlimited) |

**pdfnative API:** `mergePdfs(sources: Uint8Array[], options?: MergeOptions): Uint8Array`.

### `split`

**Purpose:** Split one PDF into several (pdfnative ≥ 1.5.0 page-tree API).

```bash
pdfnative split --input <in.pdf> --output-dir <dir> [--pages 1-2,3-4] [--prefix part]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Source PDF |
| `--output-dir` | string | — **(required)** | Output directory (created if absent) |
| `--pages` | ranges | one per page | Each comma-separated range becomes one output |
| `--prefix` | string | input stem / `part` | Filename prefix → `<prefix>-<n>.pdf` (zero-padded) |
| `--drop-annotations` | boolean | false | Strip annotations from each part |
| `--max-output-size` | bytes | 256 MiB | Per-part size cap (`0`/`none` = unlimited) |

**pdfnative API:** `splitPdf(source: Uint8Array, ranges?: PageRange[], options?): Uint8Array[]`.

### `extract`

**Purpose:** Pull selected pages into a new PDF (pdfnative ≥ 1.5.0 page-tree API).

```bash
pdfnative extract --input <in.pdf> --output <out.pdf> --pages 4,1-2
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Source PDF |
| `--output` | string | stdout | Output PDF |
| `--pages` | list/range | — **(required)** | 1-based; order preserved, repeats allowed |
| `--drop-annotations` | boolean | false | Strip annotations from the output |
| `--max-output-size` | bytes | 256 MiB | Output size cap (`0`/`none` = unlimited) |

**pdfnative API:** `extractPages(source: Uint8Array, pages: PageRange[], options?): Uint8Array`.

> **Encryption & streaming (pdfnative ≥ 1.6.0):** `merge`, `split`, and `extract` also accept
> `--password` (decrypt an encrypted source), `--encrypt [aes-128|aes-256]` with
> `--owner-password` / `--user-password` / `--permissions` (re-encrypt the rebuilt output via
> `MergeOptions.encrypt`), and `--stream` + `--chunk-size` (constant-memory output via the
> `streamMergedPdfs` / `streamSplitPdf` / `streamExtractPages` generators). A wrong/missing
> password surfaces the stable `E_PASSWORD` code.
>
> **`merge` multiple encrypted sources:** the single `--password` is applied to *every* source
> (`MergeOptions.password`), so merging sources with **different** passwords fails with
> `E_PASSWORD`. Decrypt the outliers first, then merge. (`split` / `extract` take a single input,
> so their `--password` is unambiguous.)

### `extract-text`

**Purpose:** Extract reading-order Unicode text (pdfnative ≥ 1.6.0 `extractText`). No OCR —
image-only pages yield empty text. Tagged documents carry `/ActualText` (pdfnative ≥ 1.8.0),
so the source text comes back even where the typography engine inserted narrow no-break
spaces or soft hyphens.

```bash
pdfnative extract-text --input <in.pdf> --format text|json|ndjson [--runs] [--pages 1,3] [--password <s>]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--format` | `text`\|`json`\|`ndjson` | `text` | Plain text (form-feed between pages), JSON array, or NDJSON (one object per page) |
| `--pages` | list/range | all | 1-based selector |
| `--runs` | boolean | false | Include positioned runs `{ text, x, y, fontSize, fontName }` |
| `--password` | string | — | Password for an encrypted PDF (env `PDFNATIVE_PASSWORD`) |
| `--max-length` | integer | 16000000 | Total-character cap (`0`/`none` disables) |
| `--summary` / `--fields` / `--pretty` | — | — | Token-economy controls (json) |

**pdfnative API:** `extractText(bytes, { password?, pages?, includeRuns?, maxTextLength? }): ExtractedPageText[]`.

### `fill`

**Purpose:** Fill and/or flatten an existing AcroForm (pdfnative ≥ 1.6.0), incremental save.

```bash
pdfnative fill --input <form.pdf> --data <values.json> [--flatten] [--output <out.pdf>]
pdfnative fill --input <form.pdf> --flatten --output <flat.pdf>
pdfnative fill --input <form.pdf> --export [--output <values.json>]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--data` | string | — | JSON object `name → string\|boolean\|string[]` (or `{ "values": {…} }`) |
| `--flatten` | boolean | false | Flatten after filling, or flatten in place when `--data` omitted |
| `--export` | boolean | false | Read-only: emit current values as a `--data`-shaped JSON map (ignores `--data`/`--flatten`) |
| `--force` | boolean | false | Flatten even with a signed signature field present |
| `--on-unknown` | `throw`\|`ignore` | `throw` | Unknown field-name behaviour |
| `--need-appearances` | boolean | false | Set `/NeedAppearances` for non-WinAnsi values |
| `--password` | string | — | Password for an encrypted PDF |

`--export` enables a read → edit → fill round-trip: it emits current field values
(unset choice fields omitted, so the map re-fills cleanly). Errors on malformed
`--data` content are `E_INPUT` (exit 1).

**pdfnative API:** `readFormFields(bytes, opts?)`, `fillForm(bytes, values, opts?)`,
`flattenForm(bytes, opts?)`. Form errors map to `E_INPUT` (field/value) or `E_UNSUPPORTED`
(signature fields).

### `encrypt` / `decrypt`

**Purpose:** Re-secure with AES-128/256, or remove encryption (pdfnative ≥ 1.6.0 page-tree
re-encryption). Both rebuild the page tree like `merge`, so signatures/forms are dropped.
`encrypt` requires a Web Crypto CSPRNG; RC4 is never emitted.

```bash
pdfnative encrypt --input in.pdf --owner-password <s> [--user-password <s>] [--algorithm aes-256] [--permissions print,copy]
pdfnative decrypt --input enc.pdf --password <s> --output plain.pdf
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--owner-password` | string | — **(required for encrypt)** | env `PDFNATIVE_ENCRYPT_OWNER_PASS` |
| `--user-password` | string | — | env `PDFNATIVE_ENCRYPT_USER_PASS` |
| `--algorithm` | `aes-128`\|`aes-256` | `aes-128` | encrypt only |
| `--permissions` | list | — | `print,copy,modify,extract` |
| `--password` | string | — | Open an encrypted source (rotation, or decrypt); env `PDFNATIVE_PASSWORD` |
| `--stream` | boolean | false | Constant-memory streaming output (`--chunk-size <bytes>`) |

**pdfnative API:** `extractPages(source, allPages, { password?, encrypt? })` (buffered) or
`streamExtractPages(...)` (with `--stream`) — `encrypt` maps to `MergeOptions.encrypt`.
Passwords come from env (a non-empty value wins over flags) and are never logged.

### `annotate`

**Purpose:** Attach markup annotations to an existing PDF via an incremental save (original bytes — and any existing signature — preserved).

```bash
pdfnative annotate --input <in.pdf> --output <out.pdf> --annotations <spec.json>
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | stdin | Source PDF |
| `--output` | string | stdout | Annotated PDF |
| `--annotations` | string | — **(required)** | JSON array (or `{ annotations: [...] }`); each entry a markup annotation + 1-based `page` |
| `--password` | string | — | (v1.4.0) Password for an encrypted PDF (env `PDFNATIVE_PASSWORD`); appended objects are encrypted under the existing scheme |

Types: `text`, `highlight`, `underline`, `strikeout`, `squiggly`, `square`, `circle`, `line`, `freetext` and (v1.5.0) `link`. Each needs `page` + `rect` `[x1,y1,x2,y2]`; `line` also needs `start`/`end`; `link` needs `url` (`validateURL`: `http`, `https`, `mailto`; else `E_INPUT`) and is emitted as `<< /Type /Annot /Subtype /Link /Rect […] /Border [0 0 0] /F 4 /A << /S /URI /URI (escaped) >> >>` built by the CLI (`buildLinkBody`). Colours accept CMYK. Only known fields are forwarded (no dictionary injection). Any annotation added to a PDF/X-4 file breaks its claim (`inspect --check pdfx`).

**pdfnative API:** `createModifier(reader): PdfModifier`, `buildAnnotationBody(annotation: MarkupAnnotation)`, `validateURL(url)`, `modifier.addAnnotation(pageIndex, body)`, `modifier.save(): Uint8Array` (incremental).

### `metadata` (v1.4.0)

**Purpose:** Update PDF `/Info` + XMP metadata with an **incremental save** — the original bytes are preserved as a prefix, so existing digital signatures remain valid for their revision. The XMP packet is kept in sync (`xmp:ModifyDate`, `pdf:Keywords`, …). Reading metadata stays in `inspect`.

```bash
pdfnative metadata --input in.pdf --title "New title" [--output out.pdf]
pdfnative metadata --input in.pdf --from-json meta.json --output out.pdf
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` / `--output` | string | stdin / stdout | I/O |
| `--title` / `--author` / `--subject` / `--keywords` | string | — | Metadata fields (keywords = single string) |
| `--mod-date` | ISO 8601 | now | Pass a fixed value for reproducible output |
| `--from-json` | string | — | JSON file `{ title?, author?, subject?, keywords?, modDate? }` — mutually exclusive with the per-field flags |
| `--password` | string | — | Password for an encrypted PDF (env `PDFNATIVE_PASSWORD`) |
| `--dry-run` | boolean | false | Validate inputs without writing output |

At least one metadata field is required. `--mod-date` is a deliberate instant, not pinned by
`--creation-date`. Known upstream limit (pdfnative 1.8.0): the rewrite emits a fresh XMP packet
without `pdfxid:GTS_PDFXVersion` / `xmpMM` / `pdf:Trapped`, so a PDF/X-4 identification is
dropped — re-check with `inspect --check pdfx` (tracked in ROADMAP.md).

**pdfnative API:** `createModifier(reader)`, `modifier.updateMetadata(update: PdfMetadataUpdate)`, `modifier.save()` (incremental).

### `ltv` (v1.4.0)

**Purpose:** PAdES B-LT — archive the certificates, OCSP responses and CRLs needed to validate the document's signatures long after certificates expire, into `/DSS` + `/VRI`. The two-step collect/embed flow supports **air-gapped pipelines**: collect on a connected machine, embed offline.

```bash
pdfnative ltv collect --input signed.pdf --online [--output ltv.json]
pdfnative ltv embed   --input signed.pdf --data ltv.json [--output out.pdf]
pdfnative ltv add     --input signed.pdf --online [--output out.pdf]
```

| Subcommand | Network | Description |
|------------|---------|-------------|
| `collect` | **requires `--online`** | Fetch OCSP/CRL validation data and write a replayable JSON file (schema subject `ltv-data`) |
| `embed` | **never** | Embed a previously collected JSON into `/DSS` + `/VRI` |
| `add` | **requires `--online`** | collect + embed in one pass |

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` / `--output` | string | stdin / stdout | I/O |
| `--online` | boolean | false | **Explicit opt-in** for network fetches (SSRF-guarded, no redirects). Without it, `collect`/`add` refuse to run |
| `--prefer` | `ocsp`\|`crl` | `ocsp` | Preferred revocation source |
| `--extra-cert` | PEM file (repeatable) | — | Extra chain certificates |
| `--data` | string | — | Collected JSON file (**required** for `embed`) |
| `--timeout` | ms | 10000 | Network timeout |
| `--dry-run` | boolean | false | Validate inputs; no output, no network |

**pdfnative API:** `collectValidationInfo` (with a CLI-injected `RevocationProvider` from [`src/utils/ltv-provider.ts`](../src/utils/ltv-provider.ts)), `embedValidationInfo`, `addValidationInfo`.

**The typical PAdES ladder:**
```
sign --timestamp <tsa> --profile pades   →  B-T
ltv add --online                         →  B-LT
doc-timestamp --url <tsa>                →  B-LTA
ltv add --online                         →  LTV for the doc-timestamp itself
```

### `doc-timestamp` (v1.4.0)

**Purpose:** PAdES B-LTA — append a `/DocTimeStamp` signature field (SubFilter `/ETSI.RFC3161`, ISO 32000-2 §12.8.5) covering every byte of the document as an incremental revision; earlier revisions stay byte-identical. Repeat periodically to renew LTA protection.

```bash
pdfnative doc-timestamp --input signed.pdf --url <tsa-url> [--output out.pdf]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` / `--output` | string | stdin / stdout | I/O |
| `--url` | TSA URL | — **(required)** | RFC 3161 TSA — the explicit network opt-in (SSRF-guarded, no redirects) |
| `--digest` | `sha256`\|`sha384`\|`sha512` | `sha256` | Message-imprint digest |
| `--field-name` | string | `DocTimeStamp1` | Timestamp field name (auto-suffixed on collision) |
| `--placeholder-bytes` | integer | 12288 | `/Contents` placeholder size |
| `--nonce` | hex | random | Request nonce |
| `--timeout` | ms | 10000 | Network timeout |
| `--dry-run` | boolean | false | Validate inputs; no output, no network |

**pdfnative API:** `addDocumentTimestamp(bytes, options)` with the CLI's `TimestampProvider`.

### `compare` (v1.4.0)

**Purpose:** Diff two PDFs by extracted reading-order **text** and/or **structure** (page count, page/print boxes, metadata, form fields, annotations, encryption, signatures). Built for CI and agents: identical documents exit 0; any difference exits 1 with the stable code `E_CHECK_FAILED`. **Visual/rasterised diffing is out of scope** (pdfnative has no rasteriser).

```bash
pdfnative compare a.pdf b.pdf [--mode both] [--format text|json] [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| _positionals_ | 2 paths | — | The two PDFs to compare |
| `--mode` | `text`\|`structure`\|`both` | `both` | What to diff |
| `--format` | `text`\|`json` | `text` | Report format (stdout; schema subject `compare`) |
| `--tolerance` | points | 0 | Geometric tolerance for page/box sizes |
| `--ignore-whitespace` | boolean | false | Collapse runs of whitespace before the text diff |
| `--pages` | selector | all | 1-based selector limiting the text diff (e.g. `"1,3-5"`) |
| `--password-a` / `--password-b` | string | — | Per-side passwords |
| `--pretty` | boolean | false | Force indented JSON even under `--json` |

**pdfnative API:** `extractText` + `openPdf`/`listSignatures`-based structural comparison (read-only).

### `batch`

**Purpose:** Render a directory of JSON definitions in parallel, **or** (v1.4.0) run a declarative multi-command manifest pipeline.

```bash
pdfnative batch --input-dir <dir> --output-dir <dir> [render options]
pdfnative batch --manifest tasks.json [--allow-network] [--continue-on-error]
```

**Directory mode:** `--input-dir` (required) + `--output-dir`, `--concurrency` (default 4), `--fail-fast`; all other render flags are forwarded to each file. Exit 1 if any file fails.

**Manifest mode (v1.4.0, mutually exclusive with `--input-dir`):**

| Flag | Type | Description |
|------|------|-------------|
| `--manifest` | string | Pipeline file (schema subject `batch-manifest`): `{ "version": 1, "tasks": [ { "id", "command", "flags" } ] }`. Flag values `"@<id>"` reference the output of an **earlier** task; relative paths resolve against the manifest's directory. Tasks run sequentially, fail-fast. Allowed commands (14): `render`, `sign`, `verify`, `inspect`, `merge`, `split`, `extract`, `extract-text`, `fill`, `encrypt`, `decrypt`, `annotate`, `metadata`, `doc-timestamp` (`ltv` and `compare` need positional arguments and are not yet manifest-callable) |
| `--allow-network` | boolean | **Required** for any network flag inside the manifest (`--timestamp`, `--url`, `--online`, `--revocation online`). An untrusted manifest can never trigger network I/O on its own |
| `--continue-on-error` | boolean | Keep running after a failure; tasks depending (via `@`) on a failed task are skipped |

Common: `--format text|json`, `--summary` (`{ total, succeeded, failed }`), `--fields`, `--pretty`, `--dry-run`. Implemented by [`src/utils/manifest.ts`](../src/utils/manifest.ts) (parse/validate + `@id` resolution + network gate).

A manifest has the filesystem access of the user who invokes `batch` — the same trust level as command-line flags; only network access is additionally gated behind `--allow-network`. The manifest file is size-capped (50 MB) and bounded to 1 000 tasks, and path values undergo the same anti-traversal check as direct CLI flags. Structural violations (wrong shape/types/version) exit 2 / `E_USAGE`; value violations (invalid or duplicate id, non-whitelisted command, bad `@ref`) exit 1 / `E_INPUT`.

### `govern`

**Purpose:** Expose pdfnative's AI-governance / Human-in-the-Loop (HITL) contract. Agents are **draftsmen** — a human always reviews and submits.

```bash
pdfnative govern rules                  # human/agent protocol (AGENT_RULES) on stdout
pdfnative govern policy [--json]        # machine-readable policy JSON on stdout
pdfnative govern verify-issue <draft.md> [--json]   # gate a draft
```

`verify-issue` returns `{ ok, errors, warnings }` and exits 1 (`E_POLICY`) on a violation — proposing an external runtime dependency, or omitting a reproduction code block. Missing recommended fields (environment, expected behaviour) are warnings. Fully offline; no GitHub / network access. Implemented by the pure `validateGovernanceDraft` in `utils/governance.ts` (a zero-dependency port of pdfnative's `verify-issue.mjs`).

### `doctor`

**Purpose:** Environment / capability preflight for onboarding (humans) and pre-flight (agents). Fully offline.

```bash
pdfnative doctor [--format json|text]
```

Reports the CLI version, Node version (≥ 22), Web Crypto (CSPRNG) availability — required by `encrypt` — the resolved `pdfnative` version, the registered command count, and (v1.5.0) `fonts` (`31 modules / 27 scripts`; each module of `BUNDLED_FONT_MODULES` is probed under the engine's `fonts/` directory — `error` when one is missing; `getRegisteredLangs()` is empty in a fresh process, so the allow-list is what is reported), `unicode` (`USE_UNICODE_VERSION`) and `conformance` (`pdfa1b,pdfa2b,pdfa2u,pdfa3b,pdfx4` from `PDF_A_*` / `PDF_X_CONFORMANCE_TARGETS`). `--format json` (or global `--json`) emits `{ ok, checks: [{ name, status, value, detail }] }` — the shape is additive only. Exit code **0** when all checks pass, **1** otherwise — so an agent can gate `encrypt` or `--pdfx` on `doctor` first.

---

## 5. Agent Automation Contract

The CLI is designed so an autonomous AI agent — or any program — can drive it
deterministically. There is **no separate runtime**: agent support is a thin
presentation layer over the normal dispatch (the official pdfnative MCP server
is a different integration; this is about driving the CLI process directly).

### Channels

| Channel | Carries |
|---------|---------|
| **stdout** | The primary artifact: PDF (`render`, `sign`), JSON report (`inspect`, `verify`, `batch --format json`), JSON Schema (`schema`), or completion script. |
| **stderr** | All diagnostics: progress, warnings, and the agent JSON envelopes. |
| **exit code** | `0` success · `1` runtime · `2` usage. Unchanged in every mode. |

### `--json` envelope

Global `--json` sets `PDFNATIVE_JSON=1` (in `index.ts`). In that mode:

- On **failure**, a single object is written to stderr:
  `{ "ok": false, "command": <name|null>, "error": { "code": "E_*", "message": "…" } }`.
- On **success**, all the write commands — `render` / `sign` / `merge` / `split` /
  `extract` / `annotate` / `fill` / `encrypt` / `decrypt` / `batch` / `metadata` /
  `ltv` / `doc-timestamp` — emit a status line:
  `{ "ok": true, "command": "render", "variant": "document", "dryRun": false, "output": "out.pdf", "bytes": 12345 }`.
- `inspect` / `verify` / `batch` already put their result document on stdout as
  JSON; `--json` only adds the stderr failure envelope (and forces `batch`'s
  JSON summary).
- Additive success fields, all pinned by `schema status`: `diagnostics[]` (`render`),
  `timestamp: { url, digest, timeoutMs? }` (`sign --timestamp`), `pdfx` (`render --pdfx`,
  v1.5.0) and `creationDate` (`render` / `batch` under a pinned date, v1.5.0).
- Global flags (`--json`, `--dry-run`, `--quiet`, `--no-color`, `--config`, `--no-config`,
  `--max-inflate-size`, `--creation-date`, `--help`, `--version`) may precede or follow the
  command name (v1.5.0).

The helpers live in [`src/utils/agent.ts`](../src/utils/agent.ts):
`isJsonMode()`, `isDryRun()`, `buildErrorEnvelope()`, `emitJsonError()`,
`emitStatus()` (a no-op outside `--json`, so commands call it unconditionally).

### Stable error codes

Defined in [`src/utils/error.ts`](../src/utils/error.ts) as `ErrorCode` and
carried on every `CliError.code`:

| Code | Meaning |
|------|---------|
| `E_USAGE` | Missing/invalid flag or argument (exit 2) |
| `E_INPUT` | Input payload wrong shape / failed validation — incl. (v1.5.0) the engine's PDF/X, print and OutputIntent coherence errors (`classifyBuildError`), a rejected ICC profile or font file, an invalid `link` URL |
| `E_PARSE` | Could not parse JSON / PDF / DER |
| `E_IO` | Filesystem or stream I/O failure |
| `E_SIGN` | Signing failed (generic message — never leaks key material) |
| `E_VERIFY_FAILED` | `verify --strict` found an invalid signature, or (v1.5.0) a timestamp with a SHA-1 messageImprint |
| `E_CHECK_FAILED` | `inspect --check` assertion failed (incl. `pdfx`), `compare` found differences, `render --strict` hit a diagnostic |
| `E_POLICY` | `govern verify-issue` found a governance violation |
| `E_UNSUPPORTED` | Reserved / not-yet-available capability |
| `E_PASSWORD` | Encrypted PDF: password missing or incorrect |
| `E_NETWORK` | (v1.4.0) Opt-in network operation failed — TSA / OCSP / CRL transport error or non-2xx response (deliberately generic; never includes response bodies) |
| `E_RUNTIME` | Catch-all runtime error |

When no code is passed, `CliError` derives one from the exit code
(`2 → E_USAGE`, otherwise `E_RUNTIME`), so legacy call sites get a sensible
code for free.

### `--dry-run`

`render`, `sign`, `batch`, `merge`, `split`, `extract`, `annotate`, `fill`,
`encrypt`, `decrypt`, `metadata`, `ltv`, and `doc-timestamp` accept
`--dry-run` (sets `PDFNATIVE_DRY_RUN=1`). Inputs are fully validated — and for
`sign`, credentials are parsed and the PDF is placeholder-prepared — but **no
output is produced or written**, and `--dry-run` **never performs network I/O**,
even when a network flag is present. Commands read
`hasFlag(args.flags, 'dry-run') || isDryRun()` so a direct command call and the
global flag both work.

### Token economy — output projection

The JSON `inspect` / `verify` / `batch` write to stdout is the bulk of an agent's
token cost. The projection layer in
[`src/utils/projection.ts`](../src/utils/projection.ts) shrinks it ~90 % through
three composable levers (`selectFields`, `serializeJson`, `parseFieldList` — all
pure, zero-dep):

| Lever | Flag | Effect |
|-------|------|--------|
| Compact serialization | *(auto under `--json`)* | Minified JSON (no indentation); `--pretty` opts back into 2-space output. Non-`--json` runs stay pretty for humans. |
| Canonical summary | `--summary` | Collapses the report to a minimal verdict (see below). |
| Dot-path projection | `--fields a,b.c` | Keeps only the named paths; an array segment maps over its elements; unknown paths are silently omitted. |

Precedence: `--summary` is applied first, then `--fields` projects the result.

| Command | `--summary` shape |
|---------|-------------------|
| `inspect` | `{ pages, encrypted, signatures, pdfa, pdfx }` |
| `verify`  | `{ valid, signatures, invalid }` |
| `batch`   | `{ total, succeeded, failed }` (drops the per-file `results` array) |

```bash
pdfnative verify  --input doc.pdf --json --summary        # {"valid":false,"signatures":0,"invalid":0}
pdfnative inspect --input doc.pdf --json --fields pageCount,signatures
pdfnative batch   --input-dir in --output-dir out --json --summary
```

The summary shapes are schema-pinned: `schema inspect-summary`,
`schema verify-summary`, `schema batch-summary`.

Why compact-under-`--json` is not a breaking change: agent mode (`--json`) is new
in this release, so no prior consumer relied on its stdout being pretty-printed.
Human invocations (no `--json`) are unchanged.

### `schema` command

[`src/commands/schema.ts`](../src/commands/schema.ts) prints a hand-authored,
versioned JSON Schema (Draft 2020-12) for one of **19 subjects** (v1.4.0):

- **Inputs:** `render` (default), `annotate`, `fill`, `metadata` (v1.4.0 — input for `metadata --from-json`), `batch-manifest` (v1.4.0 — input for `batch --manifest`)
- **Outputs:** `inspect`, `verify`, `batch`, `extract-text`, `form-export`, `govern-verify`, `doctor`, `ltv-data` (v1.4.0 — output of `ltv collect` / input for `ltv embed`), `compare` (v1.4.0)
- **Compact shapes:** `inspect-summary`, `verify-summary`, `batch-summary`
- **Meta:** `status` (the agent success envelope), `manifest` (the machine-readable capability manifest: commands, flags, codes)

The `$id` embeds the CLI version
(`https://pdfnative.dev/schema/cli/<version>/<subject>.schema.json`) so callers
can detect drift. `schema list` enumerates the subjects.

**`batch --manifest` for agents (v1.4.0):** the manifest is the recommended way for an
agent to run a multi-step pipeline (e.g. render → sign → encrypt) in **one process
invocation** with a single JSON summary — validate it first against
`schema batch-manifest`, and remember that any network flag inside a manifest is
refused unless `batch` itself is invoked with `--allow-network` (an untrusted
manifest can never trigger network I/O on its own).

See [AGENT_CONTRACT.md](AGENT_CONTRACT.md) for the full consumer contract and
[AGENTS.md](../AGENTS.md) for the rules agents follow when working on this repository.

---

## 6. Security Model

| Threat | Mitigation |
|--------|-----------|
| Path traversal via `--input`/`--output`/`--key`/`--cert` | `validatePath()` checks for `../` before any `fs.readFile` / `fs.writeFile` |
| Memory exhaustion via large JSON | 50 MB size check before `JSON.parse` |
| Zip-bomb PDF streams (untrusted input) | (v1.4.0) Global `--max-inflate-size <bytes>` caps the decompressed size of any single PDF stream while parsing (default 100 MiB), via pdfnative's `setMaxInflateOutputSize` |
| Key material leakage via logs | Keys never included in error messages; `sign` command silences all key-related debug output |
| SSRF via opt-in network operations | Every network path goes through [`src/utils/fetch-guard.ts`](../src/utils/fetch-guard.ts) — see below |
| Untrusted batch manifests triggering network I/O | Network flags inside a `batch --manifest` are refused unless `batch` itself is invoked with `--allow-network` |
| Binary injection via inspect output | All metadata fields are string-coerced; no raw binary blobs emitted |
| Malicious ICC profile / font file (v1.5.0) | `--output-intent-icc` ≤ 16 MiB with the `acsp` signature checked (the engine also requires a `prtr` CMYK profile for PDF/X); `--font-file` ≤ 32 MiB, magic bytes checked, parsed by `parseFontData` and checked by `validateFontData` before registration; neither can be named from a JSON payload |
| Oversized `--layout` file | (v1.5.0) The 50 MB JSON cap applies to `--layout` as to the document input |
| Unsafe `link` URL (v1.5.0) | `validateURL` (`http`, `https`, `mailto`; no `javascript:`, no control characters) and PDF-string escaping before the `/URI` action |
| Supply-chain risk | Zero extra runtime dependencies; Trusted Publishing (OIDC, npm ≥ 11.5.1) with provenance; CycloneDX SBOM + build attestations on each release; harden-runner + SHA-pinned actions on every job; `npm ci --ignore-scripts`; Dependabot + dependency review + weekly `npm audit`; CodeQL + Scorecard; committed rulesets; a HITL guard hook for agents |
| False PDF/A conformance claims | Blocking veraPDF CI gate (`.github/workflows/verapdf.yml` + the publish gate in `publish.yml`): a CLI-generated 16-file corpus is validated against the veraPDF reference validator, with negative canaries an "accepts-everything" validator would expose. veraPDF is an **external CI tool**, never bundled — the zero-extra-runtime-dependency policy is unchanged — and its pinned 1.30.2 installer's SHA-256 is verified before `java -jar` executes it |
| False PDF/X-4 conformance claims (v1.5.0) | The same corpus carries three PDF/X-4 files (one a negative canary) validated in-process by `validatePdfX` (`scripts/validate-pdfx.ts`, never skipped); `render --pdfx` refuses incoherent input (`E_INPUT`) and `--strict` refuses `PDFX_*` diagnostics before any byte is written |
| Non-deterministic output (v1.5.0) | `--creation-date` / `SOURCE_DATE_EPOCH` pin every date in UTC; the sample corpus is held to a committed SHA-256 baseline (`verify:samples`, required in CI); invalid pins are usage errors, never ignored |

### Network model (v1.4.0)

The CLI is **offline by default**. Network I/O happens **only** on these explicit opt-ins,
and never anywhere else:

| Opt-in | What it fetches |
|--------|-----------------|
| `sign --timestamp <url>` | RFC 3161 timestamp token (TSA) |
| `doc-timestamp --url <url>` | RFC 3161 document timestamp (TSA) |
| `ltv collect` / `ltv add` `--online` | OCSP responses (AIA) + CRLs (CDP) |
| `verify --revocation online` | OCSP responses (AIA) + CRLs (CDP) |
| `batch --allow-network` | Only unlocks the flags above *inside* a manifest |

Every one of these goes through the same SSRF-guarded HTTP(S) client
([`src/utils/fetch-guard.ts`](../src/utils/fetch-guard.ts)):

- scheme allow-list (`http`/`https` only);
- DNS resolution with private / loopback / link-local / unique-local / CGNAT / multicast address blocking (including the cloud-metadata range `169.254.169.254`) and, since v1.5.0, the benchmarking range `198.18.0.0/15`, TEST-NET-1 `192.0.2.0/24` and the NAT64 prefix `64:ff9b::/96` (IPv4-mapped forms included);
- the connection is **pinned** to the vetted resolved IP (defeats DNS rebinding);
- hard request timeout (default 10 s) and response-size cap (default 5 MiB);
- **zero redirect following** (a redirect to an internal host would bypass the checks).

Transport failures surface as the stable `E_NETWORK` code with deliberately generic
messages (no response bodies). `--dry-run` never performs network I/O, even when a
network flag is present.

See [SECURITY.md](../SECURITY.md) for the full policy.

---

## 7. Troubleshooting

### `Error: PDFNATIVE_SIGN_KEY is not set`

The `sign` command requires either the `PDFNATIVE_SIGN_KEY` environment variable (PEM string) or the `--key <path>` flag pointing to a PEM private key file.

```bash
export PDFNATIVE_SIGN_KEY="$(cat private-key.pem)"
pdfnative sign --input doc.pdf --output signed.pdf
```

### `Error: JSON input exceeds 50 MB limit`

The `render` command caps JSON input at 50 MB. Split your document into smaller chunks or use the `pdfnative` library directly for large payloads.

### `Error: Path traversal detected`

All file path flags are validated. Make sure paths do not contain `../` sequences. Use absolute paths if needed.

### `Error: unexpected end of file` from `inspect`

The PDF is likely truncated or corrupted. Verify with a PDF reader before inspecting.

### Piping binary output

When writing PDF bytes to stdout (default, no `--output`), ensure your terminal/pipe handles binary:

```bash
pdfnative render --input doc.json > report.pdf
# Or explicitly:
pdfnative render --input doc.json --output report.pdf
```

### Streaming large documents hangs

With `--stream`, the entire PDF must be consumed before the process exits. Use `--output <file>` to write to disk rather than stdout if the consuming process stalls.

---

## 8. pdfnative API Mapping

| CLI action | pdfnative function | Return type | Notes |
|------------|--------------------|-------------|-------|
| `render` (default) | `buildDocumentPDFBytes(params)` | `Uint8Array` | Synchronous |
| `render --stream` | `buildDocumentPDFStream(params)` | `AsyncGenerator<Uint8Array>` | Single-pass streaming |
| `render --stream-page-by-page` | `buildDocumentPDFStreamPageByPage(params)` | `AsyncGenerator<Uint8Array>` | Object-boundary streaming |
| `render --stream-true` | `buildDocumentPDFStreamTrue(params)` | `AsyncGenerator<Uint8Array>` | True constant-memory streaming |
| `sign` | `signPdfBytes(bytes, options)` | `Uint8Array` | Synchronous; PEM parsed via `parseRsaPrivateKey` + `parseCertificate` |
| `sign --timestamp` (v1.4.0) | `signPdfBytesWithTimestamp(bytes, options)` | `Promise<Uint8Array>` | Async; the CLI injects a `TimestampProvider` (`setTimestampProvider`, [`utils/tsa.ts`](../src/utils/tsa.ts)) — pdfnative never opens a socket itself |
| `ltv collect` (v1.4.0) | `collectValidationInfo(bytes, options)` | `Promise<LtvData>` | Needs a `RevocationProvider` (`setRevocationProvider`, [`utils/ltv-provider.ts`](../src/utils/ltv-provider.ts)) — network via fetch-guard |
| `ltv embed` (v1.4.0) | `embedValidationInfo(bytes, data)` | `Uint8Array` | Offline; writes `/DSS` + `/VRI` as an incremental revision |
| `ltv add` (v1.4.0) | `addValidationInfo(bytes, options)` | `Promise<Uint8Array>` | collect + embed in one pass |
| `doc-timestamp` (v1.4.0) | `addDocumentTimestamp(bytes, options)` | `Promise<Uint8Array>` | Appends a `/DocTimeStamp` field (SubFilter `/ETSI.RFC3161`) incrementally |
| `inspect --signatures` / `verify` / `compare` (v1.4.0) | `listSignatures(bytes)` | `readonly PdfSignatureInfo[]` | fieldName, subFilter, byteRange, `isDocTimestamp`, `isPlaceholder` |
| `metadata` (v1.4.0) | `createModifier(reader)` → `modifier.updateMetadata(update)` → `modifier.save()` | `Uint8Array` | Incremental save; `update` is a `PdfMetadataUpdate`; XMP kept in sync |
| `compare` (v1.4.0) | `extractText(bytes, opts)` + `openPdf` | report | Read-only text + structural comparison |
| `render` print production (v1.4.0) | `layout.print` (`PrintOptions`), `layout.outputIntent`, `layout.viewerPreferences` | — | Bleed/Trim/Art/Crop boxes, printer's marks, `userUnit`; ICC RGB output intent; duplex / copies / print-range / tray hints |
| `render` PDF/A diagnostics (v1.4.0) | `diagnostics` reported by the builders | `diagnostics[]` | stderr warnings, `diagnostics[]` in the `--json` envelope, or a pre-output `E_CHECK_FAILED` under `--strict` |
| Global `--max-inflate-size` (v1.4.0) | `setMaxInflateOutputSize(bytes)` | — | Anti-zip-bomb cap on any single decompressed PDF stream (default 100 MiB, `DEFAULT_MAX_INFLATE_OUTPUT`) |
| Global `--creation-date` / `SOURCE_DATE_EPOCH` (v1.5.0) | `setDefaultCreationDate(date)` / `getDefaultCreationDate()` | — | Process-wide creation instant (UTC) for `/CreationDate`, `xmp:CreateDate`, `{date}`, trailer `/ID`; `batch` tasks inherit it |
| `render` typography (v1.5.0) | `layout.typography` (`TypographyOptions`) | — | Passed through; nested merge in `utils/layout.ts` |
| `render --pdfx` (v1.5.0) | `layout.pdfx` (`PdfXConformanceTarget`, `PDF_X_CONFORMANCE_TARGETS`) + `layout.outputIntent` | — | PDF/X-4 claim; the builders' coherence errors → `classifyBuildError` → `E_INPUT`; `PDFX_*` diagnostics |
| `inspect --pdfx` / `--check pdfx` (v1.5.0) | `validatePdfX(bytes)` | `PdfXValidationResult` | Structural PDF/X-4 validation (`{ valid, target, errors, warnings }`); XMP `pdfxid:GTS_PDFXVersion` read by the CLI |
| `render --font-file` (v1.5.0) | `parseFontData(bytes)` (`pdfnative/tools`) + `validateFontData(fd)` + `registerFont(name, loader)` | `FontData` | Custom fonts from disk; capped, magic-checked, validated |
| `render --font` aliases (v1.5.0) | `registerFonts({ … })` over `BUNDLED_FONT_MODULES` | — | 31 modules / 27 scripts; `ha`/`yo`/`ig`/`sw` → `latin` |
| `annotate` `link` (v1.5.0) | `validateURL(url)` + `modifier.addAnnotation(page, body)` | `Uint8Array` | `/Link` + `/URI` body built by the CLI; incremental save |
| `doctor` (v1.5.0) | `USE_UNICODE_VERSION`, `PDF_A_*` + `PDF_X_CONFORMANCE_TARGETS` | — | Unicode and conformance checks |
| `inspect` (open) | `openPdf(bytes)` | `PdfReader` | Returns reader with `.getCatalog()`, `.getInfo()`, `.pageCount` etc. |

**PdfDict helpers (from pdfnative):**

```typescript
dictGet(dict, key)       // PdfValue | undefined
dictGetName(dict, key)   // string | undefined (strips leading /)
dictGetNum(dict, key)    // number | undefined
dictGetDict(dict, key)   // PdfDict | undefined
dictGetArray(dict, key)  // PdfArray | undefined
```

---

## 9. Development Quick Reference

`npm run gate` is THE quality gate (`scripts/gate.ts`; the `STEPS` table is the source of
truth): `npm run gate:fast` (typecheck:all, lint, test, verify:docs), `npm run gate` (the CI
profile: + coverage, build, dist-check, smoke on the built binary, bundle-size, test:generate,
verify:samples, corpus:pdfa, validate:pdfx) and `npx tsx scripts/gate.ts --publish
--require-all` (+ validate:pdfa; a skipped step fails). Logs go to `test-output/.gate/`.

```bash
# Install (what CI runs)
npm ci --ignore-scripts

# Build (outputs dist/cli.cjs + dist/cli.js + dist/cli.d.ts)
npm run build

# Test
npm test
npm run test:coverage

# Samples — the byte baseline (tests/regression/baselines/samples.sha256.json)
npm run test:generate          # 79 PDFs into test-output/samples/ with the BUILT CLI, TZ=UTC, pinned date
npm run verify:samples         # compare; `npx tsx scripts/verify-samples.ts --update` rebaselines (declare it)

# Conformance corpus — 16 corpus files (PDF/A via veraPDF, an external tool; PDF/X in-process)
npm run corpus:pdfa            # generate test-output/pdfa/ (needs a prior npm run build)
npm run validate:pdfx          # PDF/X-4 entries — never skipped
npm run validate:pdfa          # PDF/A entries — SKIPs with exit 0 without veraPDF (see CONTRIBUTING.md)

# Docs — every count and version comes from docs/assets/ecosystem.json
npm run verify:docs

# Typecheck (three configs) and lint
npm run typecheck:all
npm run lint

# Smoke test the built binary
node dist/cli.cjs --help
node dist/cli.cjs --version
node dist/cli.cjs render --help
echo '{"blocks":[{"type":"paragraph","text":"Hello"}]}' | node dist/cli.cjs render | head -c 4
```

PowerShell swallows a bare `--` after `npm run`, so pass script flags by calling the script
directly (`npx tsx scripts/gate.ts --fast`).

---

## 10. Samples

Complete, runnable examples live in [`samples/`](../samples/), organized by feature category:

| Category | Files | Description |
|----------|-------|-------------|
| [`render/document/`](../samples/render/document/) | 6 | Minimal, report, all-blocks reference, invoice, technical spec, `--max-blocks` guard |
| [`render/table/`](../samples/render/table/) | 2 | Project status, financial summary |
| [`render/barcode/`](../samples/render/barcode/) | 3 | QR code, Code 128 shipping label, EAN-13 |
| [`render/form/`](../samples/render/form/) | 2 | Contact form, survey |
| [`render/toc/`](../samples/render/toc/) | 1 | Document with auto-generated table of contents |
| [`render/link/`](../samples/render/link/) | 1 | Resource directory with hyperlinks |
| [`render/watermark/`](../samples/render/watermark/) | 2 | Draft and confidential watermarks |
| [`render/layout/`](../samples/render/layout/) | 3 | US Letter, A5 portrait, A4 landscape |
| [`render/pdfa/`](../samples/render/pdfa/) | 4 | PDF/A-1b, PDF/A-2b, PDF/A-2u, PDF/A-3b archival conformance (rendered with `--font latin --lang latin`; veraPDF-validated in CI) |
| [`render/chart/`](../samples/render/chart/) | 5 | Native vector charts — incl. (v1.4.0) stacked bars, area + dual axes, log-scale scatter, time x-axis |
| [`render/print/`](../samples/render/print/) | 5 | Print production (`layout.print` bleed/marks) + viewer preferences; (v1.5.0) CMYK colours, colour bars, PDF/X-4 with a synthetic CMYK profile |
| [`render/typography/`](../samples/render/typography/) | 4 | (v1.5.0) Paragraph breaking, justify + optical margins + soft hyphens, French spacing + unit binding, kerning + OpenType features + exact metrics |
| [`render/reproducible/`](../samples/render/reproducible/) | 2 + 1 pair | (v1.5.0) `--creation-date` / `SOURCE_DATE_EPOCH`; the double-render script proves byte identity across timezones |
| [`render/multilang/`](../samples/render/multilang/) | 7 + 2 drivers | Thai, Japanese, multilingual; (v1.5.0) Lao, Tai Tham / New Tai Lue / Tai Le / Cham, Hausa / Yoruba / Igbo / Swahili |
| [`render/font/`](../samples/render/font/) | 4 + 5 pairs | Latin, the 1.3.0 scripts, emoji; (v1.5.0) the five 1.8.0 scripts and `--font-file` |
| [`sign/`](../samples/sign/) | 10 pairs | Digital signature (Bash + PowerShell) — incl. `06-timestamp.*` PAdES B-T, `08-ltv.*` full PAdES ladder, `09-multiple-signatures.*`, (v1.5.0) `10-timestamp-timeout.*` |
| [`verify/`](../samples/verify/) | 7 pairs | Trust roots, strict mode, RSA/ECDSA, revocation, (v1.5.0) `07-weak-digest.*` |
| [`inspect/`](../samples/inspect/) | 10 pairs | JSON/text inspection, CI `--check` gates, PDF/UA, annotations, `--signatures` inventory, (v1.5.0) `09-check-pdfx.*`, `10-iso-dates.*` |
| [`annotate/`](../samples/annotate/) | 2 pairs + 2 JSON | Markup annotations; (v1.5.0) `link` annotations with URL validation |
| [`doctor/`](../samples/doctor/) | 2 pairs | Capability preflight; (v1.5.0) fonts / Unicode / conformance checks |
| [`agent/`](../samples/agent/) | 5 pairs | `--json` + `--dry-run`, `schema`, error envelope, token economy, (v1.5.0) global flags before the command |
| [`metadata/`](../samples/metadata/) | 1 pair + JSON | (v1.4.0) Incremental `/Info` + XMP update that keeps signatures valid |
| [`compare/`](../samples/compare/) | 1 pair + 2 JSON | (v1.4.0) Text/structure diff of two rendered contracts (CI exit codes) |
| [`batch/`](../samples/batch/) | 3 pairs + manifest | Parallel directory render + (v1.4.0) `--manifest` render → encrypt → inspect pipeline |
| [`streaming/`](../samples/streaming/) | 2 pairs + 1 script | Streaming render: single-pass, page-by-page, `--stream-true` |

Generate every sample at once — the same run the CI baseline uses:

```bash
npm run build && npm run test:generate      # 79 PDFs → test-output/samples/ (byte-stable)
npx tsx scripts/verify-samples.ts           # compare with the committed baseline
```

`scripts/generate-samples.ts` (v1.5.0, replaces `samples/run-all.js`) drives the built CLI
under `TZ=UTC` with the creation instant pinned; its plan (`scripts/lib/sample-plan.ts`)
renders the `render/pdfa/` and `render/attachments/` samples with `--font latin --lang latin`
and `print/05-pdfx4.json` with the PDF/X-4 flags, so their outputs actually conform to the
level they claim; the conformance corpus (`npm run corpus:pdfa`) is validated against veraPDF
and the PDF/X validator in the blocking CI gates (see
[CONTRIBUTING.md](../CONTRIBUTING.md#pdfa-validation-verapdf)).

See [`samples/README.md`](../samples/README.md) for the full block type reference and integration patterns.

---

## 11. Integration Patterns

### Shell pipeline
```bash
# Render then sign in a single pipeline
cat doc.json | pdfnative render | \
  PDFNATIVE_SIGN_KEY="$KEY" PDFNATIVE_SIGN_CERT="$CERT" pdfnative sign \
  --output signed.pdf
```

### GitHub Actions
```yaml
- name: Generate signed PDF
  env:
    PDFNATIVE_SIGN_KEY: ${{ secrets.SIGN_KEY }}
    PDFNATIVE_SIGN_CERT: ${{ secrets.SIGN_CERT }}
  run: |
    pdfnative render --input docs/spec.json --output dist/spec.pdf
    pdfnative sign   --input dist/spec.pdf  --output dist/spec-signed.pdf
    pdfnative inspect --input dist/spec-signed.pdf --format text
```

### Docker
```dockerfile
FROM node:22-alpine
RUN npm install --global pdfnative-cli
COPY document.json .
RUN pdfnative render --input document.json --output output.pdf
```

### TypeScript (spawn)
```typescript
import { spawn } from 'node:child_process';

function renderToFile(params: object, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('pdfnative', ['render', '--output', outputPath], {
            stdio: ['pipe', 'ignore', 'inherit'],
        });
        child.stdin.end(JSON.stringify(params), 'utf8');
        child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(`Exit ${code}`))
        );
    });
}
```

### Autonomous agent (JSON envelope + error codes)
```typescript
import { spawnSync } from 'node:child_process';

const r = spawnSync('pdfnative', ['inspect', '--input', 'doc.pdf', '--json'], {
    encoding: 'utf8',
});
if (r.status !== 0) {
    // Diagnostics (including the failure envelope) are on stderr.
    const env = JSON.parse(r.stderr.trim().split('\n').at(-1)!);
    // Branch on the stable class, not the message text.
    if (env.error.code === 'E_PARSE') {
        // … the input was not a readable PDF
    }
} else {
    const report = JSON.parse(r.stdout); // primary artifact on stdout
}
```

### Reproducible pipeline (v1.5.0)
```bash
# Pin the instant once; every PDF of the run is byte-identical on any host / timezone
export SOURCE_DATE_EPOCH=1767225600         # or: pdfnative --creation-date 2026-01-01T00:00:00Z …
pdfnative render --input spec.json --output dist/spec.pdf --font latin --lang latin --tagged pdfa2b
sha256sum dist/spec.pdf                      # a stable hash you can commit next to the input
```

See [AGENT_CONTRACT.md](AGENT_CONTRACT.md) for the full agent contract.

---

## 12. Frequently Asked Questions

### Why are watermarks not visible in `render/watermark/` samples?

**Answer:** Watermarks ARE supported through the CLI and ARE being generated in the PDFs, but the default opacity is so low (0.15 = 15% visible) that they appear **nearly invisible** on screen. This is by design for subtle background watermarks, but can be adjusted.

**Root Cause Analysis:**
- ✅ Watermarks ARE in the PDF structure (`/ExtGState` objects, `/ca` opacity values present)
- ✅ Watermarks ARE supported in JSON via the `layout` field in DocumentParams  
- ✅ CLI correctly processes and embeds them
- ❌ Default opacity (0.15) + background position = almost completely hidden

**Verification:**
```bash
# Render current sample (watermark present but invisible)
pdfnative render --input samples/render/watermark/01-draft.json --output test.pdf
# → PDF contains /ExtGState and /ca 0.15 opacity values (confirmed via inspection)
# → Visual watermark barely visible due to low opacity
```

**Solutions:**

**Option 1: Update JSON with higher opacity**
```json
{
  "title": "Draft Document",
  "blocks": [{ "type": "paragraph", "text": "Content here" }],
  "layout": {
    "watermark": {
      "text": {
        "text": "DRAFT",
        "opacity": 0.35,    // Increase from 0.15 (nearly invisible) to 0.35 (visible)
        "angle": -45,
        "fontSize": 72,
        "color": "#FF6B6B"   // Optional: use color instead of default gray
      },
      "position": "background"  // or "foreground" for even more prominence
    }
  }
}
```

**Option 2: Use foreground position for maximum visibility**
```json
{
  "layout": {
    "watermark": {
      "text": {
        "text": "CONFIDENTIAL",
        "opacity": 0.7,              // 70% opaque
        "angle": -30,
        "fontSize": 88,
        "color": "#CC0000"           // Red color
      },
      "position": "foreground"      // Place above content, not behind
    }
  }
}
```

**Option 3: Current samples (already updated)**
The watermark samples have been updated with visible opacity levels:
- `01-draft.json`: opacity 0.35 (red)
- `02-confidential.json`: opacity 0.7 (red, larger)

Run the updated samples to see visible watermarks:
```bash
npm run build && npx tsx scripts/generate-samples.ts --category watermark
# Open test-output/samples/watermark/*.pdf to see the watermarks
```

**Opacity Guidelines:**
| Opacity | Visual Effect | Use Case |
|---------|---------------|----------|
| 0.10–0.15 | Barely visible | Subtle background indicator (not recommended for most uses) |
| 0.25–0.35 | Clearly visible | Standard watermark for documents |
| 0.50–0.70 | Very prominent | Confidential/urgent documents |
| 0.80–1.00 | Bold, fully opaque | High-priority warnings (not compatible with PDF/A) |

**Note about PDF Viewers:**
- Some older PDF viewers may not render transparency layers correctly
- If watermark still doesn't appear after increasing opacity, try opening in Adobe Reader or a modern browser's PDF viewer



### Which block types are supported through the CLI?

**Supported via JSON (CLI):**
heading, paragraph, list, table, spacer, pageBreak, barcode, link, toc, formField, chart, svg, image

- `svg` — fully JSON-usable since pdfnative ≥ 1.5.0: `SvgBlock.data` is a **string** (SVG path `d` attribute or SVG markup).
- `image` — JSON-usable since v1.4.0 via `src` (JPEG/PNG path, resolved relative to the `--input` JSON's directory) or `dataBase64` (inline base64); the CLI converts either to the `Uint8Array` payload pdfnative expects.

**Supported via layout options:**
- ✅ `watermark` (text or image overlay with opacity, angle, position)
- ✅ `headerTemplate`/`footerTemplate` (customizable header/footer across all pages)
- ✅ `encryption` (AES-128/256 password protection)
- ✅ `tagged` (PDF/A-1b/2b/2u/3b compliance + accessibility)
- ✅ `compress` (FlateDecode stream compression)
- ✅ Custom `pageWidth`, `pageHeight`, `margins`, `colors`, `fontSizes`
- ✅ (v1.4.0) `print` (bleed/trim/art/crop boxes, printer's marks, `userUnit`), `outputIntent` (ICC RGB), `viewerPreferences` (duplex, copies, print range, tray)
- ✅ (v1.5.0) `typography` (widows/orphans, keep-with-next, justify, optical margins, soft hyphens, punctuation spacing, unit binding, kerning, OpenType features, metrics), `print.marks.colourBars`, `pdfx: "pdfx4"` with a CMYK `outputIntent`, `creationDate`, CMYK colours everywhere

**Full example with layout options:**
```json
{
  "title": "Secure Watermarked Document",
  "blocks": [{ "type": "paragraph", "text": "Content" }],
  "layout": {
    "watermark": {
      "text": {
        "text": "CONFIDENTIAL",
        "opacity": 0.35,
        "angle": -45,
        "fontSize": 60
      }
    },
    "encryption": {
      "ownerPassword": "secret123",
      "algorithm": "aes256"
    },
    "tagged": "pdfa2b",
    "compress": true
  }
}
```



### Why does the CLI reject my large JSON file?

**Answer:** The CLI caps JSON input at 50 MB to prevent memory exhaustion during parsing. 

**Solutions:**
1. Split document into smaller chunks, render separately, then combine PDFs
2. Use the `pdfnative` library directly (no size limit, streaming supported)
3. Run with sufficient Node.js heap: `node --max-old-space-size=4096 dist/cli.cjs render ...`

### Can I use pdfnative-cli with stdin/stdout on Windows PowerShell?

**Answer:** Yes. Most examples in documentation use Unix shell syntax (`|`) for clarity, but PowerShell equivalents work:

```powershell
# Unix shell
cat document.json | pdfnative render --output report.pdf

# PowerShell
Get-Content document.json | pdfnative render --output report.pdf

# Or directly via file path
pdfnative render --input document.json --output report.pdf
```

### How do I generate PDFs with custom page sizes or layouts?

**Answer:** Directly from the CLI (since v0.2.0):

```bash
# Named sizes: a4 (default) | letter | legal | a3 | tabloid | a5
pdfnative render --input doc.json --page-size letter --output out.pdf

# Arbitrary WxH in points, plus margins ("top,right,bottom,left" or uniform N)
pdfnative render --input doc.json --page-size 500x700 --margin 40 --output out.pdf
```

Every other `PdfLayoutOptions` field (columns, colors, fontSizes, headers/footers,
watermark, print production, viewer preferences, …) is reachable via `--layout
layout.json` — discover the shape with `pdfnative schema render`.

### Why do two renders of the same JSON differ, and how do I make them identical?

**Answer:** Without a pin, every render stamps the current instant into `/CreationDate`,
`xmp:CreateDate`, the `{date}` placeholder and the trailer `/ID`. Pass the global
`--creation-date <iso8601>` (or set `SOURCE_DATE_EPOCH=<seconds>`) and the output becomes
byte-identical on every host and in every timezone (v1.5.0, dates are written in UTC):

```bash
pdfnative render --input doc.json --output a.pdf --creation-date 2026-01-01T00:00:00Z
TZ=Asia/Tokyo pdfnative render --input doc.json --output b.pdf --creation-date 2026-01-01T00:00:00Z
sha256sum a.pdf b.pdf   # identical
```

Encrypted output can never be identical (the file key comes from the CSPRNG), and a signed
file's incremental revision carries a per-revision `/ID`; `sign --signing-time` and
`metadata --mod-date` are deliberate instants that the pin leaves alone. `compare a.pdf
b.pdf` is the assertion when a byte comparison is too strict.

### PDF/A or PDF/X — which one, and can I have both?

**Answer:** PDF/A (`--tagged pdfa<level>`) is the archival profile (ISO 19005: embedded
fonts, sRGB output intent, tagged structure); PDF/X-4 (`--pdfx pdfx4`, v1.5.0) is the print
exchange profile (ISO 15930-7: a `prtr` CMYK output intent, `/Trapped` true or false, no
annotations inside the page boxes). The engine emits one or the other in a file — the CLI
refuses `--pdfx` together with `--tagged` (exit 2) — and refuses encryption with either. Check
a claim with `inspect --check pdfa` / `--check pdfx`; the PDF/A gate is veraPDF, the PDF/X
check is pdfnative's structural validator (not a certified preflight tool). `metadata` drops
a PDF/X identification when it rewrites the XMP (upstream limit) — re-check afterwards.

### What's the difference between `render` and `inspect`?

| Option | Purpose | Input | Output |
|--------|---------|-------|--------|
| `render` | Create a new PDF | JSON | PDF binary |
| `inspect` | Analyze an existing PDF | PDF binary | JSON/text metadata |
| `sign` | Add digital signature | Existing PDF | Signed PDF |
| `verify` | Verify CMS/PKCS#7 signatures | Signed PDF | JSON/text report |

Think of it as: **render** (create) → **sign** (secure) → **inspect** (analyze) → **verify** (validate)

### How do I debug JSON parsing errors?

**Answer:** Syntax errors show which line failed. Common issues:

```javascript
// ❌ Trailing commas
{ "blocks": [{"type": "paragraph", "text": "test"},] }

// ❌ Missing quotes around keys
{ type: "paragraph", "text": "test" }

// ❌ Mixing incompatible properties
{ "type": "heading", "text": "Title", "items": [...] }  // items is for lists
```

**Validate before rendering:**
```bash
# Check JSON syntax
 cat document.json | python3 -m json.tool > /dev/null && echo "Valid"

# Then render
pdfnative render --input document.json --output output.pdf
```

### Are there security considerations I should know?

**Yes. The CLI includes hardened defaults:**
- ✅ Path traversal validation (blocks `../`)
- ✅ JSON size limit (50 MB — documents and `--layout` files); ICC profiles ≤ 16 MiB and fonts ≤ 32 MiB, magic-checked and parsed before use
- ✅ Key material never logged (for `sign` command)
- ✅ URL validation (blocks `javascript:` etc. in hyperlinks and `annotate` links)
- ✅ Offline by default; the SSRF guard blocks private, loopback, link-local, CGNAT, multicast, benchmarking, TEST-NET and NAT64 ranges
- ✅ NPM-signed builds with provenance (Trusted Publishing, SBOM + attestations)

**When handling sensitive data:**
- Don't log DocumentParams if it contains PII
- Use env vars for signing keys: `PDFNATIVE_SIGN_KEY` / `PDFNATIVE_SIGN_CERT`
- Validate user-provided JSON before rendering

See [SECURITY.md](../SECURITY.md) for the full policy.

---

*Verified on 2026-09-16 · pdfnative-cli v1.5.0 · pdfnative 1.8.0*
