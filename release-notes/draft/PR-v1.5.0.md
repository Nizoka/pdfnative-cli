# v1.5.0 — typography, 27 scripts, CMYK & PDF/X-4

> **Branch:** `release/v1.5.0` → `main`
> **Type:** Minor release (additive, fully backward-compatible with v1.4.0)
> **pdfnative bump:** `^1.7.0` → `^1.8.0`

## Summary

Aligns the CLI with pdfnative 1.8.0 in both directions: every 1.8.0 engine feature is
exposed (typography engine, CMYK colours + colour bars, PDF/X-4 with a structural
validator, 27 Unicode scripts + `latin` aliases, custom fonts from disk, UTC and pinnable
creation dates), every roadmap item the engine unblocked is delivered (global flags before
the command, `annotate link`, `sign --timestamp-timeout`, `verify` weak-digest note,
`inspect --iso-dates`, richer `doctor`, SSRF ranges, `--layout` cap, table-variant fonts,
CHANGELOG compare links), and the repository adopts the engine's engineering without
reinventing it: one quality gate, a byte-exact sample baseline, a PDF/A + PDF/X conformance
corpus, hardened CI with Trusted Publishing and attestations, a documentation verifier and a
committed Claude Code layer.

Counts: 21 commands, 19 schema subjects, 12 stable error codes and 14 manifest commands
unchanged; global flags 9 → 10 (`--creation-date`); `render` flags 44 → 57; `inspect`
14 → 16; `sign` 21 → 23; `--font` 22 → 27 scripts (+ 4 aliases); `--strict` diagnostics
3 → 9; `doctor` checks 5 → 8; conformance corpus 12 → 22 files; workflows 5 → 9;
tests 600 → 1403 across 96 files.

## Changes

### Engine surface (`src/core-bridge/index.ts`, `src/commands/render.ts`, `src/utils/`)
- Bridge block `(pdfnative 1.8.0)`: `PDF_X_CONFORMANCE_TARGETS`, `validatePdfX`,
  `setDefaultCreationDate` / `getDefaultCreationDate`, `validateURL`, `USE_UNICODE_VERSION`,
  `validateFontData`, `parseFontData` (`pdfnative/tools`) + the 1.8.0 types.
- `utils/layout.ts` rewritten: `reviveLayoutJson` (attachments, ICC arrays, `creationDate`),
  `mergeNestedLayout` (`typography`, `outputIntent`), `parsePdfx`, `parseTrapped`,
  `buildOutputIntentFromFlags` (16 MiB cap, `acsp` check), `buildTypographyFromFlags`,
  PDF/X × PDF/A and PDF/X × encryption pre-checks, 50 MB cap on `--layout`.
- `utils/fonts.ts` (new): `BUNDLED_FONT_MODULES` (31), `SCRIPT_CODES` (27), `FONT_ALIASES`,
  `applyFontFlags`, `buildFontEntriesForLangs` (document + table variant),
  `loadCustomFonts` for `--font-file` (path check, 32 MiB cap, magic bytes,
  `parseFontData` + `validateFontData`, name collision guard).
- `utils/reproducible.ts` (new): strict `--creation-date` / `SOURCE_DATE_EPOCH` resolution,
  applied once in `index.ts` after the config merge (process-wide, `batch` inherits).
- `utils/build-errors.ts` (new): `classifyBuildError` maps the engine's PDF/X, print,
  OutputIntent, attachment and watermark coherence messages to `E_INPUT` (fixture
  `tests/fixtures/pdfnative-build-errors.json`, engine 1.8.0).
- `utils/args.ts` (`booleanFlags`, `GLOBAL_BOOLEAN_FLAGS`) + `utils/argv.ts`
  (`splitCommandArgv`): global flags before the command.
- `utils/pdfdate.ts` (new): `pdfDateToIso` for `inspect --iso-dates`.
- `utils/fetch-guard.ts`: 198.18.0.0/15, 192.0.2.0/24, 64:ff9b::/96 blocked.
- `utils/governance.ts`: `AI_GOVERNANCE_POLICY` is now the verbatim 1.1.0 policy.

### Commands
- `render`: `--pdfx`, `--output-intent-icc`, `--output-intent-id`, `--trapped`,
  `--font-file`, `--split-paragraphs`, `--keep-headings-with-next`, `--kerning`,
  `--font-features`; 27 scripts + aliases; envelope `pdfx` / `creationDate`; 9 `--strict`
  codes; `--variant table` embeds fonts.
- `inspect`: `--pdfx`, `--check pdfx`, `pdfxConformance`, `--iso-dates`, summary `pdfx`,
  `PDF/X:` text lines.
- `annotate`: `link` type (`buildLinkBody` after `validateURL`).
- `sign`: `--timestamp-timeout <ms>` → `createTsaProvider(url, { timeoutMs })`,
  `timestamp.timeoutMs` in both envelopes.
- `verify`: `timestampDigest`, `WEAK_DIGEST_NOTE`, `digestOk` under `--strict`.
- `doctor`: `fonts`, `unicode`, `conformance` checks.
- `schema` / `completion`: every new flag and field; `SUBJECTS` exported; `manifest`
  PATH_FLAGS += `output-intent-icc`, `font-file`.
- `index.ts`: usage texts (Conformance / Typography / Fonts blocks, `--creation-date`,
  `docs/AGENT_CONTRACT.md` pointer); `fill` usage no longer names a phantom flag.

### Tooling (`scripts/`)
- `gate.ts` (STEPS + fast / ci / publish, `--only`, `--json`, `--require-all`),
  `validate-pdfa.ts`, `generate-pdfa-corpus.ts`, `validate-pdfx.ts`, `lib/{verapdf,pdfx,
  pdfa-corpus}.ts` (22 entries), `helpers/{tz,io,cli}.ts`.
- `generate-samples.ts` + `generators/{render,drivers,derived}.ts` + `lib/sample-plan.ts`
  (replaces `samples/run-all.js`), `lib/sample-fingerprint.ts` + `verify-samples.ts`
  (chained baseline, semantic mode for encrypted and signed samples, identical groups).
- `verify-docs.ts` (26 rules) + `lib/{cli-surface,agent-config,prose-language}.ts`,
  `release-prepare.ts`, `build-claude-rules.ts`, `install-git-hooks.mjs`.
- `docs/assets/ecosystem.json` — the single source of every count and version.

### CI / repository (`.github/`, root)
- Workflows `ci`, `publish` (Trusted Publishing, npm 11.19.1, publish gate, SBOM +
  attestations, release upload), `verapdf` (composite action + SHA-256 checksum),
  `sample-regression`, `dependency-review`, `audit`, `docs`, `codeql`, `scorecard` —
  harden-runner, SHA pins, `persist-credentials: false`, `npm ci --ignore-scripts`.
- `.github/rulesets/{main,tags}.json`, `dependabot.yml` (ignore `@types/node` majors),
  `pull_request_template.md` (mirrors CONTRIBUTING §Pull Request Checklist),
  `prompts/quality-gate.prompt.md`, `instructions/*` refreshed, `copilot-instructions.md`
  rewritten (it still said "eleven commands" and "Node ≥ 20"), `ai-governance.json` 1.1.0.
- `.npmrc`, `.nvmrc` / `.node-version` = 22, `.gitattributes`, `.githooks/`,
  `.vscode/settings.json`, `tsconfig.scripts.json`, `vitest.config.ts` (`TZ=UTC`, forks,
  gate JSON report), `package.json` (scripts, overrides, description, keywords).

### Agent layer
- `docs/AGENT_CONTRACT.md` (consumer contract, moved out of AGENTS.md), `AGENTS.md`
  (repository rules, pdfnative structure, 9.8 KB), `CLAUDE.md` = `@AGENTS.md` + addendum,
  `.claude/settings.json`, `.claude/hooks/guard.mjs` + `.d.mts`, `.claude/rules/`
  (generated), `.claude/skills/release-audit/`.

### Samples and tests
- New samples (dual-shell pairs): `render/typography/` (4), `render/print/03-05` +
  `synthetic-cmyk.icc`, `render/multilang/05-07`, `render/font/04-05`,
  `render/reproducible/`, `inspect/09-10`, `doctor/02`, `annotate/02`, `verify/07`,
  `sign/10`, `agent/05`; multilang drivers honour `PDFNATIVE_SAMPLES_OUT` /
  `SOURCE_DATE_EPOCH`; `tests/regression/baselines/samples.sha256.json` (91 sample PDFs).
- Tests: 1403 across 96 files (was 600) — `tests/helpers/cli-harness.ts`, per-feature
  command suites, utils, `integration/{pdfx-roundtrip,reproducible-build}`,
  `tools/{gate,verapdf,pdfx,workflows,sample-plan,verify-docs,cli-surface,agent-config,
  build-claude-rules,release-prepare,guard}`, `regression/samples`, `docs/prose-language`.

### Documentation
- README (banner, highlights, feature table v1.5.0 block, PDF/A & PDF/X status, quick
  start, samples table, command reference, agents, security), `docs/KNOWLEDGE_BASE.md`,
  `llms.txt`, `SECURITY.md`, `CONTRIBUTING.md` (gate, baseline policy, corpus, Release),
  `ROADMAP.md` (v1.5.0 block; re-triaged future items incl. the new upstream gaps),
  `CHANGELOG.md` (1.5.0 entry + compare links back to 0.1.0), `CITATION.cff`,
  `samples/README.md`, `tests/fixtures/README.md`, `release-notes/v1.5.0.md`.

## Independent audit

Method of `.claude/skills/release-audit/` applied on the branch before this PR: two
independent auditors, an adversarial verifier, the fixes, a final reviewer and a re-review of
the final fixes. Every finding carries a reproducible command; the working reports stay out
of the tree (git-ignored `.audit/`). The maintainer's own `/release-audit
release-notes/v1.5.0.md v1.4.0` countersigns this before merge.

- **Auditor A — claims vs code**: 55 claims of the release note, CHANGELOG, README and
  AGENT_CONTRACT checked against the code and the built binary.
- **Auditor B — hardening parity**: 118 mechanisms of pdfnative 1.8.0 compared (package,
  `.github/`, scripts, tests, `.claude/`, docs, supply chain) + the agent surfaces.
- **Verifier**: 14 CONFIRMED, 1 DOWNGRADED, 3 DUPLICATE, 3 REJECTED — 0 blocker, 6 major,
  8 minor, 1 note.
- **Final reviewer D** (read-only, agent-autonomy pass on 10 features): conditional NO-GO on
  2 majors, both fixed; **re-review**: all D fixes hold, 2 minor residues + 1 note fixed.

| id | severity | finding | fix |
|---|---|---|---|
| A-22 | major | `render --dry-run` returned before the engine builder: no coherence error, no diagnostics | `d2df525` — the real buffered build runs in memory, bytes discarded |
| A-12 / A-13 / A-14 | major | docs named `layout.typography.features` / `softHyphens` / `justify` and an object form of `punctuationSpacing`; none exists in the engine | `3cddfb3` — `fontFeatures`, paragraph `align`, `'fr' \| 'fr-CA' \| rule[]` |
| B-03 | major | `schema status` pinned 9 of the emitted envelope fields | `3cddfb3` — 31 properties pinned + an emit ↔ schema parity test |
| A-08 | major | CI ran the tests before the build: two `runIf` suites skipped silently | `f795e20` — build and samples first, `GATE_REQUIRE_ARTIFACTS=1` |
| D-01 | major | `formField.fieldType: "textarea"` (3 samples, docs) is not an engine type: `NaN` rectangles, `fill` refused the PDF | `ee0fc95` — `render` refuses unknown types (`E_INPUT`), samples corrected and rebaselined |
| D-02 | major | a command flag before the command swallowed the command name (usage, exit 0) | `ee0fc95`, `b1f87c3` — recovered before the first positional; no command → exit 2 |
| A-23, A-30, A-34, A-44, B-08, B-09, B-17, B-18 | minor | `acsp` check attribution, `batch` envelope wording, `inspect` `modDate`, config sections for 21 commands, `govern rules` = AGENT_RULES.md verbatim, dead anchor, flag counts, Node version in the bug template | `3cddfb3` |
| D-03 … D-11 | minor / note | `liga` example, ROADMAP wording, `--iso-dates` help, instruction files vs binary, kerning note, stderr last-line rule, ledger under a read-denied path, temp-name collision | `ee0fc95` |
| R-01, R-02, R-04 | minor / note | a typo + a flag value equal to a command name dispatched that command; `--pretty schema status` printed another subject; `blocks: [null]` raised a `TypeError` | `b1f87c3` |
| A-45 | note | stale comment on the engine's `exports` map | `3cddfb3` |
| G1, G4, G5 | parity | hostile-input suite, `anchor-parity` rule, `bundle-check` gate step | `01cb2d3`, `a11c891`, `f795e20` |
| G2, G3, G6, G8, G9, G10, G14, G15 | parity | PR template, drafts template, compliance-audit prompt, CONTRIBUTING (first PR, branch protection), `scripts/README.md`, `scripts/tsconfig.json`, exact esbuild override, ignored logs | `4fec43f` |
| G7 | note | no `THIRD-PARTY-NOTICES.md` | waived — the CLI vendors nothing (2 externals, checked by `bundle-check`) |
| G11 | note | no `bench/` | deferred by the maintainer — ROADMAP entry |

Rejected by the verifier: the `docs.yml` call form, the README badge placeholder (inside an
HTML comment), one duplicate claim. Known and accepted: R-03 — a boolean command flag
followed by two command names (`--pretty schema render`) is ambiguous; AGENT_CONTRACT §1
tells agents to write command flags after the command. One intermittent failure of the
live-tree `verify-docs` test was seen twice under `gate --fast` while files were being
edited and not reproduced in 11 consecutive full runs on a quiet tree.

**Verdict: GO** — no open blocker, every major has a commit, publish gate green (below).

## Engine-surface coverage closure

After the audit, every user-facing bullet of the pdfnative 1.8.0 changelog was mapped to the
CLI's tests and samples (`tests/regression/engine-surface.json`, 85 items: tests + samples, or a
motivated waiver). The mapping found about thirty gaps — four 1.8.0 fixes with no CLI coverage
(AcroForm `/DR` font under PDF/A, `--inspect-layout` with a table of contents, `fr` ≡ `fr-CA`,
marks clearance), five of nine diagnostic codes never triggered, 14 of 27 script codes never
rendered with their font, `metrics: "exact"` inert in its own sample — all closed:

- 10 new suites; a trigger table for the 9 diagnostics; the 27 scripts rendered under
  `--tagged pdfa2b --strict`; a transmission contract for `validatePdfX` on crafted PDFs.
- 12 samples + 10 dual-shell pairs (validated under Git Bash and PowerShell); baseline 79 → 91,
  additions only. Conformance corpus 16 → 22 (veraPDF: form under PDF/A-2b, Gray and CMYK
  intents pass; unembedded form font and ICC v4 under PDF/A-1b are rejected).
- A generated, veraPDF-accepted Gray `prtr` ICC profile (`scripts/lib/synthetic-gray-profile.ts`).
- One CLI bug found and fixed on the way: `inspect` / `compare` and UTF-16 `/Info` strings.
- Engine limits found and pinned with `it.fails` (untagged extraction of Khmer / Myanmar stacks
  and of CJK ideographs), plus two recorded in ROADMAP.md (a long table of contents does not
  paginate; a malformed chart series raises a `TypeError`). No CLI workaround.

## Validation (what actually ran on the release branch, Windows 11, Node 22.17.0)

- `npm run typecheck:all` → clean (three configs). `npm run lint` → clean.
- `npm run test:coverage` → **1403 / 1403 passing across 96 files**; coverage
  statements 86.06 % / branches 75.91 % / functions 92.59 % / lines 87.92 %
  (thresholds raised 79/68/83/79 → 82/71/86/82, `min(measured − 2, current + 3)`).
- `npm run verify:docs` → 26 rules across the documentation corpus, 0 errors
  (156 `eol-lf` warnings, shrinking as touched files normalise: CRLF blobs pending the maintainer's renormalisation commit).
- `npm run build && npm run test:generate` → 91 sample PDFs, byte-identical across two runs;
  `npx tsx scripts/verify-samples.ts --strict` → green.
- `npm run corpus:pdfa && npm run validate:pdfx` → 22 files; PDF/X 3 PASS + 1 XFAIL.
- `npm run validate:pdfa` with veraPDF 1.30.2 (portable) + JDK 13 (`JAVACMD`) →
  14 PASS + 4 XFAIL + 4 SKIP (the PDF/X files), exit 0.
- `npx tsx scripts/gate.ts --publish --require-all` at `d4d8530` → **14 passed, 0 skipped
  in 437 s** (typecheck:all 26 s, lint 10 s, build 10 s, dist-check, smoke — 21 commands —,
  bundle-size 368 KiB of the 448 KiB budget, bundle-check — 2 externals —, test:generate
  44 s — 91 sample PDFs —, test:coverage 130 s — 1403 tests, 86.1 % stmts —, verify:docs 8 s,
  verify:samples 10 s, corpus:pdfa 30 s — 22 files —, validate:pdfx 11 s, validate:pdfa 158 s).
- Built binary smoke: `--version` 1.5.0; `doctor --json` (pdfnative 1.8.0, fonts
  31/27, unicode, conformance); PDF/X-4 render → `inspect --check pdfx` exit 0 →
  `annotate` link → `--check pdfx` exit 1; identical SHA-256 under `TZ=Europe/Paris`
  and `TZ=UTC`, and via `SOURCE_DATE_EPOCH`; `pdfnative --json --dry-run render …`.
- `npm audit` → 0 vulnerabilities. `node .claude/hooks/guard.mjs` refuses `git push`
  (stdin test in `tests/tools/guard.test.ts`).
- Not run here: the GitHub workflows themselves (they run on the PR), `docs.yml --online`.

## Backward compatibility

- No flag removed or renamed; no exit-code or error-code semantics changed; every envelope
  field is additive and pinned by `schema status`; `schema` `$id` moves with the version.
- Byte-level changes are inherited from pdfnative 1.8.0 (UTC dates, `/ActualText`, hinting
  tables) — spec-valid output, not byte-identical to 1.4.0; documented in the release note
  and CHANGELOG Compatibility sections.
- `samples/run-all.js` removed (a repository script, never part of the npm surface).
- `npm ci --ignore-scripts` / `.npmrc ignore-scripts=true` disables `prepublishOnly` locally;
  the gate builds explicitly.

## Out of scope (tracked in ROADMAP.md)

- `metadata` keeping the PDF/X identification; reproducible signed output (per-revision
  `/ID`); PDF/X-1a / -3 / -4p and spot colours; PDF/A + PDF/X in one file — all upstream.
- Hyphenation dictionaries from the CLI (posture); visual sample regression (no rasteriser);
  `optimize` / linearisation; visual `compare`; category help commands; man pages;
  positional arguments in manifest tasks.

## Human-in-the-loop — steps for the maintainer

1. `git add --renormalize .` on this branch (then flip `EOL_LF_MODE` to `'fail'` in
   `scripts/lib/agent-config.ts`) — the agent never runs it (guard hook).
2. Push `release/v1.5.0`, open this PR with this body; required checks `ci (22)`,
   `ci (24)`, `sample-regression` (import `.github/rulesets/*.json` via
   `gh api repos/Nizoka/pdfnative-cli/rulesets --method POST --input …` once; keep
   `verapdf` and `docs` unrequired — path-filtered).
3. Create the `npm-publish` environment (required reviewer), link npm Trusted Publishing
   to `publish.yml` + that environment, enable the dependency graph, close or merge the
   open Dependabot PRs superseded by the pinned versions.
4. Squash-merge as `release: v1.5.0 — typography, 27 scripts, CMYK & PDF/X-4`, tag
   `v1.5.0` on the merge commit, publish the GitHub Release with
   `release-notes/v1.5.0.md`, approve the environment; then `npm view pdfnative-cli
   version`, a manual `docs.yml --online` run; at J+14 consider `egress-policy: block` on
   `publish.yml`.
5. Countersign the audit: `/release-audit release-notes/v1.5.0.md v1.4.0` in Claude Code
   (ledger under `.audit/1.5.0/`) before the merge.
6. Upstream issues to file on pdfnative (drafts go through `pdfnative govern verify-issue`):
   untagged extraction (U+FFFD for Khmer / Myanmar stacks, Kangxi radicals for CJK); a long
   table of contents does not paginate; a chart series without `label` raises a `TypeError`;
   a Gray synthetic profile generator to sit next to the CMYK one; export
   `decodePdfTextString`; `formField.fieldType` is not validated (`NaN` rectangles); `updateMetadata` drops the
   PDF/X identification; the signed revision `/ID` ignores the pinned creation instant;
   kerning on untagged output leaves a stray space in extracted text.
7. In the pdfnative repository: `docs/guides/cli.md`, `docs/data/surfaces.json`
   (`pdfnative-cli` gaps are closed) and `docs/assets/ecosystem.json` (cli 1.5.0, pin
   `^1.8.0`) — an alignment PR after publication.

## Self-review checklist

- [x] No `console.log` in `src/`; all output via `process.stdout.write` / `process.stderr.write`.
- [x] No key material or password in any message; `sign` failures stay `Failed to sign PDF.`.
- [x] Path-traversal validation and size caps on every new file flag (`--output-intent-icc`,
      `--font-file`, `--layout`); fonts and profiles never loaded from JSON.
- [x] Network paths unchanged (still five opt-ins through the SSRF guard); `--dry-run` never
      touches the network; `--timestamp-timeout` only bounds an existing opt-in.
- [x] TypeScript strict; no `any`; `readonly` where applicable; ESM-first with `.js` imports.
- [x] Every `pdfnative` symbol goes through `src/core-bridge/index.ts`.
- [x] `pdfnative` is still the **only** runtime dependency (`tsx` is dev-only).
- [x] Every new command flag is in `completion.ts` and its usage text (`flag-parity`);
      every new envelope field in `schema.ts` (`schema-parity`).
- [x] Commits carry no `Co-Authored-By` / generated-with trailer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
