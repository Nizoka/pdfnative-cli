# Contributing to pdfnative-cli

Thank you for considering contributing to pdfnative-cli!

## Development Setup

```bash
git clone https://github.com/Nizoka/pdfnative-cli.git
cd pdfnative-cli
npm ci --ignore-scripts      # what CI runs; `.npmrc` sets ignore-scripts=true anyway
npm run build                # the gate's smoke step and the sample generator drive dist/cli.cjs
```

### Requirements

- Node.js 22 (`.nvmrc` / `.node-version`; CI also runs 24) — `engines.node` is `>=22`
- npm ≥ 10 (`packageManager` pins the version npm itself reads; publishing uses npm ≥ 11.5.1)
- Optional: [veraPDF](https://verapdf.org) 1.30.2 + Java for the PDF/A step (see below)

### First pull request in ten minutes

```bash
npm ci --ignore-scripts        # reproducible install from the lockfile
npm run hooks:install          # optional: pre-commit CRLF check, pre-push fast gate (core.hooksPath → .githooks)
npm run gate:fast              # typecheck, lint, tests, docs checks — the loop while you work
git switch -c fix/<what>       # feat/, fix/, docs/, chore/
```

Edit, add a test beside the code you touched (`tests/` mirrors `src/`; a new flag also goes in
`src/commands/completion.ts` and its usage text — `verify:docs` tells you what you missed), run
the fast gate, commit with a [Conventional Commits](#commit-convention) message, push your
branch and open the pull request — its template is the [checklist below](#pull-request-checklist).
Run `npm run gate` (the CI profile: it builds `dist/cli.cjs`, generates the sample corpus and
holds it to the byte baseline) before you ask for review; `npm run hooks:uninstall` removes
the hooks.

Sign your commits if you can: with an SSH key already registered on GitHub,
`git config gpg.format ssh`, `git config user.signingkey ~/.ssh/id_ed25519.pub`,
`git config commit.gpgsign true` and `git config tag.gpgSign true` make every commit and tag
verifiable; the rulesets do not require signatures yet, so an unsigned contribution is still
welcome.

Every file the project writes uses LF line endings (`.gitattributes` says
`* text=auto eol=lf`); on Windows, Git converts on checkout and the pre-commit hook refuses a
staged CRLF file. Do not run `git add --renormalize` in a feature branch — the maintainer does
that in one dedicated commit.

Windows notes: run the `.sh` samples and shell one-liners under Git Bash
(`C:\Program Files\Git\bin\bash.exe`); PowerShell swallows a bare `--` after `npm run`, so
pass script flags by calling the script directly (`npx tsx scripts/gate.ts --fast`).

## The gate

`npm run gate` is THE quality gate — one command, one summary of at most 20 lines, logs under
`test-output/.gate/<step>.log`. The step table is `STEPS` in `scripts/gate.ts`:

| Profile | Command | Steps |
|---|---|---|
| Fast — before every commit | `npm run gate:fast` | `typecheck:all`, `lint`, `test`, `verify:docs` |
| CI — the default | `npm run gate` | `typecheck:all`, `lint`, `build`, `dist-check`, `smoke`, `bundle-size`, `bundle-check`, `test:generate`, `test:coverage`, `verify:docs`, `verify:samples`, `corpus:pdfa`, `validate:pdfx` — the build and the samples come before the coverage run so the `runIf` suites execute (and fail, not skip, when their input is missing) |
| Publish — release branches | `npx tsx scripts/gate.ts --publish --require-all` | + `validate:pdfa` (veraPDF); `--require-all` turns any skipped step into a failure |

`--only <step>` runs one step, `--json` emits a machine-readable result. The individual
scripts still exist:

```bash
npm run typecheck:all      # tsc over src/, tests/ and scripts/ (three configs)
npm run lint               # eslint src/ scripts/
npm run test               # vitest run (dot reporter)
npm run test:coverage      # vitest with v8 coverage — thresholds in vitest.config.ts
npm run build              # tsup → dist/cli.cjs + dist/cli.js + dist/cli.d.ts
npm run verify:docs        # every count, version, link and parity rule (docs/assets/ecosystem.json)
npm run test:generate      # write the sample corpus to test-output/samples/ with the BUILT CLI
npm run verify:samples     # compare it with tests/regression/baselines/samples.sha256.json
npm run corpus:pdfa        # write the conformance corpus to test-output/pdfa/
npm run validate:pdfx      # validate the PDF/X-4 entries in-process (pdfnative's validator)
npm run validate:pdfa      # validate the PDF/A entries with veraPDF (SKIP when absent)
```

All new code must include tests. Coverage thresholds are enforced once, in `vitest.config.ts`
(statements / branches / functions / lines), mirrored by `declared.coverageStatements` in
`docs/assets/ecosystem.json`, re-measured at each release and **never lowered** to make a
change pass — add tests.

## Samples and the byte baseline

Every JSON under `samples/render/`, the multilang driver scripts and the outputs derived
through `merge` / `split` / `extract`, `annotate`, `fill`, `metadata`, `encrypt` / `decrypt` and
`sign` are rendered by `scripts/generate-samples.ts` into the git-ignored
`test-output/samples/` — always with the **built** binary, under `TZ=UTC`, with the creation
instant pinned twice (`--creation-date 2026-01-01T00:00:00Z` and `SOURCE_DATE_EPOCH`). The plan
(per-category flags, per-file flags, skipped files, deterministic passwords) is
`scripts/lib/sample-plan.ts`; `--category <name>` restricts a run; `PDFNATIVE_CLI` points the
generator at another binary.

`scripts/verify-samples.ts` fingerprints the corpus and compares it with the committed
baseline `tests/regression/baselines/samples.sha256.json`: plain output byte for byte,
encrypted and signed output through a canonical projection (`ENCRYPTED_SAMPLES` /
`SIGNED_SAMPLES` in `scripts/lib/sample-fingerprint.ts` — CSPRNG keys and a per-revision
`/ID` can never repeat). Each entry records the release whose output it is (`since`).

- A new sample: add the JSON (and a `.sh` + `.ps1` pair under `samples/<command>/` or the
  category — `verify:docs` rule `sample-shell-parity` insists on both shells), a plan entry
  when it needs flags, then `npm run build && npm run test:generate && npx tsx
  scripts/verify-samples.ts --update`.
- **An intended output change** (an engine bump, a rendering fix) is rebaselined the same way
  and **declared in the release note** (Upgrade section) — the `since` of every re-anchored
  entry moves to the release doing it, so the diff shows exactly what changed.
- Two samples meant to differ must not be byte-identical; a deliberately identical pair goes
  in `IDENTICAL_SAMPLE_GROUPS`.
- The `sample-regression` workflow rebuilds and regenerates the corpus on every PR that
  touches `src/`, `samples/`, `scripts/`, the baseline or the fixtures, and is a required
  status check.

## PDF/A validation (veraPDF)

The CLI's PDF/A claims are checked against the official reference validator,
[veraPDF](https://verapdf.org). `npm run corpus:pdfa` drives the **built** CLI
(`scripts/generate-pdfa-corpus.ts`, corpus table in `scripts/lib/pdfa-corpus.ts`) to write
16 files to `test-output/pdfa/` — 13 claiming PDF/A (renders at all four levels 1b / 2b /
2u / 3b, a PDF/A-3b XML attachment, header/footer templates, `--outline auto`, an opaque
watermark, a `--variant table` render with embedded fonts, an incremental PAdES signature
over a claiming file and an incremental `metadata` update) and 3 claiming PDF/X-4 (a print
render, a signed print render and a negative canary broken by `annotate`). The corpus is
reproducible: pinned dates, the committed test key pair, a per-file SHA-256 in `manifest.json`.

`npm run validate:pdfa` (`scripts/validate-pdfa.ts`, pure core in `scripts/lib/verapdf.ts`)
validates each PDF/A file against the profile it claims in XMP and compares the verdict with
the manifest's `expectCompliant` flag. The positive entries render with `--strict --font latin
--lang latin` (ISO 19005 requires embedded fonts; the sRGB OutputIntent is emitted by the
engine). Two **negative canaries** (`expectCompliant: false`) must be rejected — a render
without fonts (ISO 19005-2 §6.2.11.4.1) and a `--variant table` render under PDF/A-1b
without `--font` / `--lang` (ISO 19005-1 §6.3.4) — otherwise the validator is accepting
everything and the run fails. An unexpected pass (`XPASS`) is always fatal, and a coverage canary fails the run
when the number of claiming files differs from `declared.pdfaSamples`.

`npm run validate:pdfx` (`scripts/validate-pdfx.ts`, core in `scripts/lib/pdfx.ts`) does the
same for the PDF/X-4 entries with pdfnative's structural validator (`validatePdfX`, through
the core bridge) — no external tool, never skipped; its coverage canary is
`declared.pdfxSamples`.

Per file the validators report `PASS` / `FAIL` / `XFAIL` / `XPASS` / `INFRA` / `SKIP`. Exit codes:

| Exit | Meaning |
|------|---------|
| 0 | Every expectation met — **or** (PDF/A only) veraPDF is absent: install hints are printed and validation is **SKIPPED** (exit 0 is a skip, not a pass; the gate's `--require-all` fails it) |
| 1 | Conformance expectation not met (`FAIL` or `XPASS`), no negative canary in the corpus, or the coverage canary tripped |
| 2 | Infrastructure: corpus directory / manifest absent (run `corpus:pdfa` first), or veraPDF / Java installed but unusable |

Environment: `VERAPDF_HOME=<dir>` points at a veraPDF install (`verapdf` / `verapdf.bat` at
the root or under `bin/`); `VERAPDF_REPORT_DIR=<dir>` relocates the raw per-file veraPDF XML
reports (default `test-output/pdfa/reports/`).

**CI is blocking**: `verapdf.yml` runs `build && corpus:pdfa && validate:pdfa` through the
composite action `.github/actions/setup-verapdf` (installer pinned to **1.30.2**, SHA-256 in
`.github/checksums/` verified before `java -jar` executes it) on every push / PR touching
`src/`, `samples/`, `scripts/` or the package manifest, and the publish gate runs the whole
`--publish --require-all` profile again before `npm publish`. veraPDF is an external CI tool,
not a dependency — the zero-extra-runtime-dependency policy is unchanged. (The `verapdf`
workflow is path-filtered, so it is deliberately **not** a required status check.)

Installing veraPDF locally (Java 8+ required):

```bash
# macOS
brew install --cask verapdf

# Linux (headless, no GUI — same mechanism as CI; adjust the install path)
curl -fsSL -o installer.zip https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.2-installer.zip
unzip installer.zip && cd verapdf-greenfield-*
cat > auto-install.xml <<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>/opt/verapdf</installpath></com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select"><pack index="0" name="veraPDF GUI" selected="true"/><pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/><pack index="2" name="veraPDF Documentation" selected="false"/><pack index="3" name="veraPDF Sample Plugins" selected="false"/></com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
XML
java -jar verapdf-izpack-installer-*.jar auto-install.xml
export VERAPDF_HOME=/opt/verapdf
```

```powershell
# Windows — download the same installer zip, unzip, and run the installer with a
# Windows <installpath> (a portable install under %USERPROFILE%\verapdf works). Point
# VERAPDF_HOME at the directory holding verapdf.bat, and JAVACMD at the JDK's java.exe:
# the .bat launcher reads JAVACMD (JAVA_HOME alone is not enough when it is spawned from Node).
$env:VERAPDF_HOME = "$env:USERPROFILE\verapdf"
$env:JAVACMD = "C:\Program Files\Java\jdk-13.0.1\bin\java.exe"
```

The `.bat` launcher is invoked through a shell with quoted arguments (Node refuses to spawn
batch files directly), so paths with spaces work.

## Documentation and the ecosystem manifest

`docs/assets/ecosystem.json` is the single source of every count and version quoted in the
docs (`packages`, `declared`, `derived`, `assertions`). `npm run verify:docs`
(`scripts/verify-docs.ts`) recomputes the derived counts from the source constants
(`COMMANDS`, `SUBJECTS`, `ErrorCode`, `GLOBAL_FLAGS`, `MANIFEST_COMMANDS`, the corpus and
font tables, the samples tree, the baseline) and holds README, `docs/`, `llms.txt`, AGENTS.md,
CLAUDE.md, the Copilot files, `samples/README.md` and the current release note to it: stale
counts, stale versions, command / flag / schema / error-code parity between `src/index.ts`,
`src/commands/completion.ts`, `src/commands/schema.ts` and the docs, the governance embed,
dual-shell samples, Claude Code budgets and generated rules, the PR template, EOL, links,
`Verified on` stamps and English-only prose. A line that legitimately quotes a superseded
figure (release history) opts out with `verify-docs:allow <rule>` on itself or the line above.

Touching a count or a version means editing the manifest **and** running `verify:docs`;
`.claude/rules/*.md` are generated from `.github/instructions/*.instructions.md`
(`npm run agents:rules`) and never edited by hand.

## Lint & Type Check

```bash
npm run lint              # eslint src/ scripts/
npm run typecheck         # tsc --noEmit (src/)
npm run typecheck:tests   # tsc --project tsconfig.test.json
npm run typecheck:scripts # tsc --project tsconfig.scripts.json
npm run typecheck:all     # all three
```

All must pass before opening a PR (the fast gate runs them).

## Code Style

- **TypeScript strict mode** — `strict: true`
- **ESM-first** — all internal imports use `.js` extension
- **`const` over `let`** — never use `var`
- **No `any`** — use `unknown` with type narrowing
- **No `console.log`** in `src/` — use `process.stdout.write(msg + '\n')` / `process.stderr.write(msg + '\n')`
- **`readonly`** on interface props where mutation is unnecessary
- **English everywhere** — demonstrated content in another language carries a
  `demo-language: <tag> (reason)` marker on or above the line
- Every `pdfnative` symbol enters through `src/core-bridge/index.ts`

## Agent contract

The CLI is agent-native (consumer contract: [docs/AGENT_CONTRACT.md](docs/AGENT_CONTRACT.md);
repository rules: [AGENTS.md](AGENTS.md)). When you add or change a command:

- Throw `CliError(message, exitCode, ErrorCode.X)` with a stable code from `utils/error.ts`.
  Numeric exit codes (0/1/2) must not change; a new code goes in `utils/error.ts`,
  `utils/agent.ts` and every document `verify:docs` rule `error-parity` lists.
- Keep **stdout** for the artifact and **stderr** for diagnostics. For success status on the
  write commands, call `emitStatus({...})` (no-op outside `--json`); every new envelope field is
  additive and pinned in `commands/schema.ts` (`status`).
- Honour `--dry-run` via `hasFlag(args.flags, 'dry-run') || isDryRun()`; never touch the network there.
- Add every flag to the command's `<NAME>_USAGE` text **and** to `commands/completion.ts`
  (`verify:docs` rule `flag-parity`); a new command also needs both `src/index.ts` switches, a
  `samples/<command>/` pair, the README reference section and the knowledge base.
- If a command gains a new input/output shape, update the matching schema in
  `commands/schema.ts` (hand-authored Draft 2020-12; the `$id` tracks the package version
  automatically) and add a `schema.test.ts` assertion.

## Project Structure

```
src/
├── index.ts               # CLI entry: parse argv (global flags before or after the command) → config → --creation-date → dispatch
├── commands/              # one file per command (21); completion.ts = COMMANDS/GLOBAL_FLAGS tables; schema.ts = 19 subjects
├── utils/                 # args/argv, io, error codes, envelopes, projection, config, layout, fonts, reproducible dates,
│                          #   build-error classifier, page/pdf helpers, keys/CMS/timestamp/revocation, fetch-guard, governance
└── core-bridge/index.ts   # the single pdfnative import point
scripts/                   # gate.ts, generate-samples.ts (+ generators/, helpers/, lib/), verify-samples.ts,
                           #   generate-pdfa-corpus.ts, validate-pdfa.ts, validate-pdfx.ts, verify-docs.ts,
                           #   release-prepare.ts, build-claude-rules.ts, install-git-hooks.mjs
tests/                     # commands/ utils/ integration/ tools/ regression/ docs/ — helpers/cli-harness.ts, fixtures/
samples/                   # dual-shell demos (.sh + .ps1) and the JSON documents the generator renders
docs/                      # KNOWLEDGE_BASE.md, AGENT_CONTRACT.md, assets/ecosystem.json
.claude/                   # settings.json, hooks/guard.mjs, rules/ (generated), skills/release-audit/
.github/                   # workflows/, actions/setup-verapdf, rulesets/, instructions/, prompts/, ai-governance.json
```

## Security

- **Never log key material** from the `sign` command — not in error messages, not debug output.
- Validate file paths against path traversal before filesystem access; cap every read
  (50 MB JSON and `--layout`, 16 MiB ICC, 32 MiB font) and check magic bytes before handing
  bytes to the engine.
- Network I/O only behind the documented opt-in flags, always through `utils/fetch-guard.ts`.
- A CycloneDX **SBOM** (`npm sbom`) and build attestations are produced by `publish.yml`;
  nothing of that is a runtime dependency.
- Agents never push, tag, open PRs or publish (`.github/AGENT_RULES.md`; enforced in Claude
  Code by `.claude/hooks/guard.mjs`).

## Pull Request Checklist

The items below are mirrored word for word in `.github/pull_request_template.md`
(`verify:docs` rule `pr-template-parity` and `tests/tools/workflows.test.ts`
both check the two stay in step):

- [ ] `npm run gate` passes — the CI profile in one command (`npm run gate:fast` for a quick loop while iterating; PowerShell swallows a bare `--`, so call `npx tsx scripts/gate.ts --fast` there)
- [ ] All tests pass (`npm run test`)
- [ ] Type check passes (`npm run typecheck:all`)
- [ ] Lint passes (`npm run lint`)
- [ ] New code has tests (coverage thresholds in `vitest.config.ts` must not regress)
- [ ] No `any` types introduced
- [ ] No new runtime dependencies added (`pdfnative` stays the only one)
- [ ] A new or changed command touches every wiring point: `src/index.ts` usage + dispatch, `src/commands/completion.ts`, `src/commands/schema.ts`, `samples/<command>/`, README, `docs/KNOWLEDGE_BASE.md`
- [ ] If samples, PDF/A or PDF/X behaviour changed: `npm run build && npm run test:generate && npm run verify:samples && npm run corpus:pdfa && npm run validate:pdfx && npm run validate:pdfa` passes locally (veraPDF installed — see [PDF/A validation](#pdfa-validation-verapdf); new claiming corpus entries bump `declared.pdfaSamples` / `declared.pdfxSamples`; an intended output change is rebaselined with `npx tsx scripts/verify-samples.ts --update` and declared in the release note)
- [ ] If docs, README, llms.txt, AGENTS.md, CLAUDE.md or `.claude/` changed: `npm run verify:docs` passes
- [ ] CHANGELOG.md updated if user-facing changes
- [ ] For releases: follow [Release](#release) — `release-notes/vX.Y.Z.md` and `release-notes/draft/PR-vX.Y.Z.md` written, and `npx tsx scripts/gate.ts --publish --require-all` passes locally, which runs every individual gate: `typecheck:all`, `lint`, `test:coverage`, `build`, `dist-check`, `smoke`, `bundle-size`, `verify:docs`, `test:generate`, `verify:samples`, `corpus:pdfa`, `validate:pdfx`, `validate:pdfa`

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (deps, CI, governance)
- `docs:` documentation only
- `test:` tests only
- `refactor:` no behaviour change

Commits carry no `Co-Authored-By` or "generated with" trailer. Opt-in git hooks
(`npm run hooks:install`) run the fast gate before a commit and refuse a push of a red tree;
`npm run hooks:uninstall` removes them.

## Release

A release is prepared on a `release/vX.Y.Z` branch by whoever drives it (a maintainer or an
agent) and **merged, tagged and published by the maintainer only**:

1. `npx tsx scripts/release-prepare.ts --version X.Y.Z [--date YYYY-MM-DD] [--previous vA.B.C]`
   bumps `package.json` / `package-lock.json`, `docs/assets/ecosystem.json` (version +
   `verifiedOn`) and the `Verified on` stamps, `CITATION.cff`, the `SECURITY.md` support
   table, the README banner tokens, the knowledge-base footer, `llms.txt`, and scaffolds
   `release-notes/vX.Y.Z.md` from `release-notes/TEMPLATE.md` (`--dry-run` previews).
2. Write the release note, the `CHANGELOG.md` entry (`## [X.Y.Z] – YYYY-MM-DD` plus the compare
   link at the bottom), the ROADMAP block, and refresh every count the manifest governs
   (`declared.tests` is the figure the last gate run recorded).
3. Every rebaseline of `tests/regression/baselines/samples.sha256.json` and every new corpus
   entry is declared in the note's Upgrade section.
4. `npx tsx scripts/gate.ts --publish --require-all` must pass locally with veraPDF installed;
   in Claude Code, `/release-audit release-notes/vX.Y.Z.md vA.B.C` runs the independent audit
   and writes its ledger under `test-output/.audit/`.
5. Draft the PR body: copy [release-notes/PR_TEMPLATE.md](release-notes/PR_TEMPLATE.md) to
   `release-notes/draft/PR-vX.Y.Z.md` and fill every section (summary, changes by area, the
   audit ledger, what actually ran, backward compatibility, out of scope, self-review). The
   per-version bodies are committed — they are the auditable record of what each release
   claimed and what was run — and every figure in them comes from a command, never from memory.
6. **Maintainer:** push the branch, open the PR with that body, wait for `ci (22)`, `ci (24)`
   and `sample-regression` (required by `.github/rulesets/main.json`), squash-merge as
   `release: vX.Y.Z — …`, tag `vX.Y.Z` on the merge commit, publish the GitHub Release with
   the note as body, approve the `npm-publish` environment; `publish.yml` re-runs the publish
   gate, publishes with provenance through Trusted Publishing, and attaches the SBOM and the
   attestations to the release. Afterwards `npm view pdfnative-cli version` confirms the
   publish and the weekly `docs.yml --online` run confirms the manifest against npm.

### Branch protection

The rules for `main` are versioned in [.github/rulesets/main.json](.github/rulesets/main.json),
GitHub's ruleset format: no deletion, no force-push, pull request required (single maintainer,
so zero approvals — but every review thread resolved, stale reviews dismissed on push, squash
merges only), and the status checks `ci (22)`, `ci (24)` and `sample-regression` required and
up to date with `main`. `verapdf`, the Docs workflow and the other path-filtered workflows are
deliberately **not** required: a required check that never reports leaves a pull request stuck
on "Expected — waiting for status to be reported". For the same reason the repository Admin
role may bypass the ruleset through a pull request only — `ci.yml` ignores documentation-only
changes, so such a pull request has no `ci` run to wait for — never by pushing to `main`
directly. Release tags are protected by [.github/rulesets/tags.json](.github/rulesets/tags.json)
(`refs/tags/v*`: no deletion, no force-update, no update; creation stays with the maintainer).
`verify:docs` (rule `ruleset-parity`) fails when a required check names no workflow job.

Import a file after editing it: Settings → Rules → Rulesets → New ruleset → Import a ruleset,
or from the shell (maintainer only — agents never run a writing `gh api` call, and the Claude
Code guard hook refuses it):

```bash
gh api repos/Nizoka/pdfnative-cli/rulesets --method POST --input .github/rulesets/main.json
gh api repos/Nizoka/pdfnative-cli/rulesets --method POST --input .github/rulesets/tags.json
```

To update a ruleset already in place, `gh api repos/Nizoka/pdfnative-cli/rulesets` lists the
ids and `--method PUT` on `rulesets/<id>` replaces it.
