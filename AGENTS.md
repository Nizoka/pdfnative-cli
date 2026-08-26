# AGENTS.md — Driving pdfnative-cli from autonomous agents

`pdfnative-cli` is built so that an autonomous AI agent — or any program — can
drive it inside a larger automated process **deterministically and safely**.

There is **no separate runtime** for this: agent support is a thin presentation
layer over the normal command dispatch. The official [pdfnative MCP server] is a
different integration; this document is about driving the **CLI** directly (spawn
a process, pass flags, read stdout/stderr, branch on the exit code).

[pdfnative MCP server]: https://pdfnative.dev

---

## 1. The process contract

**Prerequisite:** Node.js ≥ 22 (check with `pdfnative doctor`).

| Channel | Carries |
|---------|---------|
| **stdout** | The primary artifact: a PDF (`render`, `sign`, `merge`, `extract`, `annotate`, `fill`, `encrypt`, `decrypt`, `metadata`, `ltv embed`/`ltv add`, `doc-timestamp`), extracted text (`extract-text`), a JSON report (`inspect`, `verify`, `compare --format json`, `batch --format json`, `govern verify-issue --json`, `doctor --format json`, `fill --export`, `ltv collect`), a JSON Schema (`schema`), the governance protocol/policy (`govern rules`/`policy`), or a completion script (`completion`). `split` writes its parts to `--output-dir`. |
| **stderr** | All diagnostics: progress, warnings, and the agent JSON envelopes below. |
| **exit code** | `0` success · `1` runtime error · `2` usage error. Unchanged in every mode. |

Keep stdout binary-clean: write PDFs to `--output <file>` or redirect stdout, and
read the envelope from stderr.

---

## 2. Agent mode — `--json`

Pass the global `--json` flag to any command to switch on machine-readable
envelopes (the data on stdout is unchanged; `inspect`/`verify`/`batch` already
default to JSON on stdout).

**On failure**, a single JSON object is written to stderr:

```json
{ "ok": false, "command": "inspect", "error": { "code": "E_PARSE", "message": "Failed to read PDF: …" } }
```

**On success**, the write commands — `render` / `sign` / `merge` / `split` / `extract` /
`annotate` / `fill` / `encrypt` / `decrypt` / `metadata` / `ltv` / `doc-timestamp` /
`batch` — write a status line to stderr (schema: `pdfnative schema status`):

```json
{ "ok": true, "command": "render", "variant": "document", "dryRun": false, "output": "out.pdf", "bytes": 12345 }
```

Two additive fields can appear in the success envelope: a timestamped signature
(`sign --timestamp`) adds `timestamp: { url, digest }`, and `render` adds a
`diagnostics: [{ code, severity, message }]` array when non-strict PDF/A conformance
diagnostics were found. Both are pinned by the `status` schema.

`inspect`, `verify`, and `batch` put their result document on **stdout** as JSON;
`--json` only adds the failure envelope on stderr and (for `batch`) forces the
JSON summary.

### Stable error codes

Branch on `error.code`, never on the human message:

| Code | Meaning | Typical exit |
|------|---------|--------------|
| `E_USAGE` | Missing/invalid flag or argument | 2 |
| `E_INPUT` | Input payload wrong shape / failed validation | 1 |
| `E_PARSE` | Could not parse JSON / PDF / DER input | 1 |
| `E_IO` | Filesystem or stream I/O failure | 1 |
| `E_SIGN` | Signing failed (message is always generic — no key material) | 1 |
| `E_VERIFY_FAILED` | `verify --strict` found an invalid signature | 1 |
| `E_CHECK_FAILED` | `inspect --check` assertion failed, `compare` found differences, or `render --strict` hit a PDF/A diagnostic | 1 |
| `E_POLICY` | `govern verify-issue` found a governance violation | 1 |
| `E_UNSUPPORTED` | Reserved / not-yet-available capability | 2 |
| `E_PASSWORD` | Encrypted PDF: password missing or incorrect (`extract-text` / `fill` / `encrypt` / `decrypt` / `inspect` / `annotate` / `metadata` / page-tree) | 1 |
| `E_NETWORK` | Opt-in network operation failed (TSA / OCSP / CRL fetch — `sign --timestamp`, `ltv collect`/`add`, `doc-timestamp`) | 1 |
| `E_RUNTIME` | Catch-all runtime error | 1 |

---

## 3. Token economy — compact JSON, `--summary`, `--fields`

The JSON `inspect` / `verify` / `batch` write to **stdout** is the bulk of what an
agent pays for in tokens. Three composable levers shrink it — typically by ~90 %
— without losing the fields you branch on. They apply to all three JSON-on-stdout
commands.

**Compact by default under `--json`.** In agent mode the stdout JSON is minified
(no indentation, no padding) instead of the human 2-space form. Pass `--pretty`
to force indentation back on. Outside `--json` the output stays pretty for humans.

**`--summary` — the canonical minimal verdict.** Collapses the full report to the
handful of fields an orchestrator actually gates on:

| Command | `--summary` shape |
|---------|-------------------|
| `inspect` | `{ "pages": <int>, "encrypted": <bool>, "signatures": <int>, "pdfa": <string\|null> }` |
| `verify`  | `{ "valid": <bool>, "signatures": <int>, "invalid": <int> }` |
| `batch`   | `{ "total": <int>, "succeeded": <int>, "failed": <int> }` (drops the per-file `results` array) |

**`--fields a,b.c` — dot-path projection.** Keep only the paths you name. A
segment landing on an array maps over every element; unknown paths are silently
omitted (so a conditionally-absent field never crashes the run). Precedence:
`--summary` is applied first, then `--fields` projects the result.

```bash
# Smallest possible "is this PDF signed and valid?" probe:
pdfnative verify --input doc.pdf --json --summary            # → {"valid":false,"signatures":0,"invalid":0}
pdfnative verify --input doc.pdf --json --fields allValid     # → {"allValid":false}
pdfnative inspect --input doc.pdf --json --fields pageCount,signatures
pdfnative batch  --input-dir in --output-dir out --json --summary
```

The compact shapes are schema-pinned — validate them with
`schema inspect-summary`, `schema verify-summary`, `schema batch-summary`.

---

## 4. Validate first — `--dry-run`

`render`, `sign`, `batch`, `merge`, `split`, `extract`, `annotate`, `fill`, `encrypt`,
`decrypt`, `metadata`, `ltv`, and `doc-timestamp` accept `--dry-run`:
inputs are fully validated (JSON parsed, document/table shape checked, layout assembled,
signing credentials loaded and the PDF prepared, page ranges and annotation specs
bounds-checked) but **no output is produced or written**. `--dry-run` **never performs
network I/O**, even when a network flag (`--timestamp`, `--url`, `--online`) is present.
Combine with `--json` for a `{ "ok": true, "dryRun": true, … }` envelope.

```bash
pdfnative render --input doc.json --dry-run --json
```

---

## 5. Discover shapes — `schema`

Fetch a versioned JSON Schema (Draft 2020-12) and validate input with your own
tooling before invoking a command. Each schema carries a `$id` embedding the CLI
version so you can detect drift.

```bash
pdfnative schema list             # → { "subjects": [ …all subjects… ] }
pdfnative schema render           # input accepted by `render`
pdfnative schema inspect          # output of `inspect --format json`
pdfnative schema verify-summary   # output of `verify --summary`
pdfnative schema annotate         # annotation-spec accepted by `annotate --annotations`
pdfnative schema extract-text     # output of `extract-text --format json`
pdfnative schema fill             # values map accepted by `fill --data`
pdfnative schema form-export      # output of `fill --export`
pdfnative schema metadata         # JSON accepted by `metadata --from-json` (v1.4.0)
pdfnative schema doctor           # output of `doctor --format json`
pdfnative schema govern-verify    # output of `govern verify-issue --json`
pdfnative schema ltv-data         # replayable JSON from `ltv collect` / input of `ltv embed` (v1.4.0)
pdfnative schema compare          # output of `compare --format json` (v1.4.0)
pdfnative schema batch-manifest   # pipeline file accepted by `batch --manifest` (v1.4.0)
pdfnative schema status           # the --json success envelope (write commands)
pdfnative schema manifest         # capability manifest: commands, flags, error codes (DATA, not a schema)
```

**Tool discovery.** `pdfnative schema manifest` emits a single JSON document listing every
command, its flags, the global flags, and the stable error codes — enough to register the CLI
as a tool set at runtime. A prose/LLM-facing version lives in `llms.txt` at the repo root.

**Text extraction for RAG.** `extract-text --format ndjson` emits one JSON object per page
(`{ pageIndex, text, runs? }`), which streams cleanly into a retrieval pipeline; add `--runs`
for positioned runs, `--password` for encrypted PDFs. No OCR — image-only pages yield empty text.

---

## 6. Governance & Human-in-the-Loop — `govern`

pdfnative's monorepo governance model treats AI agents as **draftsmen**, never
autonomous submitters. The `govern` command makes that contract actionable from any
agent pipeline — entirely offline, no GitHub or network access:

```bash
pdfnative govern rules                  # the human/agent protocol (AGENT_RULES) on stdout
pdfnative govern policy --json          # machine-readable policy JSON on stdout
pdfnative govern verify-issue draft.md  # gate a draft: exit 1 / E_POLICY on a violation
```

Rules an agent MUST honour:

- **No autonomous GitHub writes.** Never open, edit, label, close, comment on, or submit
  issues / PRs / releases. Produce a **local draft** plus a compliance report and hand it
  to the human.
- **Zero runtime dependencies.** Never propose adding an npm runtime package — this is a
  hard block that `verify-issue` enforces.
- **Local reproduction required.** A bug draft must include a minimal, executed repro
  inside a fenced code block; `verify-issue` fails the draft otherwise.
- **Identity integrity.** Anything submitted is published under the **human's** GitHub
  identity; remind them of their shared responsibility.

`govern verify-issue` returns `{ ok, errors, warnings }` under `--json`. A passing check is
**necessary but not sufficient** — the human review gate always applies. Recommended flow:
draft locally → `govern verify-issue` → present to the human → the **human** submits.

---

## 7. Recommended agent loop

1. `pdfnative --version --json` → confirm the CLI is present and pin the version.
2. `pdfnative schema render` → validate the document you intend to render.
3. `pdfnative render --input doc.json --output out.pdf --dry-run --json` → pre-flight.
4. `pdfnative render --input doc.json --output out.pdf --json` → produce the PDF;
   read the status envelope from stderr.
5. On any non-zero exit, parse the stderr envelope and branch on `error.code`.

For `verify`/`inspect`, read the JSON result on stdout and use `--strict` /
`--check` to turn findings into exit codes for unattended gating. Add
`--summary` (or `--fields`) to keep that stdout JSON token-cheap — see §3.

**PDF/A changes → veraPDF gate.** An agent working **on this repository** must run
`npm run validate:pdfa` for any change touching PDF/A behaviour (render, fonts,
metadata/XMP, signing over claiming files, the `samples/render/pdfa/` inputs): it
builds the CLI, generates a 12-file corpus (including negative canaries veraPDF must
reject) and validates every file against the profile it claims. Mind the skip
semantics — **without veraPDF installed the script exits 0 as a SKIP, not a pass**;
set `VERAPDF_REQUIRED=1` to fail closed. The same gate runs blocking in CI and
pre-publish. For rendering, the conformance recipe is
`--tagged pdfa<level> --font latin --lang latin` (ISO 19005 requires embedded fonts).

**Assert with `compare` (v1.4.0).** `compare a.pdf b.pdf` is a ready-made CI/agent
assertion: identical documents exit `0`; any text or structure difference exits `1`
with `E_CHECK_FAILED` (the diff report lands on stdout first — add `--format json`
and, e.g., `--tolerance 1 --ignore-whitespace` to absorb benign drift). Use it to
gate "did my edit change only what I intended?" without parsing anything.

**Orchestrate with `batch --manifest` (v1.4.0).** Instead of shelling out N times,
declare the whole pipeline once and run it fail-fast in a single process:

```json
{ "version": 1, "tasks": [
  { "id": "r", "command": "render",  "flags": { "input": "doc.json", "output": "doc.pdf" } },
  { "id": "s", "command": "sign",    "flags": { "input": "@r", "output": "signed.pdf" } },
  { "id": "v", "command": "verify",  "flags": { "input": "@s", "strict": true } }
] }
```

`"@<id>"` references the output of an earlier task; relative paths resolve against
the manifest's directory; 14 commands are whitelisted — `render`, `sign`, `verify`,
`inspect`, `merge`, `split`, `extract`, `extract-text`, `fill`, `encrypt`, `decrypt`,
`annotate`, `metadata`, `doc-timestamp` (`ltv` and `compare` need positional arguments
and are not yet manifest-callable; never `govern` / `schema` / `completion` / `doctor` /
`batch`). Validate the file with `schema batch-manifest`, pre-flight with `--dry-run`,
and remember: any network flag inside the manifest additionally requires
`--allow-network` on the command line. A manifest has the filesystem access of the user
who invokes `batch` — the same trust level as command-line flags; only network access is
additionally gated behind `--allow-network`. Manifests are size-capped (50 MB) and
bounded to 1 000 tasks, and path values undergo the same anti-traversal check as direct
CLI flags.

### The PAdES ladder (long-term signatures)

```bash
pdfnative sign --input doc.pdf --output bt.pdf \
  --profile pades --timestamp https://tsa.example/tsr   # B-T   (network: --timestamp)
pdfnative ltv add --input bt.pdf --output blt.pdf --online   # B-LT  (network: --online)
pdfnative doc-timestamp --input blt.pdf --output blta.pdf \
  --url https://tsa.example/tsr                              # B-LTA (network: --url)
pdfnative ltv add --input blta.pdf --output final.pdf --online
pdfnative verify --input final.pdf --strict                  # offline gate
```

Air-gapped variant: `ltv collect --online` on a connected machine emits a replayable
JSON (`schema ltv-data`); `ltv embed --data ltv.json` applies it fully offline.

---

## 8. Safety notes for unattended use

- **Offline by default.** The ONLY network opt-ins are `verify --revocation online`,
  `sign --timestamp <url>`, `ltv collect|add --online`, `doc-timestamp --url <url>`, and
  `batch --allow-network` (which gates network flags inside a manifest). Every request
  goes through an SSRF guard and never follows redirects; a failed opt-in fetch maps to
  the stable `E_NETWORK` code — never a silent fallback to an unprotected result.
  Nothing else touches the network — including `govern` — and `--dry-run` never does,
  even when a network flag is present.
- **No secrets in output.** `sign` never emits key material — errors are the fixed
  `E_SIGN` / "Failed to sign PDF." Pass keys via `PDFNATIVE_SIGN_KEY` /
  `PDFNATIVE_SIGN_CERT` (env wins over `--key` / `--cert`). Native `node:crypto` signing is
  the default; `--pure-crypto` selects the portable pure-JS path. Passwords come from env
  (a **non-empty** value wins over the flag) and are never logged.
- **One password per `merge`.** `merge` applies a single `--password` to *every* source, so
  merging encrypted sources with **different** passwords fails with `E_PASSWORD`. Decrypt the
  outliers first, then merge. (`split` / `extract` take a single input — no ambiguity.)
- **Bounded input.** JSON input is capped at 50 MB; paths are checked against
  traversal. `merge` / `split` / `extract` also honour `--max-output-size`, and the
  global `--max-inflate-size <bytes>` caps the decompressed size of any single PDF
  stream while parsing untrusted input (anti zip-bomb; default 100 MiB). Prefer
  `--output <file>` over shell redirection for large PDFs.
- **Incremental, signature-safe edits.** `annotate`, `metadata`, `ltv embed`/`add`, and
  `doc-timestamp` use incremental saves, so existing signatures on the input stay valid
  (`doc-timestamp` keeps earlier revisions byte-identical).
- **Human-in-the-loop for governance.** `govern` never submits anything; it only drafts and
  verifies. A human must review and submit under their own identity (see §6).
- **One process per task.** The CLI is stateless; run it per unit of work and let
  the exit code drive your orchestration.

See [SECURITY.md](SECURITY.md) for the full security model and
[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md) for the deep reference.
