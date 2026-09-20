# vX.Y.Z — <headline>

> **Branch:** `release/vX.Y.Z` → `main`
> **Type:** <Major | Minor | Patch> release (<additive, fully backward-compatible with vA.B.C | breaking: …>)
> **pdfnative bump:** `^A.B.C` → `^D.E.F` (or "unchanged")

<!--
The pull-request body of a release. CONTRIBUTING §Release step 5 copies this file to
release-notes/draft/PR-vX.Y.Z.md and fills every section; the maintainer pastes the
result into the GitHub pull request verbatim. Keep the section order — the release
audit (`/release-audit`) reads "Independent audit" and "Validation" by name.

Every figure quoted here comes from a command you ran on the release branch: flag
counts from `src/commands/completion.ts` (`npx tsx -e "import {COMMANDS} from
'./src/commands/completion.ts'; …"`), test and file counts from the gate summary,
coverage from `npm run test:coverage`, rule counts from `npx tsx scripts/verify-docs.ts`.
A number typed from memory is how the 1.5.0 body shipped "render flags 44 → 54" when
the table said 57 (audit B-17).
-->

## Summary

<Two or three paragraphs: what the release does for a user, what it does for an agent,
what the repository adopted. Name the engine version and every roadmap item delivered.>

Counts: <N> commands, <N> schema subjects, <N> stable error codes and <N> manifest commands
<unchanged | X → Y>; global flags <X → Y>; `render` flags <X → Y>; `inspect` <X → Y>;
`sign` <X → Y>; `--font` <X → Y> scripts; `--strict` diagnostics <X → Y>; `doctor` checks
<X → Y>; conformance corpus <X → Y> files; workflows <X → Y>; tests <X → Y> across <N> files.

## Changes

### Engine surface (`src/core-bridge/index.ts`, `src/commands/render.ts`, `src/utils/`)
- <Bridge block `(pdfnative D.E.F)`: the symbols re-exported and why.>
- <Every `src/utils/` module added or rewritten, one bullet each.>

### Commands
- <One bullet per command touched: the flags, envelope fields and error codes it gained.>

### Tooling (`scripts/`)
- <Gate steps, generators, validators, verifiers added or changed.>

### CI / repository (`.github/`, root)
- <Workflows, rulesets, templates, dotfiles, package.json.>

### Agent layer
- <AGENTS.md / CLAUDE.md / `.claude/`, `docs/AGENT_CONTRACT.md`, instructions, prompts.>

### Samples and tests
- <New sample pairs and baseline entries (declare a rebaseline here AND in the release note).>
- Tests: <N> across <N> files (was <N>) — <the suites added>.

### Documentation
- <README sections, knowledge base, llms.txt, SECURITY, CONTRIBUTING, ROADMAP, CHANGELOG,
  CITATION, samples/README, release note.>

## Independent audit

`/release-audit release-notes/vX.Y.Z.md vA.B.C` — <PENDING | the ledger: tally per severity,
every CONFIRMED / DOWNGRADED finding with its fix commit, every waiver with its reason>.

## Validation (what actually ran on the release branch, <OS>, Node <version>)

- `npx tsx scripts/gate.ts --fast` → <the summary line as printed>.
- `npm run test:coverage` → **<N> / <N> passing across <N> files**; coverage <S> % stmts /
  <B> % branches / <F> % functions / <L> % lines (thresholds <S> / <B> / <F> / <L>).
- `npm run verify:docs` → <N> rules across the documentation corpus, <N> errors.
- `npm run build && npm run test:generate && npx tsx scripts/verify-samples.ts --strict` →
  <N> tracked samples match the baseline (<N> byte-exact, <N> semantic).
- `npm run corpus:pdfa && npm run validate:pdfx` → <N PASS, N XFAIL>; `npm run validate:pdfa`
  (veraPDF <version>) → <N PASS, N XFAIL>.
- `npx tsx scripts/gate.ts --publish --require-all` → **<N> passed, 0 skipped in <N> s**
  (<each step with its figure, as the gate printed them>).
- Built binary smoke: `--version` <X.Y.Z>; `doctor --format json` (pdfnative <D.E.F>, …);
  <the round trips you ran>.
- `npm audit --audit-level=high` → <clean>.

## Backward compatibility

- <No flag, default, exit code or error code removed or renamed — or the list of what changed.>
- <Every envelope field is additive and pinned by `schema status`.>
- <Byte-level output changes inherited from the engine, if any, and the rebaseline they caused.>

## Out of scope (tracked in ROADMAP.md)

- <Upstream-blocked items and deferred work, each with its ROADMAP entry.>

## Human-in-the-loop — steps for the maintainer

1. <`git add --renormalize .` commit, if pending.>
2. Import or update the rulesets (CONTRIBUTING §Branch protection).
3. Merge (squash, title `release: vX.Y.Z — <headline>`), tag `vX.Y.Z`, publish the GitHub
   Release (body = `release-notes/vX.Y.Z.md`); `publish.yml` takes it from there.
4. <Anything the release needs on the engine side (a pdfnative pull request, an issue).>

## Self-review checklist

- [ ] Every count above was produced by a command on this branch, not typed from memory.
- [ ] `release-notes/vX.Y.Z.md` and CHANGELOG §X.Y.Z say the same things as this body.
- [ ] `docs/assets/ecosystem.json` holds every figure quoted; `npm run verify:docs` is green.
- [ ] No `Co-Authored-By` trailer and no "Generated with" footer anywhere on the branch.
- [ ] The independent audit ledger is attached above with every `fix` column filled.
