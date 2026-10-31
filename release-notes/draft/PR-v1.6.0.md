# v1.6.0 — right-to-left, 32 scripts, spot colours & the dual PDF/A + PDF/X claim

> **Branch:** `release/v1.6.0` → `main`
> **Type:** Minor release (additive, fully backward-compatible with v1.5.0)
> **pdfnative bump:** `^1.8.0` → `^1.9.0`

## Summary

Aligns the CLI with pdfnative 1.9.0 in both directions. Every 1.9.0 engine feature is
exposed: right-to-left layout under the full UAX #9 (`render --direction auto|ltr|rtl`,
`--actual-text`), five more Indic scripts (`gu pa kn ml or` — 32 Unicode scripts, 36 font
modules), spot colours (`layout.print.spotColours`, `{ spot, tint }` / `{ inks }` values),
the PDF/A-2 + PDF/X-4 dual claim in one file, JPEG 2000 images, four more diagnostics, the
stream-limit policy of `extractText()` (`extract-text` / `compare --on-stream-error`),
offline LTV material (`ltv embed --cert/--ocsp/--crl --match`), engine-built `/Link` bodies
and text-string decoding. Every roadmap item the engine unblocked is delivered: logical-order
extraction of untagged shaped text, the paginating table of contents, label-less chart
series, the dual claim, spot colours.

For an agent: the command surface is 100 % backward-compatible and now **proved** so — the
v1.5.0 test suite and its `schema manifest` / `status` / `list` captures run against the
current sources on every pull request (`compat-previous`, `tests/compat/`), SECURITY.md
states the compatibility promise and the supported runtimes, and every new envelope field
(`tagged`, `direction`, `actualText`, `match`) is pinned by `schema status`.

For the repository: the CI/CD is aligned with the engine's — the gate required on Ubuntu
(Node 22, 24), Windows and macOS, `workflow lint` (zizmor + actionlint), CodeQL
`security-extended` with the `actions` language, `publish.yml` as guard → build → publish →
attest (npm client pinned by SHA-512, the registry bytes attested, SLSA Build L2),
ClusterFuzzLite over nine parser targets, Dependabot with a cooldown, a repository
normalised to LF, and every open Dependabot and code-scanning item of the backlog closed or
acknowledged (below).

Counts: 21 commands, 19 schema subjects, 12 stable error codes, 10 global flags and 14
manifest commands unchanged; `render` flags 57 → 59; `extract-text` 9 → 10; `compare`
8 → 9; `ltv` 7 → 11; `--font` 27 → 32 scripts (36 modules); `--strict` diagnostics 9 → 13;
`doctor` checks 8 (unchanged); sample baseline 91 → 99 PDFs; conformance corpus 22 → 25
files; workflows 9 → 11; tests 1403 → 1555 across 103 files (was 96); npm keywords
116 → 146.

## Changes

### Engine surface (`src/core-bridge/index.ts`, `src/commands/render.ts`, `src/utils/`)
- Bridge block `(pdfnative 1.9.0)`: `PdfStreamLimitError`, `decodePdfTextString`,
  `composeLtvData`, `ocspResponseMatchesCertificate`, the types `TextDirection`,
  `SpotColourDef`, `PdfSpotColor`, `PdfInkMix`, `StreamErrorPolicy`, `LtvMaterial`,
  `ComposeLtvOptions`, `LinkMarkupAnnotation`; `buildSyntheticGrayProfile` /
  `buildSyntheticCmykProfile` from `pdfnative/tools`.
- `utils/layout.ts`: `VALID_DIRECTIONS`, `--direction` → `layout.direction`, `--actual-text`
  → `layout.actualText`; the `--pdfx × --tagged` pre-check removed (the engine decides per
  level). `utils/fonts.ts`: five Noto modules (36 / 32). `utils/build-errors.ts`: the
  `Spot colour …` / `Ink mix …` prefixes. `utils/pdfops.ts`: `parseStreamErrorPolicy`,
  `PdfStreamLimitError` → `E_INPUT` by instance, the `--on-stream-error` remedy named only by
  the commands that own the flag. `utils/pdftext.ts` deleted (engine decoder).
  `utils/config.ts`: `parseConfigText` (pure half, fuzzed); `utils/fetch-guard.ts`:
  `parseFetchUrl` (admission half, fuzzed); an unreadable config file reports its I/O error.
- `commands/render.ts`: `conformanceFields` adds `tagged` (a PDF/A level only), `direction`,
  `actualText: false`; `assertTableParamsShape` refuses a malformed `PdfParams` with `E_INPUT`.

### Commands
- `render`: `--direction`, `--actual-text`; `gu pa kn ml or`; spot colours (JSON); the dual
  claim; JPEG 2000 pass-through; `PDFA_GLYPH_WITHOUT_UNICODE`, `PDFA1_JPX_IMAGE`,
  `PDFA_JPX_IMAGE`, `TEXT_GLYPH_NOT_COVERED` under `--strict`; envelope `tagged`,
  `direction`, `actualText`.
- `extract-text` / `compare`: `--on-stream-error limit|throw|skip`; logical-order text from
  untagged shaped and right-to-left runs.
- `ltv embed`: `--cert` / `--ocsp` / `--crl` (repeatable, PEM anywhere in the file or DER,
  16 MiB each), `--match all|chain`, exclusive with `--data`; `composeLtvData:` refusals →
  `E_INPUT`, an unreadable document → `E_PARSE` with its message; `collect` / `add` refuse
  the embed-only flags; envelope `match`.
- `annotate`: `link` bodies from `buildAnnotationBody({ type: 'link' })`;
  `parseAnnotationsJson` exported for the fuzz target. `inspect` / `compare`: `/Info` strings
  through `decodePdfTextString`.
- `schema`: `status` pins the four fields; `render` describes direction, actualText, spot
  colours, JPEG 2000, the dual claim, the table-variant shape; 13 diagnostics, 32 scripts.
  `completion`: every new flag. `index.ts`: usage texts.

### Tooling (`scripts/`)
- `run-compat.ts` (`npm run compat:previous`): the previous release's `tests/`, `samples/`
  and vitest config at its tag, the current `src/` / `scripts/` / `dist/` beside them, the
  suite minus `tests/compat/allow-<version>.json` (reason + ledger entry per exclusion;
  `--tag` runs under that release's own allow-list; a malformed list exits 2 with the file
  named). `gate.ts`: step `compat:previous` (publish profile; one allow-list discovery shared
  with `run-compat.ts`, numeric order).
- `lib/pdfa-corpus.ts`: `Claim = 'pdfa' | 'pdfx' | 'both' | 'none'`, `claimsStandard`;
  entries `pdfx4-spot-colours`, `dual-pdfa2b-pdfx4` (both), `jpx-pdfa2b` (25 files).
  `lib/icc-canary.ts` replaces the vendored `synthetic-gray-profile.ts` (the profiles come
  from `pdfnative/tools`). `lib/sample-plan.ts`, `generators/derived.ts`
  (`sign/rsa-pkcs7-ltv-offline.pdf`), `lib/sample-fingerprint.ts` (the `/DSS` inventory in
  the semantic projection).
- `verify-docs.ts`: the include-form CI matrix (`ciMatrixMajors`), the advisory newer major,
  a shipped release note leaving the count-checked corpus, `eol-lf` as an error.

### CI / repository (`.github/`, root)
- `ci.yml` (no path filter; `ci (22)`, `ci (24)`, `windows`, `macos`, `compat-previous`,
  `workflow lint`), `codeql.yml` (job-level permissions, `actions` + `javascript-typescript`,
  build-mode none, `security-extended`), `publish.yml` (guard → build → publish → attest),
  `node-current.yml` (Node 26, advisory), `fuzz.yml` (ClusterFuzzLite, advisory), the other
  seven on checkout 7.0.1 / codeql-action 4.38.0 with dated harden-runner reasons;
  `setup-verapdf` returns an output. `dependabot.yml` (four ecosystems, 7-day cooldown).
  `rulesets/main.json` (seven required contexts; `merge` + `squash`).
- `fuzz/` (nine targets, `surface.ts`, `_contract.js`), `.clusterfuzzlite/` (project.yaml,
  digest-pinned Dockerfile, build.sh, `engine/` with Jazzer.js 4.0.0 pinned by its own
  lockfile), `tsup.config.ts` (the fuzz surface bundle into `fuzz/.build/`, git-ignored),
  `vitest.config.ts` (the `#fuzz-surface` alias), `package.json` `imports` (private),
  `tsconfig.test.json` paths.
- Repository normalised to LF (155 blobs, `.git-blame-ignore-revs`, `EOL_LF_MODE = 'fail'`);
  `tests/helpers/cli-harness.ts` `tmpName()` on `randomUUID()`; dev toolchain patch
  (vitest 4.1.12, vite 8.3.5, brace-expansion, source-map-js, `@types/node`, tsx,
  typescript-eslint); `package.json` description + keywords; `CITATION.cff`.

### Agent layer
- `docs/AGENT_CONTRACT.md` (four status fields, the stream-limit and logical-order notes, the
  offline LTV rung, "stable across 1.x"), `llms.txt`, `AGENTS.md` / `CLAUDE.md` (compat,
  `fuzz/`, `fuzz/.build/` never read, the publish gate's compat step), `.github/instructions/`
  (commands, testing: compat + fuzz rules) → `.claude/rules/`, `copilot-instructions.md`,
  `.claude/skills/release-audit/SKILL.md` (two blind spots), `.claude/settings.json`
  (`Read(fuzz/.build/**)` denied).

### Samples and tests
- New samples: `render/multilang/12-five-indic-scripts`, `13-rtl-direction`,
  `render/print/08-spot-colours`, `09-dual-pdfa2b-pdfx4` (+ pairs), `render/images/01-jpeg2000`
  (+ `minimal-rgb.jp2`), `render/chart/06-per-bar-colours`, `render/toc/02-long-toc`,
  `extract-text/03-rtl-logical-order` (pair), `sign/11-ltv-offline` (pair);
  `table-variant/01-financial-transactions.json` corrected to `{ label, value }`.
- **Rebaseline declared** (also in the release note): one rebaseline, 46 of the 91 entries
  re-anchored to `since: 1.6.0` (every sample embedding a font — lean, compact, tagged
  subsets —, every untagged document with shaped or RTL text — `/ActualText` —, one text
  object per line, the watermark transparency group, tagged-table semantics, the engine's
  `/Link` body, `invoice.xml` normalised to LF, the corrected table variant; the encrypted and
  signed semantic entries follow their subsets) and 8 added; 45 keep their 1.5.0 reference.
- Tests: 1555 across 103 files (was 1403 / 96) — `render-direction`, `render-spot-colours`,
  `render-images`, `render-engine-1-9`, `tests/fuzz/targets` (the ClusterFuzzLite targets),
  `tests/fuzz/pdf-bytes` (stream limit, CWE-835) and `fonts` (CWE-125), `tests/tools/
  manifest-compat`, `run-compat`, `synthetic-profiles`, `workflows` (rewritten), the ltv
  offline-material cases, `tests/regression/engine-surface.json` at 72 items (engine 1.9.0),
  `tests/fixtures/pdfnative-build-errors.json` at 33 messages, JP2 fixtures.

### Documentation
- README (SEO sentence, banner, highlights, the v1.6.0 feature-table group, corpus status,
  requirements and supported OSes, quick start, command reference for render / ltv /
  extract-text / compare / annotate, agents, security, related projects),
  `docs/KNOWLEDGE_BASE.md`, `docs/AGENT_CONTRACT.md`, `llms.txt`, `SECURITY.md` (§Supported
  runtimes, §Compatibility promise, §Code Safety, §Supply chain + Scorecard), `CONTRIBUTING.md`
  (gate, compat, fuzzing, SHA resolution, release steps, branch protection), `ROADMAP.md`
  (v1.6.0 block; the future list re-triaged), `CHANGELOG.md` (1.6.0 + compare link),
  `scripts/README.md`, `samples/README.md`, `tests/fixtures/README.md`,
  `release-notes/v1.6.0.md`.

## GitHub backlog

| Item | Decision |
|---|---|
| Dependabot alerts #18–#26 (source-map-js, brace-expansion, vite ×5, `@vitest/mocker` ×2) | closed by the dev-toolchain bumps (`caed1ac`); all development scope, none shipped |
| Dependabot PRs #43, #45, #46 (codeql-action 4.38.0), #44 (checkout 7.0.1), #47 (`@types/node`, tsx, typescript-eslint), #48, #49 | the same bumps are on this branch; Dependabot closes them after the merge |
| Dependabot PR #21 (codeql-action 4.36.2, conflicting) | superseded — **maintainer closes it** |
| CodeQL #16, #17 (`js/insecure-randomness`) | fixed at the source (`6fad8d1`: one `tmpName()` on `randomUUID()`) |
| Scorecard #2 (workflow-level `security-events: write`) | fixed (`codeql.yml`, job level) |
| Scorecard #15 (`npm install -g npm@…` unpinned) | fixed (the publish client is pinned by the SHA-512 of its registry tarball) |
| Scorecard #14 (`contents: write` in publish) | acknowledged in SECURITY.md (the `attest` job's only write grant, release assets) |
| Scorecard #6 (vulnerabilities) | closed by the bumps; `npm audit --audit-level=high` clean (one moderate, unfixable in the eslint 9 line, documented) |
| Scorecard #7 (fuzzing) | ClusterFuzzLite (`fuzz.yml`, `fuzz/`, `.clusterfuzzlite/`) |
| Scorecard #3 (code review), #5 (Best Practices badge) | acknowledged in SECURITY.md; the badge is a maintainer registration (checklist below) |
| Scorecard #1 (branch protection) | the ruleset is active; re-check after the next weekly run with the seven contexts imported |

## Independent audit

`/release-audit release-notes/v1.6.0.md v1.5.0` — **pending, run by the maintainer** (the
skill is reserved for explicit user invocation). In its place, before this PR, an independent
verification agent (fresh context, the built binary, the `schema` outputs, the v1.5.0
captures, targeted suites, greps with line numbers) ran 28 checks:

- 25 hold (every new flag in `--help` and `schema manifest`; `schema status` pins `tagged`,
  `direction`, `actualText`, `match`; the right-to-left recipe extracts both source strings in
  logical order; the dual claim renders with `tagged` + `pdfx` in the envelope and `pdfa1b` is
  `E_INPUT`; `--on-stream-error bogus` is exit 2; `ltv add --cert` is refused naming `ltv
  embed`; the table-variant guard; `doctor` 36 / 32; `verify:docs` 26 rules; nothing removed
  from completion.ts / error.ts / schema.ts since v1.5.0 and the counts 57→59, 9→10, 8→9,
  7→11; `manifest-compat` green; `actualText: false` only when switched off; the PEM preamble;
  the 33-message fixture; the one remaining `it.fails`).
- 1 blocker — **V-08**: `inspect --check pdfa,pdfx`, the form the note, the README, the
  knowledge base, the render usage text and the shipped `print/09-dual-pdfa2b-pdfx4.{sh,ps1}`
  use, was refused with exit 2 (only the repeated form was accepted). Fixed in this branch:
  `--check` takes a comma list (additive), with a test; the docs name both forms.
- 2 minor — **V-12** "--cert belong to" for a single flag (fixed: agreement), **V-25** the note
  implied `schema render` lists the 13 diagnostic codes (fixed: `schema status` does).
- Not verified by the agent (environment-bound): `compat:previous`, the coverage figures, the
  publish gate and veraPDF — all run by the author, figures below.

Before the audit, `/code-review high` on the branch diff returned nine findings, all fixed
in `e26c272` (a PEM preamble longer than 64 bytes was handed to the engine as DER; a
non-`composeLtvData:` engine error lost its message; `ltv collect` / `add` ignored the
material flags; the `--on-stream-error` hint reached commands without the flag; `tagged:
true` from a layout reached the envelope; the allow-list discovery was implemented three
times with two orders; `--tag` ran under the wrong allow-list; a config read failure read as
"invalid JSON"; a malformed allow-list crashed the gate's skip check).

## Validation (what actually ran on the release branch, Windows 11, Node 22.23.2)

- `npx tsx scripts/gate.ts --fast` → typecheck:all, lint, test (1555 tests), verify:docs —
  all pass.
- `npm run test:coverage` → **1555 / 1555 passing across 103 files**; coverage
  statements 86.86 % / branches 77.37 % / functions 92.73 % / lines 88.48 % (thresholds
  82 / 71 / 86 / 82, unchanged).
- `npm run verify:docs` → 26 rules across the documentation corpus, 0 errors, 0 warnings
  (`eol-lf` is an error since the normalisation commit).
- `npm run build && npm run test:generate && npx tsx scripts/verify-samples.ts --strict` →
  99 sample PDFs match the baseline (88 byte-exact, 11 semantic).
- `npm run corpus:pdfa && npm run validate:pdfx` → 25 files; PDF/X 5 PASS + 1 XFAIL;
  `npm run validate:pdfa` (veraPDF 1.30.2, JDK 13) → 16 PASS + 4 XFAIL + 5 SKIP (the
  PDF/X-only files), exit 0 — the dual claim and the JPX under PDF/A-2b accepted.
- `npm run compat:previous` (tag `v1.5.0`) → 67 files, 839 cases of the v1.5.0 suite green
  against the current sources (14 exclusions, each with a reason; 5 ledger entries).
- `npx tsx scripts/gate.ts --publish --require-all` at `e26c272` → **15 passed, 0 skipped in
  424 s** (typecheck:all 24 s, lint 10 s, build 15 s, dist-check, smoke — 21 commands —,
  bundle-size 381 KiB of the 448 KiB budget, bundle-check — 2 externals —, test:generate
  57 s — 99 PDFs —, test:coverage 129 s — 1555 tests, 86.9 % stmts —, verify:docs 7 s,
  verify:samples 9 s, corpus:pdfa 16 s — the 25-file corpus —, validate:pdfx 4 s, validate:pdfa 114 s,
  compat:previous 38 s).
- Built binary smoke: `--version` 1.6.0; `doctor --format json` (pdfnative 1.9.0, fonts
  36 / 32, 13 conformance-relevant diagnostics listed by `schema`); the quick-start recipes
  of the release note against `dist/cli.cjs`; `govern verify-issue` green on the four
  upstream drafts.
- `npm audit --audit-level=high` → clean.
- Not run here: the GitHub workflows themselves (the Windows and macOS legs, `workflow lint`,
  CodeQL's `actions` scan, `fuzz.yml`, `node-current.yml` run for the first time on this PR;
  `publish.yml` on the release) — the audit verdict is conditional on that first green run.

## Backward compatibility

- No flag, default, exit code or error code removed or renamed; every envelope field is
  additive and pinned by `schema status`; the v1.5.0 `schema` captures are held by
  `tests/tools/manifest-compat.test.ts`.
- Compatibility ledger (`tests/compat/allow-1.5.0.json`, release note §Compatibility):
  C1 the dual claim is accepted (the usage error is gone; `pdfa1b` / `pdfa3b` keep a
  level-specific `E_INPUT`); C2 a stream past `--max-inflate-size` is `E_INPUT` in
  `extract-text` / `compare` (`--on-stream-error skip` restores the 1.5.0 answer); C3
  untagged shaped / RTL / `subs` text extracts as its source; C4 the inventory counts
  (36 / 32 modules / scripts, 13 diagnostics); C5 `invoice.xml` is LF.
- Byte-level changes inherited from pdfnative 1.9.0 (subsets, `/ActualText`, one text
  object per line, transparency groups, tagged-table semantics) — spec-valid output, not
  byte-identical to 1.5.0; one declared rebaseline.

## Out of scope (tracked in ROADMAP.md)

- Upstream: `metadata` keeping the PDF/X identification; reproducible signed output
  (per-revision `/ID`); PDF/X-1a / -3 / -4p; a Thai above-vowel + tone-mark pair extracting
  in geometric order from untagged output (`it.fails thToneBelow`); a `version` option on the
  synthetic ICC builders; `buildPDFBytes` validating `infoItems` — issue drafts under
  `.github/drafts/` (validated by `govern verify-issue`), submitted by the maintainer.
- Deferred: hyphenation dictionaries from the CLI (posture); visual sample regression and
  visual `compare` (no rasteriser); `optimize` / linearisation; category help commands; man
  pages; positional arguments in manifest tasks; a committed `manifest.json` snapshot and a
  JSON-LD / `llms-full.txt` variant (derivable from `schema manifest`); a performance budget.

## Human-in-the-loop — steps for the maintainer

1. Push `release/v1.6.0`, open this PR with this body. The first run exercises the Windows
   and macOS legs, `workflow lint`, CodeQL `actions`, `fuzz (code change)` and `node 26` for
   the first time: expect to iterate on a first red there (the ruleset is not imported yet,
   so a red leg does not block). `compat-previous` needs the `v1.5.0` tag on the remote
   (it is).
2. After the first green run, import `.github/rulesets/main.json` (seven required contexts:
   `ci (22)`, `ci (24)`, `windows`, `macos`, `compat-previous`, `workflow lint`,
   `sample-regression`; merge methods `merge` + `squash`) — CONTRIBUTING §Branch protection.
3. **Merge with a merge commit, not a squash**: the branch carries `9b661b1` (the LF
   normalisation) listed in `.git-blame-ignore-revs`; a squash would change the SHA to
   ignore. Title `release: v1.6.0 — right-to-left, 32 scripts, spot colours & the dual
   PDF/A + PDF/X claim`.
4. Tag `v1.6.0` on the merge commit, publish the GitHub Release (body =
   `release-notes/v1.6.0.md`); `publish.yml` refuses anything but that tag, re-runs the
   publish gate, publishes through Trusted Publishing and attests the registry bytes. Approve
   the `npm-publish` environment when asked.
5. Close Dependabot PR #21 (superseded); the other Dependabot PRs close themselves.
6. Submit the four upstream issue drafts under `.github/drafts/` to Nizoka/pdfnative, and
   the alignment PR on the engine side (`docs/data/surfaces.json`, `docs/assets/ecosystem.json`
   → pdfnative-cli 1.6.0; `docs/guides/cli.md`).
7. Optional, same session: register at https://www.bestpractices.dev (passing level — the
   project meets every criterion: README / CONTRIBUTING / MIT / CHANGELOG / semver tags;
   rulesets and release notes; SECURITY.md with private reporting; `npm run gate` with
   enforced coverage thresholds; the engine's crypto, input validation and the SSRF guard;
   Trusted Publishing with provenance; no medium+ vulnerability; CodeQL + ESLint;
   ClusterFuzzLite + the hostile-input suites) and add the badge to the README comment slot;
   set the GitHub topics (`pdfnative, cli, pdf, pdf-generation, json-to-pdf, pdf-a, pdf-x,
   pades, digital-signature, encryption, streaming, typescript, nodejs, zero-dependency,
   ai-agents, llms-txt, human-in-the-loop, unicode, right-to-left, reproducible-builds`);
   `git config blame.ignoreRevsFile .git-blame-ignore-revs` on each clone.

## Self-review checklist

- [x] Every count above was produced by a command on this branch, not typed from memory.
- [x] `release-notes/v1.6.0.md` and CHANGELOG §1.6.0 say the same things as this body.
- [x] `docs/assets/ecosystem.json` holds every figure quoted; `npm run verify:docs` is green.
- [x] No `Co-Authored-By` trailer and no "Generated with" footer anywhere on the branch.
- [ ] The independent audit ledger is attached above with every `fix` column filled
      (the maintainer's `/release-audit` run; the verification agent's table is above).
