# v1.1.0 — pdfnative 1.3.0 coverage + an agent-native CLI

> **Branch:** `release/v1.1.0` → `main`
> **Type:** Minor release (additive, 100% backward-compatible with v1.0.0)
> **pdfnative bump:** `^1.2.0` → `^1.3.0`

## Summary

Two themes, one release, zero breaking changes:

1. **Full pdfnative 1.3.0 coverage** — `render` reaches all **22 Unicode scripts**
   and **COLRv1 colour emoji**, adds **true constant-memory streaming**
   (`--stream-true`) and a **`--max-blocks`** cap; `inspect` gains a read-only
   **PDF/UA (ISO 14289-1) structural validator** (`--pdfua`, `--check pdfua`).
2. **Agent-native automation** — a thin presentation layer over the existing
   dispatch lets autonomous AI agents and CI drive the CLI deterministically:
   a global **`--json`** status/error envelope, stable **`E_*` error codes**, a
   **`--dry-run`** validation mode, and a new **`schema`** command. No MCP
   server, no daemon, no new runtime dependency — just the process contract.

Plus supply-chain transparency: a **CycloneDX SBOM** attached to every release
and an **OpenSSF Scorecard** badge.

## Changes

### `src/utils/error.ts`
- New `ErrorCode` const map + `ErrorCodeValue` type (`E_USAGE`, `E_INPUT`,
  `E_PARSE`, `E_IO`, `E_SIGN`, `E_VERIFY_FAILED`, `E_CHECK_FAILED`,
  `E_UNSUPPORTED`, `E_RUNTIME`).
- `CliError` gains a `code` field; constructor `(message, exitCode = 1, code?)`
  derives the code from the exit code when omitted (`2 → E_USAGE`, else
  `E_RUNTIME`), so every existing call site keeps a sensible code for free.

### `src/commands/render.ts`, `sign.ts`, `batch.ts`
- `--dry-run` (`hasFlag(...) || isDryRun()`): full validation, then short-circuit
  before producing/writing output. `sign` stops after credentials are parsed and
  the PDF is placeholder-prepared, before any signature value is computed.
- `emitStatus({...})` success envelopes on stderr in `--json` mode; INPUT/SIGN/
  IO/UNSUPPORTED error codes attached to the relevant `CliError`s.
- `batch`: global `--json` forces the JSON summary; `--dry-run` skips `mkdir`
  and forwards to each `render`.

### `src/commands/inspect.ts`, `verify.ts`
- `E_PARSE` on unreadable PDFs; `inspect --check` failures carry
  `E_CHECK_FAILED`, `verify --strict` failures carry `E_VERIFY_FAILED`. In
  `--json` mode the check detail rides in the error message instead of being
  pre-printed to stderr (avoids a double-print through the dispatcher).

### `src/commands/completion.ts`
- Added the `schema` command and the `--json` / `--dry-run` global flags to the
  bash/zsh/fish flag and command tables; corrected the `batch` flag list.

### `src/index.ts`
- Global-flag block sets `PDFNATIVE_JSON=1` / `PDFNATIVE_DRY_RUN=1`; tracks the
  active command; on a thrown error in `--json` mode, `emitJsonError()` writes
  the failure envelope to stderr and exits with the `CliError.exitCode`.
- Registers `schema` with usage text; help/usage list `schema`, `--json`,
  `--dry-run`, and point agents at `AGENTS.md`.

### New files
- `src/utils/agent.ts` — `isJsonMode`, `isDryRun`, `buildErrorEnvelope`,
  `emitJsonError`, `emitStatus` (no-op outside `--json`).
- `src/commands/schema.ts` — `pdfnative schema [render|inspect|verify|batch|list]`,
  hand-authored versioned JSON Schemas (Draft 2020-12); `$id` embeds the CLI
  version. Pure data, zero deps.
- `AGENTS.md` — agent-facing contract (channels, `--json`, error codes,
  `--dry-run`, `schema`, recommended loop, safety notes).
- `tests/utils/error.test.ts`, `tests/utils/agent.test.ts`,
  `tests/commands/schema.test.ts`; agent-mode cases appended to
  `tests/commands/{render,sign,inspect,verify,batch,completion}.test.ts`.
- `samples/agent/{01-json-and-dry-run,02-schema,03-error-envelope}.{sh,ps1}`,
  `samples/render/font/02-new-scripts.{json,sh,ps1}`,
  `samples/render/document/06-max-blocks.{json,sh,ps1}` (the `--max-blocks`
  large-report guard),
  `samples/inspect/05-pdfua.{sh,ps1}`.

### Docs & governance
- `README.md` — OpenSSF Scorecard badge, refreshed "What's new", `schema` in the
  command tables, an **"Driving from AI agents"** section, agent globals.
- `docs/KNOWLEDGE_BASE.md` — new **§5 Agent Automation Contract** (channels,
  envelope, error codes, `--dry-run`, `schema`) + an agent integration snippet.
- `CHANGELOG.md`, `release-notes/v1.1.0.md`, `ROADMAP.md` — agent-native +
  SBOM entries. `SECURITY.md` — supported versions to 1.1.x/1.0.x; note that the
  agent contract adds no network surface. `CITATION.cff` — version/abstract/
  keywords. `CONTRIBUTING.md` — error-code + schema-authoring conventions, SBOM.
- `.github/instructions/{cli-design,commands}.instructions.md` — agent contract
  deltas. `.github/workflows/publish.yml` — CycloneDX SBOM generation + upload +
  release attachment (`contents: write`).
- `package.json` — keywords (`ai-agent`, `agentic`, `automation`, `json-output`,
  `json-schema`, `sbom`, `supply-chain`).
- Docs polish — README names the SBOM artifact (`sbom.cdx.json`) and links the
  releases page, completes the agent error-code list (`E_IO`), and notes the
  PDF/UA validator is a developer-time gate (not a veraPDF substitute);
  `samples/README.md` version tags aligned to the CLI release line.

## Validation

- `npm run typecheck:all` → clean (src + tests).
- `npm run lint` → clean.
- `npm run test:coverage` → **276 / 276 passing** (was 226 in v1.0.0); thresholds
  met — statements **81.78 %**, branches **72.01 %**, functions **85.9 %**,
  lines **83.59 %**.
- `npm run build` → CJS **142.07 KB**, ESM **141.16 KB**, types emitted.
- Smoke:
  - `node dist/cli.cjs --help` → ok; `schema list` → `{ subjects: [...] }`.
  - `render … --dry-run --json` → `{ ok: true, dryRun: true, … }` on stderr, **no
    file written**.
  - bad input piped to `inspect --json` →
    `{ ok: false, command: "inspect", error: { code: "E_PARSE", … } }`, exit 1.

## Backward compatibility

- **No flag removed or renamed; no exit-code semantics changed** (0/1/2).
- `--json` only adds a stderr envelope; stdout artifacts are byte-unchanged.
- `CliError.code` is additive; existing call sites get a derived code for free.
- Every v1.0.0 invocation continues to work unchanged.

## Out of scope (unchanged)

- **MCP / daemon / HTTP / socket interfaces** — the official pdfnative MCP server
  is a separate integration; this release keeps the CLI a stateless process.
- **Sign-side LTV** (PAdES-T/LT/LTA) — upstream-blocked in pdfnative;
  `sign --timestamp` stays reserved and errors with `E_UNSUPPORTED` (exit 2).
- No new runtime dependency (SBOM generator is CI-only).

## Self-review checklist

- [x] No `console.log`; all output via `process.stdout.write` /
      `process.stderr.write`.
- [x] stdout = artifact, stderr = diagnostics; `--json` never touches stdout.
- [x] No key material in output — `sign` failure stays the fixed
      `Failed to sign PDF.` (`E_SIGN`); `--dry-run` `sign` never logs PEM bytes.
- [x] Numeric exit codes (0/1/2) unchanged; `E_*` codes are additive.
- [x] `--dry-run` writes no output for `render` / `sign` / `batch` (verified).
- [x] Path-traversal validation + 50 MB JSON / 50 MiB ASN.1 caps preserved.
- [x] TypeScript strict; no `any`; new types `readonly` where applicable;
      ESM-first `.js` imports.
- [x] `pdfnative` is still the **only** runtime dependency.
- [x] Coverage thresholds green; 276/276 tests pass.
