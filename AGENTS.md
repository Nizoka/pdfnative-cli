# AGENTS.md

Condensed, editor-agnostic guidance for AI coding agents working **on** pdfnative-cli (Cursor, Aider, Claude Code, Copilot, Continue, Zed, Cline, Windsurf, Goose, Gemini CLI, …).
Canonical detail: [.github/copilot-instructions.md](.github/copilot-instructions.md) + [.github/instructions/](.github/instructions/).
Claude Code loads [CLAUDE.md](CLAUDE.md), which imports this file. Keep the three consistent.
Agents that **drive** the CLI from a pipeline read [docs/AGENT_CONTRACT.md](docs/AGENT_CONTRACT.md) (envelopes, error codes, token economy) instead.

## Mission and constraints

pdfnative-cli is the official terminal wrapper of the pdfnative engine: 21 commands over the document lifecycle
(render, sign/verify/LTV, page tree, forms, metadata, encryption, inspection, batch) with an agent-first process contract.

- **Zero extra runtime dependencies.** `pdfnative` is the ONLY runtime dependency; all PDF logic lives there.
  Proposing another runtime package is a hard block (`pdfnative govern verify-issue` enforces it).
- **One import point.** Every `pdfnative` symbol enters through `src/core-bridge/index.ts`; commands and utils never import the package directly.
- **Agent-first.** stdout = artifact, stderr = diagnostics/envelopes, exit 0/1/2, 12 stable error codes.
  Agent mode (`--json`) is a presentation layer, never a second runtime; every new envelope field is additive and pinned by `schema status`.
- **Offline by default.** Network I/O only behind explicit opt-ins (`verify --revocation online`, `sign --timestamp`, `doc-timestamp --url`,
  `ltv --online`, `batch --allow-network`), always through the SSRF guard; `--dry-run` never touches the network.
- **Native constant-time crypto** (`node:crypto`) for signing by default; `--pure-crypto` opts into the portable path. Never log key material or passwords.
- **ESM-first TypeScript strict.** Relative imports carry `.js`; no `any`; no `console.log` in `src/`; `const` and `readonly` by default.
- **Reproducible output.** `--creation-date` / `SOURCE_DATE_EPOCH` pin every date; the sample corpus is byte-stable under `TZ=UTC`
  and held to `tests/regression/baselines/samples.sha256.json`.
- **Human-in-the-loop.** Agents draft and verify; the maintainer pushes, opens PRs/issues, tags and publishes (see Governance).
- **English everywhere.** Code, comments, tests, samples, docs and release notes are English; demonstrated content in another language
  is marked `demo-language: <tag> (reason)` on or above the line (`verify:docs` rule `prose-language`).

## The gate

`npm run gate` is THE quality gate (`scripts/gate.ts`; the step list is its `STEPS` table). Logs land in `test-output/.gate/<step>.log`; the summary is at most 20 lines.

| Profile | Command | Runs |
|---|---|---|
| Fast — before every commit | `npm run gate:fast` | typecheck:all, lint, test, verify:docs |
| CI — the default | `npm run gate` | typecheck:all, lint, build, dist-check, smoke, bundle-size, bundle-check, test:generate, test:coverage, verify:docs, verify:samples, corpus:pdfa, validate:pdfx — build and samples precede the tests |
| Publish — release branches | `npx tsx scripts/gate.ts --publish --require-all` | everything, incl. validate:pdfa (veraPDF; `--require-all` fails on a skip) |

PowerShell swallows a bare `--`, so pass flags by calling the script: `npx tsx scripts/gate.ts --fast`, `--only <step>`, `--json`.
One suite: `npx vitest run tests/<path>.test.ts` (dot reporter). Smoke-test the **built** CLI (`node dist/cli.cjs …`) before claiming a change works.

## Where is what

| Path | Purpose | Read first |
|---|---|---|
| `src/index.ts` | Entry: USAGE texts, global flags (before or after the command), config merge, `--creation-date` pin, `loadCommand()`, error envelope | `cli-design.instructions.md` |
| `src/commands/` | One file per command; `completion.ts` = COMMANDS/flags table (completions + capability manifest); `schema.ts` = 19 subjects | `commands.instructions.md` |
| `src/utils/` | args/argv, io, error codes, envelopes, projection, layout (PDF/X, typography), fonts, reproducible dates, build errors, PKI, fetch-guard | `commands.instructions.md` |
| `src/core-bridge/index.ts` | The single `pdfnative` import point (selective re-exports, `pdfnative/tools` included) | `copilot-instructions.md` |
| `scripts/` | gate, sample generator (`generators/`, `helpers/`, `lib/`), baseline, conformance corpus + validators, verify-docs, release-prepare | `testing.instructions.md` |
| `tests/` | vitest: `commands/`, `utils/`, `integration/`, `tools/`, `regression/` (sample baseline, engine-surface matrix), `fuzz/` (hostile input), `docs/`; `helpers/`, `fixtures/` | `testing.instructions.md` |
| `samples/` | Runnable dual-shell demos (`.sh` + `.ps1`, one pair per feature) and the JSON documents the generator renders | `samples/README.md` |
| `docs/` | `KNOWLEDGE_BASE.md` (deep reference), `AGENT_CONTRACT.md` (consumer contract), `assets/ecosystem.json` (every count and version) | — |

Instruction files live under `.github/instructions/`.

## Architecture

`argv → parseArgs (booleanFlags) → splitCommandArgv → config merge → setDefaultCreationDate → loadCommand() → command → stdout/stderr → exit code`.
Commands are thin: parse flags, validate paths and sizes, call the bridge, write the artifact, emit the status envelope.

Adding or changing a command touches ALL of these (`verify:docs` rules `command-parity`, `flag-parity`, `schema-parity`, `error-parity` fail on a missed step):

1. `src/commands/<name>.ts`, and `src/index.ts` (USAGE list, `<NAME>_USAGE`, the `--help` and `loadCommand()` switches).
2. `src/commands/completion.ts` (flags) and `src/commands/schema.ts` (subject, `status` fields); `utils/error.ts` + `utils/agent.ts` for a new code.
3. `tests/`, `samples/<name>/` (`.sh` + `.ps1`), and `scripts/lib/sample-plan.ts` or `scripts/generators/` when the output belongs in the baseline;
   an engine feature also gets its item in `tests/regression/engine-surface.json`.
4. README command reference, `docs/KNOWLEDGE_BASE.md`, `docs/AGENT_CONTRACT.md`, `llms.txt`, `docs/assets/ecosystem.json`.

## Consumer contract in brief

`--json` → `{ ok, command, … }` on stderr, artifact untouched on stdout; failures `{ ok: false, error: { code, message } }` with one of
`E_USAGE`, `E_INPUT`, `E_PARSE`, `E_IO`, `E_SIGN`, `E_VERIFY_FAILED`, `E_CHECK_FAILED`, `E_POLICY`, `E_UNSUPPORTED`, `E_PASSWORD`, `E_NETWORK`, `E_RUNTIME`.
`--dry-run` validates without writing; `--summary` / `--fields` shrink stdout JSON; `schema <subject>` and `schema manifest` describe every shape.

## Never touch

- `release-notes/v*.md` of already-shipped versions (read-only history).
- `dist/`, `coverage/`, `test-output/`, `samples/output/`, `node_modules/`, `package-lock.json` (npm owns it), and the table below: regenerate, never hand-edit.
- Any figure in `docs/assets/ecosystem.json` without running `npm run verify:docs` afterwards; the `pdfnative` pin without a release note.

## Generated files

| File | Regenerate with |
|---|---|
| `.claude/rules/*.md` | `npm run agents:rules` (from `.github/instructions/*.instructions.md`; drift fails `verify:docs`) |
| `tests/regression/baselines/samples.sha256.json` | `npm run build && npm run test:generate && npx tsx scripts/verify-samples.ts --update` — only with a rebaseline declared in the release note |
| `test-output/samples/`, `test-output/pdfa/` | `npm run test:generate`, `npm run corpus:pdfa` (git-ignored) |
| `dist/`, `coverage/` | `npm run build`, `npm run test:coverage` |

## Counts and versions

21 commands, 19 subjects, 12 stable error codes, 10 global flags, 27 Unicode scripts (31 font modules), 1390 tests, 91 sample PDFs in the baseline, 22 corpus files.
`docs/assets/ecosystem.json` is the source of every count and version quoted in the docs; run `npm run verify:docs` after touching any of them.
Coverage: ≥ 82 % statements enforced by CI (the thresholds live once in `vitest.config.ts`). Engine: pdfnative 1.8.0 (`^1.8.0`); Node ≥ 22.

## Releasing

Follow CONTRIBUTING.md §Release and `scripts/release-prepare.ts`; Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`, `chore:`), never with a `Co-Authored-By` trailer.
Every runtime change gets a ROADMAP.md entry, a CHANGELOG line and a line in the next `release-notes/vX.Y.Z.md`.
`/release-audit` (Claude Code skill) runs the pre-release audit; the maintainer merges, tags and publishes.

## Governance

Human-in-the-loop, enforced: agents never push, never open PRs/issues/releases, never publish, never tag, and never add `Co-Authored-By` trailers.
Protocol: [.github/AGENT_RULES.md](.github/AGENT_RULES.md); machine-readable policy: [.github/ai-governance.json](.github/ai-governance.json) (also `pdfnative govern policy`).
Issue drafts go to `.github/drafts/` and are validated with `pdfnative govern verify-issue` before a human submits them.

## Ecosystem

- [pdfnative](https://github.com/Nizoka/pdfnative) — the zero-dependency engine this CLI wraps; every PDF feature is upstream (`ROADMAP.md` lists what is upstream-blocked).
- [pdfnative-mcp](https://github.com/Nizoka/pdfnative-mcp) — Model Context Protocol server exposing the engine to conversational assistants.
- [pdfnative-react](https://github.com/Nizoka/pdfnative-react) — React renderer (JSX → pdfnative blocks).

See also: [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [llms.txt](llms.txt).
