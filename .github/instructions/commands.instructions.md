---
description: "Use when implementing or modifying render, sign, or inspect commands. Covers flag conventions, stdin/stdout, streaming, secret handling, and error contracts."
applyTo: "src/commands/**"
---
# Command Implementation Standards

## Shared Conventions

- Signature: `export async function <name>(args: ParsedArgs): Promise<void>`
- `--input` = file path; omit → read from stdin
- `--output` = file path; omit → write to stdout (binary: `process.stdout.write(buffer)`)
- Validation/usage errors → `throw new CliError('message', 2)`
- Runtime errors → `throw new CliError('message', 1)`
- Never catch and swallow errors — let `main()` handle exit

## `render` Command

```
pdfnative render [--input <file.json>] [--output <out.pdf>] [--stream] [--conformance 1b|2b|3b]
```

- Reads JSON from `--input` or stdin.
- Parses as `DocumentParams` (full pdfnative API surface).
- Input size cap: **50 MB** before `JSON.parse` — throw `CliError` if exceeded.
- `--stream` flag: use `streamDocumentPdf` (AsyncGenerator) instead of `buildDocumentPDFBytes`.
  - When streaming to a file, pipe chunks via `fs.createWriteStream`.
  - When streaming to stdout, call `process.stdout.write(chunk)` per chunk.
- `--conformance`: inject `pdfaConformance` into the parsed params.

## `sign` Command

```
pdfnative sign --input <file.pdf> [--output <out.pdf>] [--key <key.pem>] [--cert <cert.pem>]
```

- Secret loading priority (highest first):
  1. `PDFNATIVE_SIGN_KEY` env var (PEM string of private key)
  2. `--key <path>` flag (file path to PEM)
  - Same logic for cert: `PDFNATIVE_SIGN_CERT` → `--cert`.
- **Never log key material** — not on error, not on debug. Truncate or omit from messages.
- If neither env var nor flag is provided for key or cert → `CliError` exit code 2.
- Path traversal: validate `--input`, `--output`, `--key`, `--cert` against `../` sequences.
- Call `signPdfBytes(pdfBytes, { privateKeyPem, certificatePem })` from core-bridge.

## `inspect` Command

```
pdfnative inspect [--input <file.pdf>] [--format json|text]
```

- Default output format: `json`.
- `--format text`: human-readable table (key: value lines).
- Output shape (JSON):
  ```json
  {
    "version": "1.7",
    "pageCount": 3,
    "encrypted": false,
    "pdfaConformance": "2b",
    "signatures": 1,
    "metadata": { "title": "...", "author": "...", "creationDate": "..." }
  }
  ```
- No raw binary blobs in output — sanitize all fields.
- Uses `PdfReader` from core-bridge.

## Security Checklist

- All file paths: validate no `..` segments before read/write.
- JSON input: size-check buffer before parsing (50 MB cap).
- Signing keys: zero from memory isn't guaranteed in JS, but never persist or log.
