# CLAUDE.md — working on pdfnative-cli with Claude Code

Guidance for Claude Code (and any Claude-family agent) contributing to this
repository. It complements — does not replace — the existing project docs:

- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** — the
  canonical architecture map, entry-point contract, arg-parser contract,
  security constraints, and code style. **Read it first.**
- **[AGENTS.md](AGENTS.md)** — the agent-automation contract (process contract,
  `--json` envelopes, token economy, `schema`, governance/HITL).
- **[ROADMAP.md](ROADMAP.md)**, **[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)**,
  **[CONTRIBUTING.md](CONTRIBUTING.md)**, **[SECURITY.md](SECURITY.md)**.

When those documents and this one disagree, they win on architecture/style and
this file wins on Claude-Code workflow specifics.

## Project philosophy (non-negotiable)

1. **Zero extra runtime dependencies.** `pdfnative` is the ONLY runtime
   dependency; all PDF logic lives there. The CLI is a thin, composable dispatch
   layer over it. Proposing a new npm runtime dep is a hard block (enforced by
   `pdfnative govern verify-issue`).
2. **All core imports go through [src/core-bridge/index.ts](src/core-bridge/index.ts).**
   Never import from `pdfnative` directly in a command or util — add a selective
   re-export to the bridge instead.
3. **Agent-first.** stdout = artifact, stderr = diagnostics/envelopes, stable
   exit codes (0/1/2) and stable `E_*` error codes. Keep the machine contract
   deterministic; agent mode is a thin presentation layer, never a second runtime.
4. **Offline by default.** Only `verify --revocation online` makes network
   requests, always through the SSRF guard.
5. **Native constant-time crypto** for signing by default (`node:crypto`);
   `--pure-crypto` opts into pdfnative's portable path. Never log key material or
   passwords.
6. **ESM-first TypeScript strict.** Relative imports carry the `.js` extension.
   No `console.log` (write to `process.stdout`/`process.stderr`), no `any`,
   prefer `const` and `readonly`.

## Repository shape

- `src/index.ts` — entry point: USAGE strings, `loadCommand()` dispatch, global
  flags, config merge, agent error envelope.
- `src/commands/*.ts` — one file per command, each exporting a single
  `async function <name>(args: ParsedArgs): Promise<void>`.
- `src/utils/*.ts` — arg parsing, io, error codes, agent envelopes, projection
  (token economy), page selectors, page-tree/crypto helpers (`pdfops.ts`), etc.
- `src/core-bridge/index.ts` — the single `pdfnative` import point.
- `tests/**` — vitest; `samples/**` — dual-shell (`.sh` + `.ps1`) runnable demos.

## Adding or changing a command (checklist)

A new command touches **all** of these — miss one and it half-works:

1. `src/commands/<name>.ts` — the implementation (reuse `utils/*`, `core-bridge`).
2. `src/index.ts` — (a) the top-level `USAGE` command list, (b) a `<NAME>_USAGE`
   constant + a `case` in the `--help` switch, (c) a `case` in `loadCommand()`.
3. `src/commands/completion.ts` — add the command + its flags to the `COMMANDS`
   table (all four shells + the capability manifest derive from it).
4. `src/commands/schema.ts` — add a subject if the command has a JSON input/output
   shape agents should validate.
5. New stable error code? Add it to `src/utils/error.ts` **and**
   `src/utils/agent.ts` (`DEFAULT_MESSAGE`), and document it.
6. `tests/**` — command test + integration where a round-trip is meaningful.
7. `samples/<name>/` — a `.sh` and a `.ps1` (keep them runnable).
8. Docs — README command reference, `docs/KNOWLEDGE_BASE.md`, `CHANGELOG.md`,
   `ROADMAP.md`, and `AGENTS.md`/`llms.txt` if the agent surface changed.

## Build, test, verify

```bash
npm run typecheck:all   # tsc for src + tests — must be clean
npm run lint            # eslint src/ — 0 errors
npm run test            # vitest run — all pass; keep coverage ≥ thresholds
npm run build           # tsup → dist/cli.cjs (the bin)
```

Coverage thresholds live in `vitest.config.ts` (statements/branches/functions/
lines). Do not lower them to make a change pass — add tests.

> **Bundle gotcha:** tsup flattens `src/**` into one `dist/cli.cjs`, so a path
> relative to a source file (`../../package.json`) resolves differently at
> runtime. Resolve the CLI version via `src/utils/version.ts` (which probes
> candidates and name-guards), never with an ad-hoc `require('../…/package.json')`.
> Always smoke-test the **built** CLI (`node dist/cli.cjs …`), not just source
> tests, before claiming a change works.

## Recommended Claude Code workflow

- Use **plan mode** for multi-file changes; confirm the command surface before
  editing eight files.
- Run **`/code-review`** on the branch diff before opening a PR, and **`/verify`**
  to drive an affected command end-to-end (render → new command → inspect).
- Prefer the dedicated tools (Read/Edit/Grep/Glob) over shell equivalents.

## Governance / HITL (hard rule)

Agents are **draftsmen, never autonomous submitters**. No autonomous GitHub
writes; every bug needs a local reproduction; a human review gate always
applies. `pdfnative govern verify-issue <draft>` must pass (no runtime deps, a
reproduction block) — necessary but not sufficient. See AGENTS.md and
[.github/AGENT_RULES.md](.github/AGENT_RULES.md).
