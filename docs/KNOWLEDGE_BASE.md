# pdfnative-cli — Knowledge Base

> This document is structured for AI assistants (GitHub Copilot, Claude, Cursor, Continue, Zed).  
> It provides the full context needed to understand, extend, and debug pdfnative-cli without reading all source files.

---

## 1. Context

**What is pdfnative-cli?**
The official command-line interface for [`pdfnative`](https://github.com/Nizoka/pdfnative) — a zero-dependency, ISO 32000-1 compliant PDF generation library. The CLI exposes six commands: `render`, `sign`, `inspect`, `verify`, `batch`, `completion`.

**Philosophy:**
- Zero extra runtime dependencies — `pdfnative` is the *only* dependency.
- Pure dispatch layer — no PDF logic lives in the CLI itself.
- Composable — every command reads from stdin and writes to stdout by default.

**Targets:** Node.js ≥ 20, Bun, Deno (via `node dist/cli.cjs`)

**Repository:** https://github.com/Nizoka/pdfnative-cli  
**npm:** https://www.npmjs.com/package/pdfnative-cli  
**Parent library:** https://github.com/Nizoka/pdfnative

---

## 2. Architecture

```
src/
├── index.ts              # Entry: parse argv → config merge → dispatch → process.exit
├── commands/
│   ├── render.ts         # JSON → PDF (buildDocumentPDF*, smart tables, page streaming)
│   ├── sign.ts           # PDF + key/cert → addSignaturePlaceholder → signPdfBytes
│   ├── inspect.ts        # PDF → PdfReader → metadata JSON/text
│   ├── verify.ts         # PDF → CMS + timestamp (PAdES-T) + OCSP/CRL revocation
│   ├── batch.ts          # Directory of JSON → parallel render → per-file summary
│   └── completion.ts     # bash/zsh/fish completion scripts
├── utils/
│   ├── args.ts           # Zero-dep argument parser
│   ├── io.ts             # stdin/stdout/file I/O helpers
│   ├── config.ts         # `.pdfnativerc.json` discovery + flag-default merge
│   ├── colors.ts         # NO_COLOR/TTY-aware ANSI helper
│   ├── layout.ts         # Layout option composer (CLI flags + --layout file merge)
│   ├── keys.ts           # PEM / PEM-chain loader (key-material redaction on error)
│   ├── asn1-walk.ts      # ASN.1/DER walker with absolute byte offsets (50 MiB cap)
│   ├── cms-verify.ts     # RSA/ECDSA CMS + verifySignedStructure (CRL/OCSP)
│   ├── cert-chain.ts     # X.509 chain construction + trust evaluation
│   ├── timestamp-verify.ts # RFC 3161 timestamp validation (PAdES-T)
│   ├── revocation.ts     # OCSP (RFC 6960) + CRL (RFC 5280), DSS + online
│   ├── fetch-guard.ts    # SSRF-guarded HTTP(S) client (opt-in online revocation)
│   └── error.ts          # CliError class + die() + deprecate() helpers
└── core-bridge/
    └── index.ts          # Selective re-exports from pdfnative
```

### Data Flow

```
process.argv
    │
    ▼
src/index.ts
  parseArgs(argv)    ← src/utils/args.ts
  switch(command)
    │
    ├── render   → src/commands/render.ts
    │               readFileOrStdin(--input)
    │               JSON.parse (50 MB cap)
    │               buildDocumentPDFBytes (or streamDocumentPdf --stream)
    │               writeOutput(--output or stdout)
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

function parseArgs(argv: string[]): ParsedArgs
```

Handles:
- `--flag value` → `flags.flag = 'value'`
- `--flag=value` → `flags.flag = 'value'`
- `-f value` → `flags.f = 'value'` (single dash, one char)
- `--flag` (no following value) → `flags.flag = true`
- `--` → everything after goes into `positionals`
- Positional args (no leading `--`/`-`) → `positionals[]`

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
```

This keeps the rest of the CLI decoupled from pdfnative internal paths.

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
pdfnative render [--input <file.json>] [--output <out.pdf>] [--stream|--stream-page-by-page|--stream-true] [--tagged pdfa2b] [--font <code>] [--lang <code>] [--max-blocks <n>]
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
| `--font` | string (repeatable) | — | Register a bundled font shortcut (see Multilingual rendering below) |
| `--lang` | string (comma list) | — | Preferred font code per script (`th`, `ja`, `ar`, …) |
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
| `paragraph` | `text` | `fontSize`, `align` (`left`\|`center`\|`right`), `lineHeight`, `indent`, `color` | [02-report.json](../samples/render/document/02-report.json) |
| `table` | `headers` (string[]), `rows` (string[][]) | — | [01-project-status.json](../samples/render/table/01-project-status.json) |
| `list` | `items` (string[]), `style` (`bullet`\|`numbered`) | `fontSize` | [03-all-blocks.json](../samples/render/document/03-all-blocks.json) |
| `barcode` | `format` (`qr`\|`code128`\|`ean13`\|`datamatrix`\|`pdf417`), `data` | `width`, `caption` | [01-qr-url.json](../samples/render/barcode/01-qr-url.json) |
| `link` | `text`, `url` | `fontSize`, `color` | [01-resource-directory.json](../samples/render/link/01-resource-directory.json) |
| `toc` | — | `title`, `maxLevel` | [01-document-with-toc.json](../samples/render/toc/01-document-with-toc.json) |
| `formField` | `fieldType` (`text`\|`textarea`\|`checkbox`\|`radio`\|`select`), `name` | `label`, `value`, `placeholder`, `options`, `readOnly`, `required`, `maxLength`, `width` | [01-contact-form.json](../samples/render/form/01-contact-form.json) |
| `spacer` | `height` (points) | — | any sample |
| `pageBreak` | — | — | [03-all-blocks.json](../samples/render/document/03-all-blocks.json) |

> `image` and `svg` block types require `Uint8Array` payloads and are only usable via the `pdfnative` Node.js API — not through the CLI JSON interface.

**Experimental / Not yet exposed in CLI:**
- `watermark` — Use `pdfnative` Node.js API directly: `buildDocumentPDFBytes(params, { watermark: {...} })`
- Custom header/footer templates — Use `headerTemplate` and `footerTemplate` in layout options (Node.js API)
- Encryption — Use `encryption` option in layout (Node.js API)

See [`samples/`](../samples/) for complete working examples of every supported block type.

**Security:** JSON buffer size is checked before parse. If > 50 MB → `CliError(exit 1)`.

**Streaming behaviour:** Three mutually-exclusive modes. `--stream` uses a single-pass
AsyncGenerator; `--stream-page-by-page` streams at PDF object boundaries (TOC- and
`{pages}`-compatible); `--stream-true` (pdfnative 1.3.0) emits and frees parts as it goes for
the lowest peak memory and is byte-identical to the buffered builders. Each writes every
`Uint8Array` chunk immediately to the output and is compatible with piping to compression tools.

**Multilingual rendering (`--font` / `--lang` flags):**

The `--font <code>` flag (repeatable) registers a **bundled** pdfnative font for the duration of
the render — no wrapper script required. The allow-list is `latin`, `emoji`, `color-emoji`, and
the 22 script codes `ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`. Each
name doubles as its `--lang` code; pdfnative routes each code point to the font whose cmap
covers it, so mixed-script and colour-emoji text renders automatically.

```bash
# Telugu (one of the six scripts new in pdfnative 1.3.0)
pdfnative render --input te.json --font te --lang te --output te.pdf

# COLRv1 colour emoji
pdfnative render --input party.json --font color-emoji --lang color-emoji --output party.pdf

# Mixed: English (built-in) + Japanese + Arabic in one document
pdfnative render --input multi.json --font ja --font ar --output multi.pdf
```

**Advanced (custom / non-bundled fonts):** to supply your own `fontData`, use the pdfnative
Node.js API directly from a thin wrapper script:

```js
// myscript.js (Node.js >= 20, ESM)
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

All Noto font data packages (`noto-thai-data.js`, `noto-jp-data.js`, `noto-arabic-data.js`, `noto-cyrillic-data.js`, `noto-devanagari-data.js`, and 11 others) are **bundled with pdfnative ≥ 1.0.5** — no external file downloads needed.

See [`samples/render/multilang/`](../samples/render/multilang/) for complete working examples:
- `03-thai.js` + `03-thai.json` — full Thai monthly report
- `04-multilingual.js` + `04-multilingual.json` — English + Thai + Japanese + Arabic + Russian in one PDF

---

### `sign`

**Purpose:** Apply a CMS/PKCS#7 digital signature to an existing PDF.

```bash
pdfnative sign --input <file.pdf> [--output <out.pdf>] [--key <key.pem>] [--cert <cert.pem>]
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | — (**required**) | Input PDF path |
| `--output` | string | stdout | Signed PDF path |
| `--key` | string | `PDFNATIVE_SIGN_KEY` env | Path to PEM private key file |
| `--cert` | string | `PDFNATIVE_SIGN_CERT` env | Path to PEM certificate file |

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
| `--pages` | boolean | false | Add per-page metadata array |
| `--pdfua` | boolean | false | Add a PDF/UA (ISO 14289-1) structural validation report |
| `--check` | `pdfa`\|`signed`\|`encrypted`\|`pdfua` (repeatable) | — | CI assertion; sets exit code (0 = pass, 1 = fail) |

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
    "creationDate": "2026-04-27T12:00:00+00:00"
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
- On **success**, `render` / `sign` / `batch` emit a status line:
  `{ "ok": true, "command": "render", "variant": "document", "dryRun": false, "output": "out.pdf", "bytes": 12345 }`.
- `inspect` / `verify` / `batch` already put their result document on stdout as
  JSON; `--json` only adds the stderr failure envelope (and forces `batch`'s
  JSON summary).

The helpers live in [`src/utils/agent.ts`](../src/utils/agent.ts):
`isJsonMode()`, `isDryRun()`, `buildErrorEnvelope()`, `emitJsonError()`,
`emitStatus()` (a no-op outside `--json`, so commands call it unconditionally).

### Stable error codes

Defined in [`src/utils/error.ts`](../src/utils/error.ts) as `ErrorCode` and
carried on every `CliError.code`:

| Code | Meaning |
|------|---------|
| `E_USAGE` | Missing/invalid flag or argument (exit 2) |
| `E_INPUT` | Input payload wrong shape / failed validation |
| `E_PARSE` | Could not parse JSON / PDF / DER |
| `E_IO` | Filesystem or stream I/O failure |
| `E_SIGN` | Signing failed (generic message — never leaks key material) |
| `E_VERIFY_FAILED` | `verify --strict` found an invalid signature |
| `E_CHECK_FAILED` | `inspect --check` assertion failed |
| `E_UNSUPPORTED` | Reserved / not-yet-available capability |
| `E_RUNTIME` | Catch-all runtime error |

When no code is passed, `CliError` derives one from the exit code
(`2 → E_USAGE`, otherwise `E_RUNTIME`), so legacy call sites get a sensible
code for free.

### `--dry-run`

`render`, `sign`, and `batch` accept `--dry-run` (sets `PDFNATIVE_DRY_RUN=1`).
Inputs are fully validated — and for `sign`, credentials are parsed and the PDF
is placeholder-prepared — but **no output is produced or written**. Commands
read `hasFlag(args.flags, 'dry-run') || isDryRun()` so a direct command call and
the global flag both work.

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
| `inspect` | `{ pages, encrypted, signatures, pdfa }` |
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
versioned JSON Schema (Draft 2020-12) for `render` input, `inspect` / `verify`
/ `batch` output, or the `inspect-summary` / `verify-summary` / `batch-summary`
compact shapes. The `$id` embeds the CLI version
(`https://pdfnative.dev/schema/cli/<version>/<subject>.schema.json`) so callers
can detect drift. `schema list` enumerates the subjects.

See [AGENTS.md](../AGENTS.md) for the agent-facing summary.

---

## 6. Security Model

| Threat | Mitigation |
|--------|-----------|
| Path traversal via `--input`/`--output`/`--key`/`--cert` | `validatePath()` checks for `../` before any `fs.readFile` / `fs.writeFile` |
| Memory exhaustion via large JSON | 50 MB size check before `JSON.parse` |
| Key material leakage via logs | Keys never included in error messages; `sign` command silences all key-related debug output |
| Binary injection via inspect output | All metadata fields are string-coerced; no raw binary blobs emitted |
| Supply-chain risk | Zero extra runtime dependencies; OIDC-signed npm provenance; CodeQL + Scorecard CI; CycloneDX SBOM attached to each release |

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
| `render --stream-page-by-page` | `buildDocumentPDFPageStream(params)` | `AsyncGenerator<Uint8Array>` | Object-boundary streaming |
| `render --stream-true` | `buildDocumentPDFStreamTrue(params)` | `AsyncGenerator<Uint8Array>` | True constant-memory streaming |
| `sign` | `signPdfBytes(bytes, options)` | `Uint8Array` | Synchronous; PEM parsed via `parseRsaPrivateKey` + `parseCertificate` |
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

```bash
# Install
npm install

# Build (outputs dist/cli.cjs + dist/cli.js + dist/cli.d.ts)
npm run build

# Test
npm test
npm run test:coverage

# Typecheck
npm run typecheck

# Lint
npm run lint

# Smoke test the built binary
node dist/cli.cjs --help
node dist/cli.cjs --version
node dist/cli.cjs render --help
echo '{"blocks":[{"type":"paragraph","text":"Hello"}]}' | node dist/cli.cjs render | head -c 4
```

---

## 10. Samples

Complete, runnable examples live in [`samples/`](../samples/), organized by feature category:

| Category | Files | Description |
|----------|-------|-------------|
| [`render/document/`](../samples/render/document/) | 5 | Minimal, report, all-blocks reference, invoice, technical spec |
| [`render/table/`](../samples/render/table/) | 2 | Project status, financial summary |
| [`render/barcode/`](../samples/render/barcode/) | 3 | QR code, Code 128 shipping label, EAN-13 |
| [`render/form/`](../samples/render/form/) | 2 | Contact form, survey |
| [`render/toc/`](../samples/render/toc/) | 1 | Document with auto-generated table of contents |
| [`render/link/`](../samples/render/link/) | 1 | Resource directory with hyperlinks |
| [`render/watermark/`](../samples/render/watermark/) | 2 | Draft and confidential watermarks |
| [`render/layout/`](../samples/render/layout/) | 3 | US Letter, A5 portrait, A4 landscape |
| [`render/pdfa/`](../samples/render/pdfa/) | 3 | PDF/A-1b, PDF/A-2b, PDF/A-3b archival conformance |
| [`sign/`](../samples/sign/) | 2 scripts | Digital signature (Bash + PowerShell) |
| [`inspect/`](../samples/inspect/) | 4 scripts | JSON and text inspection (Bash + PowerShell) |
| [`streaming/`](../samples/streaming/) | 1 script | 200-section document via streaming render |

Run all render samples at once:

```bash
node samples/run-all.js
```

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

See [AGENTS.md](../AGENTS.md) for the full agent contract.

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
node samples/run-all.js
# Open samples/output/render/watermark/*.pdf to see the watermarks
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
heading, paragraph, list, table, spacer, pageBreak, barcode, link, toc, formField

**Supported via layout options:**
- ✅ `watermark` (text or image overlay with opacity, angle, position)
- ✅ `headerTemplate`/`footerTemplate` (customizable header/footer across all pages)
- ✅ `encryption` (AES-128/256 password protection)
- ✅ `tagged` (PDF/A-1b/2b/3b compliance + accessibility)
- ✅ `compress` (FlateDecode stream compression)
- ✅ Custom `pageWidth`, `pageHeight`, `margins`, `colors`, `fontSizes`

**Not exposed via JSON (CLI):**
- `image`, `svg` (require binary `Uint8Array` — use Node.js API directly)

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

**Answer:** The CLI currently uses standard A4 page sizing. For custom layouts:

**Option 1 (No custom sizing):** Accept default A4 formatting
- Content automatically reflowed to fit
- Margins are optimized for readability

**Option 2 (Full control):** Use `pdfnative` Node.js API
```typescript
import { buildDocumentPDFBytes } from 'pdfnative';

const pdf = buildDocumentPDFBytes(
  { /* params */ },
  {
    pageWidth: 500,
    pageHeight: 700,
    margins: { t: 40, r: 40, b: 40, l: 40 }
  }
);
```

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
- ✅ JSON size limit (50 MB)
- ✅ Key material never logged (for `sign` command)
- ✅ URL validation (blocks `javascript:` etc. in hyperlinks)
- ✅ NPM-signed builds with provenance

**When handling sensitive data:**
- Don't log DocumentParams if it contains PII
- Use env vars for signing keys: `PDFNATIVE_SIGN_KEY` / `PDFNATIVE_SIGN_CERT`
- Validate user-provided JSON before rendering

See [SECURITY.md](../SECURITY.md) for the full policy.

---

*Last updated: 2026-04-27 | pdfnative-cli v0.1.0*
