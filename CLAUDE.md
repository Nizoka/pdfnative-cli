@AGENTS.md

# Claude Code addendum

Everything in AGENTS.md applies. This file adds only what is specific to Claude Code sessions in this repository.

## Token discipline

- Run tests through `npx tsx scripts/gate.ts --fast` or `npx vitest run <file>` (the dot reporter is configured); never paste a full test run into context.
- Never Read `dist/`, `coverage/`, `test-output/`, `samples/output/`, `package-lock.json`, `node_modules/`.
  The deny list in `.claude/settings.json` applies to Read and, at best effort, to Grep/Glob — prefer `node dist/cli.cjs <command> --help` and `schema manifest` over reading the bundle.
- Find a command's flags in `src/commands/completion.ts` (COMMANDS) and its usage text in `src/index.ts` (`<NAME>_USAGE`); find an engine symbol's re-export with Grep in `src/core-bridge/index.ts`.
- Read README.md, ROADMAP.md and docs/KNOWLEDGE_BASE.md by section: `grep -n "^## "` first, then a line range. CHANGELOG.md: only the top entry.
- `.github/instructions/*.md` are the per-area rules: open the ONE matching the area you touch (table in AGENTS.md §Where is what), not all of them.
- In plan mode, summarise gate output; do not paste logs.
- Sample regeneration: `npm run build && npm run test:generate` then `npx tsx scripts/verify-samples.ts`. Any `--update` (rebaseline) must be justified in the release note.
- Never push, never open PRs/issues/releases, never tag (HITL policy, hook-enforced). No `Co-Authored-By` trailers (`attribution.commit` is `""`).

## Gate

- `npx tsx scripts/gate.ts --fast` — typecheck:all, lint, test, verify:docs. Run before proposing a commit.
- `npm run gate` — the CI profile (default).
- `npx tsx scripts/gate.ts --publish --require-all` — everything, incl. test:generate, verify:samples, corpus:pdfa, validate:pdfx, validate:pdfa. Release branches only.
- `--only <step>` for one step, `--json` for machine output; logs in `test-output/.gate/<step>.log` — open only the failing step's log.
- When the gate exceeds the Bash timeout, run it in the background; read the result with `--json` and open only the failing step's log.

## Where to look first

1. `src/commands/completion.ts` — every command and flag (the capability manifest derives from it); `src/commands/schema.ts` — every pinned shape.
2. AGENTS.md §Where is what — the path → purpose → instruction-file table.
3. `docs/assets/ecosystem.json` — every count and version; `npm run verify:docs` enforces it.

## Bundle gotcha

tsup flattens `src/**` into one `dist/cli.cjs`, so a path relative to a source file resolves differently at runtime.
Resolve the CLI version via `src/utils/version.ts`, never with an ad-hoc `require('../…/package.json')`.
Always smoke-test the **built** CLI (`node dist/cli.cjs …`), not just source tests, before claiming a change works.

## Windows session notes

- Git Bash is `C:\Program Files\Git\bin\bash.exe` (the `bash` on PATH is the WSL stub); `.sh` samples run there, `.ps1` samples under pwsh.
- vitest needs the drive letter upper-case (`D:\…`); PowerShell swallows `--` after `npm run` — call the scripts directly with `npx tsx scripts/<name>.ts`.
- veraPDF: portable install in `%USERPROFILE%\verapdf` with JDK 13; the runner reads `JAVACMD` (set it to the JDK's `java.exe` — `JAVA_HOME` alone is not enough when spawned from Node).
- `npm install` under npm 10.9 can fail with an arborist `edgesOut` error on a fresh resolution; `npx npm@11.19.1 install` works, `npm ci` is unaffected.

## Hooks and permissions in force

- `.claude/hooks/guard.mjs` (PreToolUse on Bash) denies `npm publish`/`unpublish`/`deprecate`/`dist-tag`/`version <bump>`, `gh pr|issue create|edit|close|comment` (+ `pr merge`),
  `gh release`, writing `gh api`, any `git push`, `git tag <name>` and `git add --renormalize` — in the whole command, every `&&`/`;`/`|` segment, `$( )`/backticks and
  `sh -c`/`pwsh -Command`/`node -e`/`npx -c` payloads (a quoted string holding one is refused too — write such strings with Edit, never via echo/heredoc).
  Those are submitted by the maintainer (.github/AGENT_RULES.md §5) — prepare, then stop. `tests/tools/guard.test.ts` is the rule table's contract.
- `permissions.deny` in `.claude/settings.json` blocks Read on the generated bulk files listed above and the same GitHub write commands.
  `permissions.allow` pre-approves `npm run`, `npx vitest`, `npx tsx scripts/*`, `npx tsc`, `npx eslint`, `node -e` and read-only git. `node dist/cli.cjs …` is asked each time: some commands can reach the network.

## Plan mode

Use plan mode for multi-file changes; plans name the files, the commands and the expected gate outcome; keep gate output to its ≤ 20-line summary. Run `/code-review` on the branch diff before proposing a PR body.

## Rules and skills

- `.claude/rules/*.md` are generated from `.github/instructions/*.instructions.md` by `npm run agents:rules` (scoped by `paths:` = the source `applyTo`).
  Never edit a rule: edit the instruction file, then regenerate (`verify:docs` rule `claude-rules-sync` fails on drift).
- `/release-audit [release-notes/vX.Y.Z.md] [previous-tag]` (`.claude/skills/release-audit/`) is the maintainer-invoked pre-release audit:
  two auditors, an adversarial verifier, an agent-autonomy pass and a GO/NO-GO ledger under `.audit/`.

## Release

Follow CONTRIBUTING.md §Release and `scripts/release-prepare.ts`: prepare everything (version, changelog, release note, manifest,
PR draft under `release-notes/draft/`, `npx tsx scripts/gate.ts --publish --require-all`) and stop before pushing.
