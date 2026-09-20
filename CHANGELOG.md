# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] – 2026-09-17

Built on **pdfnative 1.8.0**. Exposes every 1.8.0 engine feature — the typography engine,
CMYK colours and colour bars, PDF/X-4 output with a structural validator, five more scripts
(27 Unicode scripts in all) with `latin` aliases, custom fonts from disk, UTC and pinnable
creation dates — and delivers every roadmap item the engine unblocked: global flags before
the command, `annotate link`, `sign --timestamp-timeout`, a weak-digest note in `verify`,
`inspect --iso-dates`, richer `doctor` checks, three more SSRF-blocked ranges, a size cap on
`--layout`, table-variant font embedding and CHANGELOG compare links. The repository adopts
the engine's engineering: one quality gate, a byte-exact sample baseline, a PDF/A + PDF/X
conformance corpus, hardened CI with Trusted Publishing and attestations, a documentation
verifier, and a committed Claude Code layer. 21 commands, 19 schema subjects and 12 stable
error codes are unchanged; the global flag count grows to 10 (`--creation-date`). 100 %
backward-compatible command surface — every envelope field is additive.

### Added

#### `render`

- **Typography** — `layout.typography` (`widows`, `orphans`, `splitParagraphs`,
  `keepHeadingsWithNext`, `opticalMargins`, `punctuationSpacing: "fr" | "fr-CA" | rules[]`,
  `unitBinding`, `bindShortWords`, `hyphenationLanguage`, `kerning`, `fontFeatures`,
  `metrics`; soft hyphens U+00AD are honoured unconditionally),
  paragraph `align: "justify"`, block-level `keepWithNext` / `splittable`, plus the flags
  `--split-paragraphs`, `--keep-headings-with-next`, `--kerning` and
  `--font-features <tag,…>` (four-character OpenType tags, validated). Nested `typography`
  and `outputIntent` objects now merge one level deep between the document, `--layout` and
  the flags (`mergeNestedLayout`); previously the whole object was replaced.
- **CMYK colours** everywhere a colour is accepted (`"c m y k"` 0–1 or `[c,m,y,k]` percent),
  and `layout.print.marks.colourBars: true | { tints, size }`.
- **PDF/X-4** — `--pdfx pdfx4`, `--output-intent-icc <file.icc>` (16 MiB cap, `acsp`
  signature checked; merged into `layout.outputIntent`), `--output-intent-id <s>` (default:
  the profile's basename) and `--trapped true|false|unknown` (document and table variants).
  Pre-checks refuse `--pdfx` with `--tagged` / `--conformance` or any encryption flag
  (exit 2); every PDF/X and print coherence message the engine throws maps to `E_INPUT`
  (`src/utils/build-errors.ts`, fixture `tests/fixtures/pdfnative-build-errors.json`);
  `PDFX_NO_FONT_ENTRIES`, `PDFX_DEVICE_CMYK`, `PDFX_ANNOTATIONS` and
  `TYPOGRAPHY_FEATURE_INEFFECTIVE` join the `--strict` diagnostics (9 codes); the `--json`
  envelope carries `pdfx`.
- **27 Unicode scripts** — `--font` / `--lang` accept `lo` (Lao), `nod` (Tai Tham), `khb`
  (New Tai Lue), `tdd` (Tai Le) and `cjm` (Cham); `ha`, `yo`, `ig` and `sw` resolve to
  `latin` (`src/utils/fonts.ts`, 31 bundled font modules).
- **`--font-file <path.ttf>[:name]`** (repeatable) — register a TrueType/OpenType font from
  disk: path-traversal check, 32 MiB cap, magic bytes (`00 01 00 00`, `true`, `OTTO`;
  collections and WOFF refused), `parseFontData` + `validateFontData` (errors → `E_INPUT`,
  warnings → stderr), name from the file stem (`[a-z0-9-]`), added to `--lang`; a name
  colliding with the bundled allow-list is a usage error. Never loadable from a JSON payload.
- **`--variant table` embeds fonts** — `--lang` codes now feed `PdfParams.fontEntries`, so a
  table render can claim PDF/A (the former negative canary became a positive corpus entry).
- **Layout revival** — `--layout` files and inline `layout` objects revive `creationDate`
  (ISO string → `Date`) and `outputIntent.iccProfile` (`number[]` → bytes); `--layout` files
  share the 50 MB JSON cap.

#### Global flags and reproducible output

- **`--creation-date <iso8601>`** (10th global flag) — pins the creation instant of every PDF
  written in the run through `setDefaultCreationDate()` (process-wide, so `batch` tasks
  inherit it): `/CreationDate`, `xmp:CreateDate`, the `{date}` placeholder and the trailer
  `/ID` derive from it, in UTC. Falls back to `$SOURCE_DATE_EPOCH` (integer seconds); an
  invalid value is a usage error. The envelope carries `creationDate`. `sign --signing-time`
  and `metadata --mod-date` stay separate instants; encrypted output is never reproducible.
- **Global flags before the command** — `pdfnative --json --dry-run render …` works:
  `parseArgs` takes a boolean-flag table (`GLOBAL_BOOLEAN_FLAGS`) and `splitCommandArgv()`
  finds the command wherever the global flags sit.

#### `inspect`, `annotate`, `sign`, `verify`, `doctor`

- `inspect --pdfx` (PDF/X-4 validation report), `--check pdfx`, `pdfxConformance` (XMP
  `pdfxid:GTS_PDFXVersion`, always present), `--iso-dates` (PDF dates → ISO 8601 via
  `src/utils/pdfdate.ts`), `--summary` gains `pdfx`; the text report prints `PDF/X:` and
  `PDF/X check:` lines.
- `annotate` type **`link`** — `rect` + `url` (`validateURL`: `http`, `https`, `mailto`;
  `E_INPUT` otherwise), emitted as a `/Link` annotation with a `/URI` action; colours accept
  CMYK.
- `sign --timestamp-timeout <ms>` — bound on the TSA round-trip (positive integer; usage error
  without `--timestamp`), passed to `createTsaProvider` and reported as `timestamp.timeoutMs`.
- `verify` reports each timestamp's `timestampDigest`; a SHA-1 `messageImprint` adds the note
  `weak digest: RFC 3161 messageImprint uses SHA-1 (refused under --strict)` and fails the
  timestamp under `--strict` (`E_VERIFY_FAILED`).
- `doctor` checks `fonts` (`31 modules / 27 scripts`, each module probed on disk), `unicode`
  (`USE_UNICODE_VERSION`) and `conformance` (`pdfa1b,pdfa2b,pdfa2u,pdfa3b,pdfx4`).

#### Agent surface

- `schema`: `render` describes `layout.typography`, `layout.pdfx`, CMYK colours and
  `colourBars`; `inspect` requires `pdfxConformance` and pins `pdfx`; `inspect-summary`
  requires `pdfx`; `status` pins `pdfx`, `creationDate` and `timestamp.timeoutMs`; `annotate`
  gains the `link` type and `url`; `verify` gains `timestampDigest`. `SUBJECTS` is exported.
- `completion`: `--creation-date` in every shell; the new `render`, `inspect` and `sign` flags.
- `govern policy` now prints the full `.github/ai-governance.json` (1.1.0, `claude_code`
  block included) and `govern rules` prints `.github/AGENT_RULES.md` verbatim; both embedded
  copies are held identical by `verify:docs` (rule `governance-embed`).
- **`render --dry-run` pre-flights the real build**: the buffered builder runs in memory and
  the bytes are discarded, so every engine coherence error (`--pdfx` without an output
  intent, inline `layout.pdfx` + `tagged`, attachments without PDF/A-3, watermark
  transparency under PDF/A-1, print geometry) and every diagnostic — `--strict` escalation
  included — surfaces exactly as on a real run. The envelope stays additive
  (`dryRun: true`, no `bytes`, `diagnostics` when any).
- **`schema status` pins every field a command emits** (31 properties: the common ones plus
  the command-specific `variant`, `parts`, `sources`, `pages`, `mode`, `fields`, …), held by a
  parity test over every `emitStatus({…})` call.
- `inspect` emits `metadata.modDate` (additive; normalised by `--iso-dates`).
- `.pdfnativerc.json` per-command sections now apply to all 21 commands (they were silently
  dropped outside `render`, `sign`, `verify`, `inspect`, `batch`).
- `docs/AGENT_CONTRACT.md` — the consumer contract moved out of AGENTS.md (which now holds
  the repository rules for agents, under the 16 KiB Claude Code budget with `CLAUDE.md`).

#### Tooling, CI and repository hardening (ported from pdfnative 1.8.0)

- **`npm run gate`** (`scripts/gate.ts`) — one quality gate with `--fast`, CI (default) and
  `--publish` profiles, `--only <step>`, `--json`, `--require-all` (a skipped step fails);
  steps: typecheck:all, lint, test (fast) / build, dist-check, smoke (the built binary),
  bundle-size (`declared.bundleBudgetBytes`), bundle-check (the engine stays external; no
  font data, PEM block, `console.log` or undeclared require), test:generate, test:coverage
  (after the build and the samples, so the reproducible-build and sample-regression suites
  run on CI and fail loudly when their input is missing), verify:docs, verify:samples,
  corpus:pdfa, validate:pdfx, validate:pdfa.
- **Reproducible samples** — `scripts/generate-samples.ts` drives the BUILT CLI under
  `TZ=UTC` with the creation instant pinned twice (`--creation-date` and
  `SOURCE_DATE_EPOCH`); `samples/run-all.js` is removed (`npm run test:generate` replaces
  it, `PDFNATIVE_CLI` points it at a global install). `scripts/verify-samples.ts` holds the
  79 generated PDFs to `tests/regression/baselines/samples.sha256.json` — 69 byte-exact, 10
  semantic (encrypted: CSPRNG keys; signed: per-revision `/ID`) — as a chain with `since`
  per entry; `tests/regression/samples.test.ts` mirrors it.
- **Conformance corpus** — `scripts/generate-pdfa-corpus.ts` + `validate-pdfa.ts` +
  `validate-pdfx.ts` (TypeScript, shared cores in `scripts/lib/`): 16 files, 13 PDF/A
  (2 negative canaries) validated by veraPDF 1.30.2, 3 PDF/X-4 (1 negative canary) validated
  in-process; reproducible (fixture key pair, pinned dates, per-file SHA-256 in the manifest).
- **`npm run verify:docs`** (`scripts/verify-docs.ts`, 26 rules) over
  `docs/assets/ecosystem.json`: counts derived from the source constants (commands, subjects,
  codes, flags, corpus, fonts, samples, baseline), stale/version/count tokens, command / flag /
  schema / error parity, governance embed, dual-shell samples, Claude Code budgets, agent
  config, generated rules, PR template, EOL, skills, links, stamps, English-only prose.
- **`scripts/release-prepare.ts`** — one-pass version bump (manifests, ecosystem, stamps,
  CITATION, SECURITY table, README banner, KB footer, llms.txt, release-note scaffold).
- **Workflows** — `ci.yml` (Node 22/24 matrix, `npm audit`, the gate with `--require-all`),
  `publish.yml` (Trusted Publishing with npm 11.19.1, tag/version check, veraPDF composite
  action, publish gate, `npm sbom` + build attestations, release upload), `verapdf.yml`,
  `sample-regression.yml`, `dependency-review.yml`, `audit.yml`, `docs.yml` (offline on PR,
  weekly `--online --strict`), `codeql.yml`, `scorecard.yml` — all under harden-runner with
  SHA-pinned actions, `persist-credentials: false` and `npm ci --ignore-scripts`;
  `.github/actions/setup-verapdf` with the installer's SHA-256; `.github/rulesets/`
  (main: required checks `ci (22)`, `ci (24)`, `sample-regression`; tags: `v*` immutable).
- **Repository hygiene** — `.npmrc` (`ignore-scripts`, `audit-level=high`), `.nvmrc` /
  `.node-version` = 22, `.gitattributes` (`eol=lf`, binaries, generated files), opt-in git
  hooks (`npm run hooks:install`), `tsconfig.scripts.json`, vitest under `TZ=UTC` with
  `pool: 'forks'` and a JSON report for the gate, `.vscode/settings.json`.
- **Claude Code layer** — `CLAUDE.md` = `@AGENTS.md` + addendum, `.claude/settings.json`
  (Read deny list, HITL Bash denies, no attribution), `.claude/hooks/guard.mjs` (fail-closed
  PreToolUse hook refusing publish / push / tag / GitHub writes in every shell segment and
  interpreter payload; `tests/tools/guard.test.ts`), `.claude/rules/` generated from
  `.github/instructions/` (`npm run agents:rules`), the `/release-audit` skill,
  `.github/prompts/quality-gate.prompt.md` and `compliance-audit.prompt.md`,
  `.github/ai-governance.json` 1.1.0.
- **Release and draft templates** — `release-notes/PR_TEMPLATE.md` (the section source of the
  committed `release-notes/draft/PR-vX.Y.Z.md` bodies), `.github/drafts/TEMPLATE.md` (an issue
  draft that passes `pdfnative govern verify-issue`; other drafts are git-ignored),
  `scripts/README.md` (every script: purpose, flags, exit codes, gate step),
  `scripts/tsconfig.json`, CONTRIBUTING "First pull request in ten minutes" and
  "Branch protection"; `overrides.esbuild` pinned exactly.
- **Independent release audit** — two auditors (claims vs code; hardening parity with
  pdfnative 1.8.0 and the agent surfaces), an adversarial verifier and a final reviewer; the
  ledger is in `release-notes/draft/PR-v1.5.0.md`.
- **Samples** — typography (4), print (CMYK colours, colour bars, PDF/X-4 with a synthetic
  CMYK profile), multilang (Lao; Tai Tham / New Tai Lue / Tai Le / Cham; Hausa / Yoruba / Igbo /
  Swahili), font (the five 1.8.0 scripts, `--font-file`), reproducible (pinned date twice; the
  double-render script proves byte identity across timezones), `inspect --check pdfx` and
  `--iso-dates`, `doctor` capabilities, `annotate link`, `verify` weak digest,
  `sign --timestamp-timeout`, global flags first — each as a dual-shell pair.
- **Tests** — 1237 tests across 92 files (600 in 1.4.0): every feature above,
  the tools (gate, validators, fingerprints, sample plan, verify-docs, release-prepare, agent
  config, guard, workflows), the sample regression suite, an English-only prose scan, a
  reproducible-build integration test that spawns the built binary under two timezones, and a
  PDF/X round-trip (render → check → `annotate` breaks the claim → `metadata` drops the
  identification).

### Changed

- **Inherited from pdfnative 1.8.0** — every date is written in UTC (`+00'00'`) and the
  `{date}` placeholder follows the pinned creation date; tagged output carries `/ActualText`,
  so `extract-text` / `compare` return the source text where the typography engine inserted
  narrow no-break spaces or soft hyphens; TrueType subsets carry hinting tables. Every PDF
  the CLI writes therefore differs byte-wise from 1.4.0 output; the command surface, the
  envelopes and the exit codes do not.
- `schema render` / `schema annotate` descriptions widened for CMYK colours; the `--strict`
  usage text lists all 9 diagnostic codes.
- `ltv` and `doc-timestamp` inherit `--creation-date` for nothing (their instants are legal
  facts); `batch` tasks inherit it for every render.
- `AGENTS.md` restructured after pdfnative's (mission, gate, where-is-what, architecture,
  contract in brief, never touch, generated files, counts, releasing, governance, ecosystem);
  `.github/copilot-instructions.md` and the three instruction files refreshed (the Copilot file
  had said "eleven commands" and "Node ≥ 20" since 1.2.0).
- `docs/assets/ecosystem.json` is the single source of every count and version; `README`,
  `docs/KNOWLEDGE_BASE.md`, `llms.txt` and `docs/AGENT_CONTRACT.md` carry a `Verified on`
  stamp; `CONTRIBUTING.md` documents the gate, the corpus, the baseline policy and the release
  procedure; `.github/pull_request_template.md` mirrors its checklist.

### Fixed

- `pdfnative --json render …` (a global boolean flag placed before the command) no longer
  swallows the command name.
- `render --layout` no longer replaces a nested `typography` / `outputIntent` object supplied
  by the document when the file sets a sibling key.
- `tests/commands/render-enhancements.test.ts` used a 128-byte fake ICC profile that the
  1.8.0 engine rejects (no `acsp` signature); the suite now uses a real synthetic profile.
- `render` refuses an unknown `formField.fieldType` with `E_INPUT`, in a real run and under
  `--dry-run`. The engine does not validate the value, so `textarea` / `select` produced `NaN`
  field rectangles that `fill` then refused; the allowed values are `text`, `multilineText`,
  `checkbox`, `radio`, `dropdown`, `listbox`. Three samples used `textarea` and are corrected
  (`form/01-contact-form`, `form/02-survey`, `document/03-all-blocks` rebaselined before release).
- A command flag placed before the command (`pdfnative --strict render …`) no longer swallows
  the command name — `splitCommandArgv` recovers it from the known command names (only before
  the first positional, and the flag keeps its boolean reading: `--pretty schema status` prints
  the `status` schema; a typo is still reported as an unknown command). A `null` block is
  refused with `E_INPUT` instead of a `TypeError`. Arguments
  with no command exit 2 (`E_USAGE`); a bare `pdfnative` still prints the usage and exits 0.
- Docs and help aligned with the binary after the final review: `inspect --iso-dates` covers
  `metadata.modDate`; `fontFeatures` examples use `smcp` (no ligature feature is applied);
  the release-audit ledger lives under the git-ignored `.audit/` (readable by agents).

### Security

- SSRF guard: the benchmarking range `198.18.0.0/15`, TEST-NET-1 `192.0.2.0/24` and the NAT64
  prefix `64:ff9b::/96` (incl. their IPv4-mapped forms) are refused.
- `--layout` files are capped at 50 MB before parsing; ICC profiles at 16 MiB with the `acsp`
  signature checked; custom fonts at 32 MiB with magic-byte and parser validation; fonts and
  profiles are only ever loaded from command-line paths.
- **Hostile-input suite** (`tests/fuzz/`, seeded and deterministic, ported in spirit from the
  engine's `tests/fuzzing/`): argv and global-flag placement, page selectors,
  `.pdfnativerc.json`, batch manifests, layout JSON, mutated / truncated / xref-looping PDFs
  through `inspect` and `extract-text`, reproducible-date parsing and font sniffing — the only
  acceptable failure is a `CliError` with a stable `E_*` code. The hardenings it drove:
  `--template` deep-merge ignores `__proto__` / `constructor` / `prototype` keys and caps
  nesting (`E_INPUT` instead of a stack overflow), the config loader and the manifest parser
  refuse those keys, and an `iccProfile` array in layout JSON shares the 16 MiB cap.
- Gate step **`bundle-check`**: `dist/cli.cjs` must keep the engine external (`pdfnative`,
  `pdfnative/tools`, node builtins only) and carry no font data, PEM block, `console.log` or
  attribution trailer.
- `verify` surfaces SHA-1 timestamp imprints and refuses them under `--strict`.
- Supply chain: Trusted Publishing (OIDC, npm ≥ 11.5.1), SBOM + build attestations on the
  release, harden-runner on every job, SHA-pinned actions, `npm ci --ignore-scripts`, weekly
  `npm audit`, dependency review, committed rulesets, `git` hooks and a Claude Code guard hook.

### Documentation

- README: banner, highlights, feature table (v1.5.0 block), PDF/A & PDF/X status, quick start
  (typography / PDF/X-4 / reproducible), samples table (every category, agent scripts), command
  reference (render, sign, inspect, verify, doctor, annotate, global options), agent section,
  security section.
- `docs/KNOWLEDGE_BASE.md`: architecture tree, data flow, per-command reference for the 1.5.0
  surface, agent contract (envelope fields, error-code table), security model, API mapping,
  development quick reference (the gate), samples, FAQ; `Verified on` footer.
- `docs/AGENT_CONTRACT.md` (new), `llms.txt`, `SECURITY.md` (supported versions, input
  validation, SSRF ranges, reproducible builds, supply chain), `CONTRIBUTING.md`,
  `CITATION.cff`, `samples/README.md`, `tests/fixtures/README.md`, `ROADMAP.md` (v1.5.0 block;
  the remaining items are upstream-blocked or deferred by posture, incl. the new gaps:
  `metadata` drops the PDF/X identification, signed output carries a per-revision `/ID`,
  PDF/X-1a / -3 / -4p, PDF/A + PDF/X in one file, hyphenation dictionaries).

## [1.4.0] – 2026-08-26

Built on **pdfnative 1.7.0**. Completes the PAdES ladder promised on the roadmap — trusted
timestamps at signing time (B-T), long-term validation data (B-LT) and document timestamps
(B-LTA) — as `sign --timestamp` plus two new commands (`ltv`, `doc-timestamp`), and adds two
more (`metadata`, `compare`), multi-signature support, declarative `batch --manifest`
pipelines, print production, PDF/A strict diagnostics, charts v2, and CLI-resolvable image
blocks. 17 → **21 commands**, one new stable error code (`E_NETWORK`), four new `schema`
subjects. Network I/O remains strictly opt-in and SSRF-guarded. 100% backward-compatible
command surface; the support policy moves to Node.js ≥ 22 (see *Changed*).

### Added

#### New commands

- **`ltv`** — PAdES **B-LT** long-term validation: archive certificates, OCSP responses and
  CRLs into `/DSS` + `/VRI` via pdfnative 1.7.0 `collectValidationInfo` /
  `embedValidationInfo` / `addValidationInfo`. `ltv collect --online` fetches revocation data
  (SSRF-guarded, no redirects) and emits a **replayable JSON file** (schema subject
  `ltv-data`); `ltv embed --data` embeds it **fully offline** (air-gapped pipelines);
  `ltv add --online` does both in one pass. `--prefer ocsp|crl`, `--extra-cert` (repeatable),
  `--timeout`, `--dry-run`. Without `--online`, collect/add refuse to run (exit 2).
- **`doc-timestamp`** — PAdES **B-LTA** document timestamps: append a `/DocTimeStamp`
  signature field (`/SubFilter /ETSI.RFC3161`, ISO 32000-2 §12.8.5) covering every byte as an
  incremental revision via `addDocumentTimestamp`; earlier revisions stay byte-identical, and
  the command can be repeated to renew LTA protection. `--url <tsa>` (required — the explicit
  network opt-in), `--digest sha256|sha384|sha512`, `--field-name`, `--placeholder-bytes`,
  `--nonce`, `--timeout`, `--dry-run`.
- **`metadata`** — update `/Info` + XMP metadata (`title`, `author`, `subject`, `keywords`,
  `--mod-date`, or a `--from-json` object) via pdfnative 1.7.0 `PdfModifier.updateMetadata`.
  The save is **incremental**: the original bytes are preserved as a prefix, so existing
  digital signatures remain valid for their revision. `--password`, `--dry-run`.
- **`compare`** — diff two PDFs by extracted **text** and/or **structure** (page count,
  page/print boxes with `--tolerance`, metadata, form fields, annotations, encryption,
  signatures via `listSignatures`). Identical documents exit 0; any difference exits 1 with
  the stable code `E_CHECK_FAILED` after printing the report — built for CI gates and agents.
  `--mode text|structure|both`, `--format text|json` (schema subject `compare`),
  `--ignore-whitespace`, `--pages`, `--password-a`/`--password-b`. Visual/rasterised diffing
  stays out of scope (no rasteriser upstream).

#### `sign`

- **`--timestamp <tsa-url>` is now functional** (PAdES **B-T**) — the flag was reserved since
  v1.1.0 and errored with `E_UNSUPPORTED`, as its own message announced. The CLI builds the
  RFC 3161 request, POSTs it through the same SSRF guard as `verify --revocation online`, and
  pdfnative 1.7.0 `signPdfBytesWithTimestamp` verifies and embeds the token in the CMS
  unsigned attributes. `--timestamp-digest sha256|sha384|sha512`, `--timestamp-nonce <hex>`.
  TSA transport failures are `E_NETWORK`; malformed responses are `E_PARSE`; there is **no
  silent fallback** to an untimestamped signature, and `--dry-run` never touches the network.
  The `--json` envelope gains `timestamp: { url, digest }`.
- **Multiple signatures** — `--allow-multiple` (default off: the 1.x idempotent
  single-signature behaviour is preserved), `--field-name` for named signature fields.
- **`--profile pkcs7|pades`** (`pades` = `ETSI.CAdES.detached` with ESS
  signing-certificate-v2) and **`--digest sha256|sha384|sha512`** (RSA; ECDSA stays
  sha256-only).
- **Visible signature placement** — `--signature-rect "x1,y1,x2,y2"`, `--signature-page <n>`,
  and `--placeholder-bytes <n>` for oversized chains/tokens.

#### `verify`

- **SHA-384/512 CMS signatures verify** (`rsa-sha384` / `rsa-sha512` reported in
  `signatureAlgorithm`) — matching what `sign --digest` can now produce.
- **`/DocTimeStamp` revisions are validated** as RFC 3161 tokens (imprint check against the
  byte range) and reported with `isDocTimestamp: true`; each signature also reports its
  `fieldName`. Both fields are additive.

#### `inspect`

- **`--signatures`** — structural signature inventory via pdfnative 1.7.0 `listSignatures`:
  `fieldName`, `subFilter`, `byteRange`, `isDocTimestamp`, `isPlaceholder`, `sigObjNum`,
  `contentsLength` (never the signature bytes). Without the flag the output is unchanged.
- **Print-production reads** — `--pages` now reports `cropBox` / `trimBox` / `bleedBox` /
  `artBox` and `userUnit` when present; `metadata` gains `trapped`.
- **`--check "signatures>=N"`** — assert a minimum count of real (non-placeholder,
  non-timestamp) signatures. The existing `signed` check now counts on the same basis
  (unsigned placeholders and `/DocTimeStamp` revisions no longer count) — a correctness
  fix: a placeholder-only PDF passed `--check signed` in 1.3.0 and now fails.

#### `render`

- **`--strict`** — escalate PDF/A conformance diagnostics (`PDFA_NO_FONT_ENTRIES`,
  `PDFA_UNEMBEDDED_FORM_FONT`, `PDFA_DEVICE_CMYK_IMAGE`) into an error **before any output
  byte** (exit 1, `E_CHECK_FAILED`). Without it, diagnostics surface as `warning:` lines on
  stderr (suppressed by `--quiet`) and as an additive `diagnostics[]` array in the `--json`
  envelope.
- **Image blocks are now usable from JSON** — `{ "type": "image", "src": "logo.png" }` (path
  resolved against the input JSON's directory, same validation as `--attachment`) or
  `{ "dataBase64": "…" }` (inline JPEG/PNG); the CLI resolves both to bytes before rendering.
- **Print production** (pdfnative 1.7.0, via `--layout` JSON) — `print.bleed` /
  `trimBox` / `bleedBox` / `artBox` / `cropBox`, vector printer marks (`print.marks`),
  `userUnit` (1–75 000), and a custom RGB ICC `outputIntent`.
- **Viewer print preferences** — `viewerPreferences.duplex`, `pickTrayByPDFSize`,
  `printPageRange`, `numCopies`.
- **Charts v2** — 9 chart kinds (+`stackedBar`, `stackedBarH`, `area`, `scatter`), secondary
  Y axis (`series.yAxis: "right"` + `axis2`), `xAxis` with `category|linear|time` types,
  logarithmic scale, `dataLabels`, `labelStride`, `labelRotation`.
- **Document metadata** — `params.metadata` (`author`, `subject`, `keywords`,
  `trapped: True|False|Unknown`) → `/Info` + XMP.
- **`--chunk-size <n>`** for `--stream` / `--stream-true` (parity with the page-tree
  commands).

#### `annotate`

- **`--password`** (or `$PDFNATIVE_PASSWORD`) — annotate encrypted PDFs; appended objects are
  encrypted under the document's existing scheme.

#### `batch`

- **`--manifest tasks.json`** — declarative multi-command pipelines
  (`{ "version": 1, "tasks": [{ "id", "command", "flags" }] }`, schema subject
  `batch-manifest`): flag values `"@<id>"` reference the output of an earlier task, relative
  paths resolve against the manifest's directory, tasks run sequentially fail-fast
  (`--continue-on-error` to keep going), and the whole manifest is validated before anything
  executes (manifests are size-capped like every other JSON input, bounded to 1 000
  tasks, and path values get the same traversal check as direct CLI flags — a manifest
  has the filesystem access of its invoker, no more). 14 commands are whitelisted
  (never `batch`/`govern`/`schema`/`completion`/`doctor`; `ltv` and `compare` need
  positional arguments and are not manifest-callable yet). **`--allow-network` is
  required** for any network flag inside a manifest — a manifest obtained from
  elsewhere can never trigger network I/O on its own. `--dry-run` prints the plan.

#### Agent surface

- **New stable error code `E_NETWORK`** — an explicitly requested TSA / OCSP / CRL fetch
  failed. Published automatically in `schema manifest`.
- **Four new `schema` subjects** — `ltv-data`, `compare`, `batch-manifest`, `metadata`
  (15 → 19); the `render`, `inspect`, `verify`, `batch` and `status` schemas were
  extended with all the additive fields above.
- **Global `--max-inflate-size <bytes>`** — cap the decompressed size of any single PDF
  stream while parsing untrusted input (anti zip-bomb; default 100 MiB), via pdfnative's
  `setMaxInflateOutputSize`.

#### Tooling & tests

- **Offline mock PKI** (`tests/helpers/mock-pki.ts`) — a deterministic root CA + signer + TSA
  + OCSP responder issuing *genuine* RFC 3161 tokens, OCSP responses and CRLs entirely
  in-process, so the whole PAdES ladder is tested with **zero network** and zero binary
  fixtures. 600 tests total (up from 452).
- **veraPDF PDF/A validation gate** — the CLI's PDF/A claims are now validated against the
  [veraPDF](https://verapdf.org) reference validator. `npm run corpus:pdfa` drives the built
  CLI to generate a 12-file corpus (10 positive entries across 1b/2b/2u/3b — including an
  incremental PAdES signature and a `metadata` update over claiming files — plus 2 **negative
  canaries** veraPDF must reject: a no-fonts render violating ISO 19005-2 §6.2.11.4.1 and a
  `--variant table` render violating ISO 19005-1 §6.3.4, since that path cannot embed fonts
  from the CLI); `npm run validate:pdfa` checks each file against the profile it claims in XMP
  (exit 0 ok/skip · 1 conformance · 2 no corpus · 3 infra; an unexpected canary pass — XPASS —
  is fatal). Without veraPDF installed the run **skips with exit 0** (not a pass);
  `VERAPDF_REQUIRED=1` fails closed. **Blocking in CI** (`.github/workflows/verapdf.yml`,
  pinned veraPDF 1.30.2 installer with SHA-256 verification before `java -jar`) and repeated
  as a pre-publish gate in `publish.yml`. veraPDF is an external CI tool, never bundled — zero
  extra runtime dependencies unchanged.

### Changed

- **`pdfnative` bumped** to `^1.7.0` (was `^1.6.0`). Inherited engine improvements the CLI
  surfaces without code changes: **merge/split/extract now preserve BleedBox / TrimBox /
  ArtBox and `/UserUnit`** (previously stripped), corrected RTL shaping (UAX #9 L4 mirroring,
  Arabic ALEF joining), searchable text in form-bearing documents (full base-14 `/ToUnicode`),
  and colour-emoji flag/ZWJ sequences. Form-bearing and RTL documents therefore change bytes
  versus 1.3.0 output — outputs remain spec-valid; no CLI contract changes.
- **Support policy: Node.js ≥ 22** (was ≥ 20) and CI now tests Node 22 + 24. Node 20 reached
  end-of-life on 2026-04-30, and pdfnative 1.7.0 — the CLI's only runtime dependency —
  declares `engines.node >= 22`. This is a support-policy change, not an API change: the
  command surface, exit codes, error codes and envelopes are 100% backward-compatible.
- **PDF/A diagnostics routing** — pdfnative 1.7.0's conformance diagnostics (previously
  `console.warn` inside the engine) are now routed through the CLI: `warning:` lines on
  stderr, `diagnostics[]` under `--json`, or a hard error under `render --strict`.
- Dev-dependency security overrides refreshed (`js-yaml ^4.3.1`, `nanoid ^3.3.18`);
  `npm audit` clean.

### Fixed

- **`inspect` signature/form-field counters were always 0** — the legacy counters compared
  parsed PDF name objects against raw strings (`'/Sig'`, `'/Widget'`), which never matched,
  so `signatures` and per-page `formFields` under-reported on every signed PDF. Both now go
  through the parser's `nameValue`.
- **PDF/A samples now render actually-conformant outputs** — `samples/run-all.js` renders the
  `render/pdfa/` and `render/attachments/` samples with `--font latin --lang latin`, embedding
  the bundled Latin font. Previously those samples rendered without embedded fonts, so their
  outputs claimed PDF/A in XMP but violated the ISO 19005 font-embedding requirements
  (non-embedded base-14 Helvetica) and did not pass the reference validator. The blocking
  veraPDF CI gate now guards this recipe (see *Tooling & tests*).

### Documentation

- README, `docs/KNOWLEDGE_BASE.md`, `AGENTS.md`, `llms.txt`, `ROADMAP.md`, `samples/README.md`
  and `CITATION.cff` updated for the 21-command surface; `CITATION.cff` re-synchronised
  (was still 1.2.0 / "six composable commands").
- Corrected a false claim that `svg` blocks were not usable from JSON (`SvgBlock.data` is a
  string and has worked since pdfnative 1.5.0), and documented the previously missing `math`
  entry in `render --font`.
- New runnable samples: `sign/06-timestamp` (replaces `06-timestamp-reserved`), `sign/08-ltv`
  (the full PAdES ladder), `sign/09-multiple-signatures`, `inspect/08-list-signatures`,
  `metadata/01-update-metadata`, `compare/01-compare`, `batch/03-manifest`, plus print
  production and charts-v2 render JSONs — every pair ships as `.sh` **and** `.ps1`, all
  offline by default (network steps opt-in via `PDFNATIVE_TSA_URL`).

## [1.3.0] – 2026-07-24

Built on **pdfnative 1.6.0**. Surfaces the engine's 1.6.0 additions on the CLI as five new
commands (`extract-text`, `fill`, `encrypt`, `decrypt`, `doctor`), native vector charts in
`render`, and password / re-encryption / constant-memory streaming on the page-tree commands.
Adds `fill --export`, a unified `render` encryption vocabulary, an agent capability manifest
(`schema manifest` + `llms.txt`), PowerShell completion, and a `CLAUDE.md`. Fixes a silent
`render --encrypt` no-op. 100% backward-compatible.

### Added

#### New commands

- **`extract-text`** — extract reading-order Unicode text via pdfnative 1.6.0 `extractText`.
  `--format text|json|ndjson` (NDJSON = one object per page, ideal for RAG/agents), `--pages`
  (1-based selector), `--runs` (positioned runs), `--password` (encrypted PDFs), `--max-length`
  (memory cap), plus `--summary`/`--fields`. No OCR — image-only pages yield empty text.
- **`fill`** — fill, flatten, and/or **export** an existing AcroForm via `fillForm` /
  `flattenForm` / `readFormFields`, using an **incremental save** so an existing signature
  stays valid for its revision. `--data <values.json>` (name → string|boolean|string[]),
  `--flatten`, `--export` (emit current values as a `--data`-shaped map — read → edit → fill),
  `--force`, `--on-unknown throw|ignore`, `--need-appearances`, `--password`, `--dry-run`.
- **`doctor`** — offline environment / capability preflight: CLI / Node (≥ 20) / `pdfnative`
  versions, Web Crypto (CSPRNG) availability (required by `encrypt`), and the registered
  command count. `--format json|text`; exit 0 when all checks pass, 1 otherwise.
- **`encrypt`** — re-secure a PDF with AES-128/256 via page-tree re-encryption.
  `--owner-password` (required), `--user-password`, `--algorithm aes-128|aes-256`,
  `--permissions print,copy,modify,extract`, `--password` (open an encrypted source for
  password rotation). Requires a Web Crypto CSPRNG; RC4 is never emitted.
- **`decrypt`** — remove encryption, emitting a plaintext copy. `--password` (or
  `$PDFNATIVE_PASSWORD`). Both rebuild the page tree (like `merge`), so signatures and form
  fields are dropped.

#### `render`

- **Native vector charts** — the pdfnative 1.6.0 `chart` document block (bar, barH, line, pie,
  donut) renders as pure PDF path operators (zero dependencies, no rasterisation, tagged
  `/Figure` with alt text). Flows through `render` via document JSON / `--layout`.

#### `render`

- **Unified encryption flags** — `render` now accepts `--encrypt [aes-128|aes-256]` /
  `--owner-password` / `--user-password` / `--permissions` (the same vocabulary as
  merge/split/extract). The legacy `--encrypt-algorithm` / `--encrypt-owner-pass` /
  `--encrypt-user-pass` / `--encrypt-permissions` flags remain as aliases.

#### `merge` / `split` / `extract`

- **`--password`** — read encrypted source PDFs (pdfnative 1.6.0).
- **`--encrypt [aes-128|aes-256]`** with `--owner-password` / `--user-password` /
  `--permissions` — re-encrypt the rebuilt output.
- **`--stream`** (+ `--chunk-size`) — constant-memory streaming output via
  `streamMergedPdfs` / `streamSplitPdf` / `streamExtractPages`. `encrypt` and `decrypt`
  also gain `--stream` (via `streamExtractPages`).

#### `inspect`

- **`--form-fields`** — list AcroForm fields (name, type, value, required/read-only, options).
- **`--encryption`** — report the encryption scheme (algorithm, revision, opened-as).
- **`--password`** — open an encrypted PDF for inspection.

#### Agent surface

- **`schema manifest`** — a machine-readable capability manifest (commands, flags, global
  flags, stable error codes) for AI-agent tool discovery, plus new schema subjects
  `extract-text`, `fill`, and `status` (the success envelope).
- **`llms.txt`** — an LLM-facing capability manifest at the repo root (shipped in the package).
- **`E_PASSWORD`** — new stable error code for a missing/incorrect PDF password.

#### Tooling & docs

- **PowerShell completion** — `completion powershell` (Register-ArgumentCompleter).
- **`CLAUDE.md`** — Claude Code contributor guide.

### Changed

- **`pdfnative` bumped** to `^1.6.0` (was `^1.5.0`).
- Package `keywords` expanded (text extraction, forms, encryption, charts, RAG/LLM/MCP) and
  the `description` updated to reflect the new surface.
- **Grouped `--help`** — the global `pdfnative --help` now lists the 17 commands by category
  (Create & edit / Page tree / Security / Read & extract / Automation & meta) for
  discoverability. Display-only; dispatch is unchanged.

### Documentation

- Documented that **`merge` applies a single `--password` to every source** — merging encrypted
  sources with different passwords fails with `E_PASSWORD` (decrypt the outliers first). Added to
  `merge --help`, README, `docs/KNOWLEDGE_BASE.md`, and `AGENTS.md`.
- Full factual-coherence pass (command count = 17 with grouping, `E_PASSWORD` in every error-code
  list, `--max-output-size` default = 256 MiB, updated architecture map). Future ideas
  (`optimize`, `compare`, `batch --manifest`) recorded in ROADMAP with feasibility notes.

### Fixed

- **`render --encrypt` was a silent no-op** — `render`'s `--help` advertised
  `--encrypt aes-256 / --owner-password / --user-password / --permissions`, but the code only
  read `--encrypt-*` flags, so `render --encrypt aes-256 --owner-password X` produced an
  **unencrypted** PDF with no error. `render` now reads the unified flags (with `--encrypt-*`
  kept as aliases) and the help text matches the implementation (including the watermark flags:
  `--watermark-angle` / `-color` / `-font-size` / `-position`).
- **`schema` / `--version` in the published binary** — the version was resolved with a path
  (`../../package.json`) that does not exist relative to the flattened `dist/cli.cjs`, so
  every `schema <subject>` invocation on an installed CLI failed with
  `Cannot find module '../../package.json'`. Version resolution now goes through a robust,
  name-guarded `src/utils/version.ts` that works in both source and bundle.
- **Empty environment password overrode an explicit flag** — an exported but empty
  `PDFNATIVE_PASSWORD` / `PDFNATIVE_ENCRYPT_OWNER_PASS` / `_USER_PASS` used to win over
  `--password` / `--owner-password` / `--user-password` (via `??`). An empty env value is now
  treated as absent, so the flag is used.
- **`fill` error classification** — malformed `--data` content (wrong shape or wrong value
  type) now consistently raises `E_INPUT` at exit 1 (was a mix of exit 2 / `E_USAGE`).

## [1.2.0] – 2026-07-06

Built on **pdfnative 1.5.0**. Lands the engine's page-tree and annotation APIs on the CLI
as five new commands (`merge`, `split`, `extract`, `annotate`, `govern`), adds PDF
bookmarks, a math font, layout introspection, native constant-time signing, and surfaces
pdfnative's AI-governance / Human-in-the-Loop contract to agents. 100% backward-compatible.

### Added

#### New commands

- **`merge`** — concatenate several PDFs into one via pdfnative 1.5.0 `mergePdfs`. Sources
  as positional paths and/or repeatable `--input`; `--output`, `--drop-annotations`,
  `--max-output-size`, `--dry-run`.
- **`split`** — split one PDF into many via `splitPdf`. `--output-dir` (required), `--pages`
  (per-range) or one-per-page by default, `--prefix`, `--drop-annotations`,
  `--max-output-size`, `--dry-run`.
- **`extract`** — pull selected pages into a new PDF via `extractPages`. `--pages` (required,
  1-based; order preserved, repeats allowed), `--drop-annotations`, `--max-output-size`,
  `--dry-run`.
- **`annotate`** — attach markup annotations (highlight, text, underline, strikeout,
  squiggly, square, circle, line, freetext) via pdfnative 1.5.0 `createModifier` +
  `buildAnnotationBody`, using an **incremental save** so the original bytes and any
  existing signature stay intact. `--annotations <spec.json>` (JSON array or
  `{ annotations: [...] }`); only known fields are forwarded (no dictionary injection).
- **`govern`** — expose pdfnative's **AI-governance / Human-in-the-Loop (HITL)** contract:
  `govern rules` (protocol), `govern policy` (machine-readable JSON), and
  `govern verify-issue <draft.md>` to gate a draft before a human reviews and submits it
  (exit 1 / new `E_POLICY` code on violation). Pure, zero-dependency validator.

#### `render`

- **PDF bookmarks** — `--outline auto` derives a bookmark tree from the document's headings;
  `--outline <tree.json>` loads an explicit `OutlineItem[]` tree. The flag wins over any
  JSON-embedded outline.
- **Math / technical symbols** — `--font math` registers the bundled Noto Sans Math font;
  pdfnative auto-routes math-operator / geometric-shape code points to it.
- **Layout introspection** — `--inspect-layout` emits a `LayoutInspection` JSON report
  (per-page blocks, positions, sizes) instead of a PDF; `--debug-layout [margins,content,cells]`
  renders a normal PDF with layout guides overlaid.

#### `sign`

- **Native constant-time crypto by default** — CMS signing now routes through Node's
  `node:crypto` (`createNativeCryptoProvider`) for side-channel-resistant RSA/ECDSA. Pass
  **`--pure-crypto`** to force pdfnative's portable pure-JS bignum path.

#### `inspect`

- **`--annotations`** — list markup and link annotations per page.
- **Page labels** — the `/PageLabels` number tree is reported automatically when present.

#### Agent / governance

- **`E_POLICY`** stable error code for governance-gate failures.
- **`schema`** gains `annotate` (annotation-spec input) and `govern-verify`
  (`{ ok, errors, warnings }`) subjects.
- **`.github/ai-governance.json`**, **`.github/AGENT_RULES.md`**, and
  **`.github/drafts/README.md`** governance files, mirrored by the `govern` command.

#### Samples & docs

- New samples: `merge/`, `split/`, `extract/`, `annotate/`, `govern/`, `render/outline/`,
  `render/math/`, `render/inspect-layout/`, `sign/07-native-crypto.*`,
  `inspect/07-annotations.*` (Bash + PowerShell).
- README, AGENTS.md, KNOWLEDGE_BASE.md, SECURITY.md, and ROADMAP.md updated.

### Changed

- **`pdfnative` dependency** bumped to `^1.5.0`.
- **`package.json` keywords** enriched (AI governance, HITL, page-tree merge/split/extract,
  annotations, bookmarks, page labels, layout inspection, math symbols).

### Security

- **npm audit clean.** Added `js-yaml ^4.3.0` and `vite ^8.0.16` `overrides` to resolve two
  transitive dev-only advisories (0 vulnerabilities).
- `merge` / `split` / `extract` / `annotate` validate paths against traversal and cap output
  size; `annotate` re-keys only known annotation fields; `govern verify-issue` runs fully
  offline.

## [1.1.0] – 2026-06-30

Built on **pdfnative 1.3.0**. Surfaces the new engine capabilities through the CLI:
22 Unicode scripts, COLRv1 colour emoji, true constant-memory streaming, a configurable
document-block cap, and a read-only PDF/UA structural validator. 100% backward-compatible.

### Added

#### `render`

- **22 Unicode scripts + COLRv1 colour emoji.** The `--font` allow-list now covers every
  bundled pdfnative font: `latin`, `emoji`, `color-emoji`, and the 22 script codes
  (`ar hy bn ru hi am ka el he ja km ko my pl zh si ta te th bo tr vi`), including the six
  scripts new in pdfnative 1.3.0 (Telugu `te`, Sinhala `si`, Tibetan `bo`, Khmer `km`,
  Myanmar `my`, Amharic/Ethiopic `am`). Each shortcut name doubles as its `--lang` code;
  pdfnative routes each code point to the font whose cmap covers it.
- **`--stream-true`** — true constant-memory streaming via pdfnative 1.3.0
  `buildDocumentPDFStreamTrue` / `buildPDFStreamTrue`. PDF parts are emitted and freed as
  they go, so the joined binary never materialises. Byte-identical to the buffered builders.
  Same constraints as `--stream` (no TOC, no `{pages}`); mutually exclusive with the other
  `--stream*` flags.
- **`--max-blocks <n>`** — expose pdfnative 1.3.0 `layout.maxBlocks` (default 100 000) so
  very large multi-thousand-page reports no longer hit a spurious ceiling.

#### `inspect`

- **PDF/UA (ISO 14289-1) structural validation** via pdfnative 1.3.0 `validatePdfUA`.
  `--pdfua` adds a `{ valid, errors, warnings }` report to JSON/text output; `--check pdfua`
  turns it into a CI accessibility gate (exit 1 when the structural prerequisites fail).

#### Agent-native automation contract

- **Global `--json` envelope.** Any command run with `--json` emits a single
  machine-readable object on **stderr**: `{ ok: false, command, error: { code, message } }`
  on failure, and a `{ ok: true, … }` status line for `render` / `sign` / `batch` on
  success. stdout stays reserved for the primary artifact (PDF, report, schema, script).
- **Stable `E_*` error codes** on every `CliError` (`E_USAGE`, `E_INPUT`, `E_PARSE`,
  `E_IO`, `E_SIGN`, `E_VERIFY_FAILED`, `E_CHECK_FAILED`, `E_UNSUPPORTED`, `E_RUNTIME`),
  so autonomous callers branch on a failure class without parsing prose. Numeric exit
  codes (0/1/2) are unchanged.
- **`--dry-run`** for `render`, `sign`, and `batch` — fully validate inputs (and, for
  `sign`, parse credentials and prepare the PDF) without producing or writing output.
- **Token-economy output projection for agents** (`inspect` / `verify` / `batch`):
  stdout JSON is **compact by default under `--json`** (`--pretty` opts back into the
  human 2-space form), a new **`--summary`** flag emits a canonical minimal verdict
  (inspect `{ pages, encrypted, signatures, pdfa }`, verify `{ valid, signatures, invalid }`,
  batch `{ total, succeeded, failed }`), and **`--fields a,b.c`** projects the result to
  named dot-paths (array segments map over elements; unknown paths are omitted). Composable
  — typically ~90 % fewer output tokens with no loss of the fields agents branch on.
  Non-`--json` (human) output is unchanged. New `utils/projection.ts` (zero-dep).
- **`schema` command** — print a versioned JSON Schema (Draft 2020-12) for the
  `render` input, the `inspect` / `verify` / `batch` JSON output, or the new
  `inspect-summary` / `verify-summary` / `batch-summary` compact shapes, with a `$id`
  embedding the CLI version. `schema list` enumerates the subjects.
- **[AGENTS.md](AGENTS.md)** documents the full contract for AI agents and CI pipelines.

#### Supply chain

- **CycloneDX SBOM** (`sbom.cdx.json`) is generated in CI and attached to every GitHub
  release; an **OpenSSF Scorecard** badge is published in the README. No new runtime
  dependencies — the SBOM generator runs build-time only.

### Changed

- **`pdfnative` bumped** to `^1.3.0` (was `^1.2.0`).
- **npm keywords** expanded for discoverability (`pdf-ua`, `accessibility`, `colr`,
  `color-emoji`, `unicode`, `text-shaping`, `opentype`, `bidi`, `streaming`, `ai-agent`,
  `agentic`, `automation`, `json-output`, `json-schema`, and the new script names).

## [1.0.0] – 2026-06-30

First stable release. **Verify-side Long-Term Validation (LTV)** lands in full, the
last two upstream workarounds are removed (now fixed in pdfnative 1.2.0), and the CLI
gains config-file, batch, completion and global-flag ergonomics.

### Added

#### `verify` command — Long-Term Validation (LTV)

- **RFC 3161 timestamp validation (PAdES-T)** — the signature-timestamp-token unsigned
  attribute is now cryptographically validated: the TSA SignerInfo signature, the eContent
  (TSTInfo) `messageDigest`, and the `messageImprint` binding to the document signature are
  all checked, and the TSA certificate chain is built and trust-evaluated. Reported as
  `timestampValid`, `timestampTime` (`genTime`) and `tsaSubject`. Replaces the
  presence-only `timestampPresent` flag from 0.3.0 (still reported for back-compat).
- **OCSP (RFC 6960) revocation** — parses OCSP responses embedded in the PDF `/DSS`
  (PAdES-LT) and, with `--revocation online`, fetches from the certificate's AIA OCSP URL.
  Verifies the responder signature and matches the CertID before reading the status.
- **CRL (RFC 5280) revocation** — parses CRLs embedded in `/DSS` and, online, fetches from
  the CRL Distribution Point. Verifies the CRL signature against the issuer before checking
  the signer serial.
- **`--revocation offline|online|disabled`** (default `offline`) and
  **`--revocation-policy soft-fail|strict`** (default `soft-fail`). New report fields:
  `revocationChecked`, `revocationStatus`, `revocationSource`, `revocationMethod`,
  `revocationRevokedAt`.
- **SSRF-guarded online fetching** — opt-in online OCSP/CRL requests pass a guard enforcing
  an http(s) scheme allow-list, DNS resolution with private/loopback/link-local/CGNAT/
  multicast (IPv4 + IPv6) blocking, no redirect following, a 10 s timeout and a 5 MiB cap.

#### `render` command — pdfnative 1.2.0 features

- **Smart tables** — `--table-wrap auto|always|never`, `--repeat-header`, `--zebra`,
  `--min-row-height`, `--cell-padding` fill any `TableBlock` fields left unset in JSON
  (block-level JSON wins). Also available through `--layout`.
- **Page-by-page streaming** — `--stream-page-by-page` streams at PDF object boundaries
  after assembling the document, so TOC blocks and `{pages}` placeholders are supported
  (unlike single-pass `--stream`).
- **PDF/A targets** are now sourced from pdfnative's `PDF_A_CONFORMANCE_TARGETS` constant.

#### New commands & CLI ergonomics

- **`batch`** — render every `*.json` file in a directory to PDF in parallel, reusing the
  full `render` pipeline. `--input-dir`, `--output-dir`, `--concurrency`, `--fail-fast`,
  text/JSON summary; exit 1 if any file fails.
- **`completion bash|zsh|fish`** — emit a shell-completion script.
- **`.pdfnativerc.json`** config file — discovered cwd-upward, with global and per-command
  sections; `--config <file>` / `--no-config`. Precedence: CLI flags > env > config.
- **Global flags** — `--quiet`/`-q`, `--no-color` (+ `NO_COLOR`), and `--version --json`.

#### `sign` command

- **`--timestamp <tsa-url>`** flag reserved for PAdES-T timestamping. Embedding a timestamp
  token at signing time requires upstream pdfnative support; the flag validates the URL and
  errors clearly today. Timestamp *validation* already works via `verify`.

### Changed

- **`pdfnative` bumped to `^1.2.0`** (was `^1.1.0`).
- Removed the two upstream workarounds — `cert-fix` (issuer/subject DN re-slicing) and the
  local signature-placeholder injector — now fixed in pdfnative 1.2.0. `sign` uses
  `addSignaturePlaceholder` and `verify`/`keys` use the corrected `parseCertificate`
  directly.

### Removed

- `src/utils/cert-fix.ts` and `src/utils/sign-placeholder.ts` (and their tests).

### Security

- Documented the single, intentional SHA-1 usage — the OCSP `CertID` (RFC 6960 §B.1
  default, a non-security identifier over public certificate fields). Annotated the call
  sites and added a *Cryptographic algorithm usage* section to [SECURITY.md](./SECURITY.md);
  the corresponding CodeQL `js/weak-cryptographic-algorithm` alert is a reviewed false
  positive.
- Upgraded the test toolchain (`vitest` / `@vitest/coverage-v8` 2 → 4) to clear all known
  dev-dependency advisories (`npm audit` → 0 vulnerabilities). Coverage thresholds were
  re-baselined to vitest 4's AST-aware measurement (identical tests and code).
- Bumped pinned GitHub Actions: `github/codeql-action` 4.35.1 → 4.36.0,
  `actions/setup-node` 6.3.0 → 6.4.0, `actions/upload-artifact` 4.6.2 → 7.0.1,
  `ossf/scorecard-action` 2.4.2 → 2.4.3; `typescript-eslint` 8.57.2 → 8.59.2.

## [0.3.0] – 2026-05-05

### Added

#### `sign` command — full end-to-end signing pipeline

- **ECDSA-SHA256 signatures** — `--algorithm ecdsa-sha256` is now fully wired
  (was a stub in 0.2.0). Loads SEC1 / PKCS#8 P-256 keys via pdfnative's
  `parseEcPrivateKey`. RSA remains the default.
- **Automatic signature placeholder injection** — `pdfnative render` does not
  emit AcroForm fields, so signing a freshly-rendered PDF used to fail with
  "no /Contents placeholder". `sign` now detects the missing placeholder and
  performs a single incremental update adding `/Sig`, the signature widget,
  and `AcroForm /SigFlags 3` — fully transparent and idempotent for PDFs that
  already carry a placeholder.
- **`ensureCryptoReady()`** — pdfnative's async ASN.1 module is now booted on
  the first sign / verify invocation; previously surfaced as a confusing
  "ASN.1 module must be imported" error.

#### `verify` command — full CMS / PKCS#7 cryptographic verification

- **CMS signature value verification** — RSA-SHA256 and ECDSA-SHA256
  signatures embedded in the PDF are now cryptographically verified against
  the leaf certificate's public key, not just the byte-range digest.
  Reported as `signatureValid` and `signatureAlgorithm`.
- **RFC 3161 timestamp recognition** — presence of an unsigned-attribute
  timestamp token is reported as `timestampPresent`. Full token validation
  (TSA chain, MD comparison) remains tracked for v0.4.0.
- **Robust ASN.1 walker** — replaces calls into `pdfnative.derDecode` whose
  `offset` field is relative below depth 1. The new walker (and the cert-DN
  re-slicing workaround) guarantee correct `issuerAndSerialNumber` extraction
  and `isSelfSigned` evaluation for every embedded certificate.

#### `render` command — iteration & template ergonomics

- **`--watch`** — re-render on input file change (200 ms debounce, stderr-only
  logs, requires `--input <file>` and a file `--output`). Clean shutdown on
  `SIGINT` / `SIGTERM`.
- **`--template <file.json>`** — deep-merge a base template under stdin /
  `--input`. Plain objects merge recursively; arrays and primitives are
  replaced (caller wins).
- **`--font <name>`** — register a bundled pdfnative font shortcut.
  Repeatable; allow-list of `latin` (Noto Sans VF) and `emoji` (Noto Emoji).
  After registration the name is usable through `--lang`. No path-based
  surface — the name resolves to a sealed mapping.

### Changed

- Bumped `pdfnative` peer / runtime dependency from `^1.0.0` to `^1.1.0`.
- Help text for `sign` now lists `ecdsa-sha256` as a fully supported value.
- Help text for `verify` enumerates the new `signatureValid`,
  `signatureAlgorithm`, and `timestampPresent` report fields.

### Fixed

- Verify path no longer consumes pdfnative's broken `cert.issuer.raw` /
  `cert.subject.raw` slices — both are recomputed from
  `tbsCertificateBytes`. Restores correct chain building and self-signed
  detection for every cert (including those embedded in CMS).

## [0.2.0] – 2026-04-28

### Added

#### `render` command — full pdfnative layout coverage

- **Hybrid layout model** — high-frequency knobs as CLI flags, full `PdfLayoutOptions` surface
  via `--layout <file.json>`. Precedence: CLI flags > layout file > pdfnative defaults
  (mirrors `gh` / `kubectl` / `docker`).
- **`--variant document|table`** — selects the renderer: `buildDocumentPDFBytes` (default,
  unchanged behaviour) or `buildPDFBytes` (table-centric `PdfParams` shape).
- **`--page-size`** — named (`a4`, `letter`, `legal`, `a3`, `tabloid`, `a5`) or `WxH` in points.
- **`--margin <N>`** or `--margin <top,right,bottom,left>`.
- **`--compress`** — boolean; calls `initNodeCompression()` once per process when needed.
- **`--tagged <none|pdfa1b|pdfa2b|pdfa2u|pdfa3b>`** — unified PDF/A flag, replaces
  `--conformance` (which is now deprecated, see below).
- **Watermarks** — `--watermark-text`, `--watermark-opacity`, `--watermark-angle`,
  `--watermark-color`, `--watermark-font-size`, `--watermark-image <path>`,
  `--watermark-position background|foreground`.
- **Headers / footers** — `--header-left`, `--header-center`, `--header-right`,
  `--footer-left`, `--footer-center`, `--footer-right`. Placeholders: `{page}`, `{pages}`,
  `{date}`, `{title}`. `{pages}` rejected with `--stream` (multi-pass pagination required).
- **Encryption** — `--encrypt-owner-pass`, `--encrypt-user-pass`, `--encrypt-algorithm
  aes128|aes256` (default `aes128`), `--encrypt-permissions print,copy,modify,extractText`.
  Owner / user passwords also read from `PDFNATIVE_ENCRYPT_OWNER_PASS` /
  `PDFNATIVE_ENCRYPT_USER_PASS` (env takes precedence over flags). Mutually exclusive with
  `--tagged pdfa*` per ISO 19005 — rejected with exit 2.
- **PDF/A-3 attachments** — `--attachment <path>[:mime[:relationship[:description]]]`,
  repeatable. Binary payloads are loaded from disk; the `--layout` file's
  `attachments[].data` field is sanitised away on load (no path / data injection).
- **`--lang <code,code>`** — activates a programmatically registered font loader for
  non-Latin scripts via `loadFontData(code)` (e.g. `--lang th,ja`). Requires calling
  `registerFontLoader(lang, loader)` in a wrapper before rendering. Throws a clear error
  when no loader is registered for the requested language code.
- **`--layout <file.json>`** — load any subset of `PdfLayoutOptions`. Path-traversal
  validated; JSON shape enforced; binary attachment payloads stripped on load.

#### `sign` command — signing metadata + cert chains

- **`--algorithm rsa-sha256|ecdsa-sha256`** — default `rsa-sha256`. ECDSA path is
  recognised but currently throws a clear stub error; tracked for v0.3.0 once
  pdfnative exposes `parseEcPrivateKey`.
- **`--reason`, `--name`, `--location`, `--contact`** — `PdfSignOptions` metadata fields
  surfaced on the CLI.
- **`--signing-time <ISO 8601>`** — explicit timestamp; validated up-front (exit 2 on
  malformed input, before any credential I/O).
- **`--cert-chain <path>`** — repeatable; intermediate-CA PEMs concatenated into
  `certChain[]`. Also readable from `PDFNATIVE_SIGN_CHAIN` env var (concatenated PEM).

#### `inspect` command — deeper analysis + assertions

- **`--verbose`** — adds `verbose.{trailerKeys, catalogKeys, objectCount, xmpMetadata}`.
  Sanitised: no raw stream bytes.
- **`--pages`** — adds `pages: [{ index, width, height, rotation, annotations, formFields }]`.
- **`--check pdfa|signed|encrypted`** — repeatable; ANDed. Sets exit code (0 = pass, 1 =
  fail) while still emitting the regular report. Composable with `--format json|text`.

#### `verify` command (NEW)

- **`pdfnative verify`** — verify CMS/PKCS#7 signatures embedded in a PDF.
  Flags: `--input <path|stdin>`, `--format json|text` (default `json`),
  `--strict` (exit 1 on any failure or zero signatures), `--trust <root.pem>` (repeatable).
- **Scope (v0.2.0):** byte-range integrity (SHA-256), certificate chain signatures
  (via pdfnative `verifyCertSignature`), trust evaluation against `--trust` roots and
  self-signed acceptance.
- **Out of scope (deferred to v0.3.0+):** full CMS signature-value verification, OCSP /
  CRL revocation, RFC 3161 timestamp tokens, Long-Term Validation (LTV).

#### Utilities & infrastructure

- **`src/utils/layout.ts`** — central layout composer (CLI flags + layout file).
- **`src/utils/keys.ts`** — PEM / PEM-chain loader with constant-time secret redaction
  guarantee in error paths (no PEM body ever leaks into stderr).
- **`src/utils/args.ts`** — `getStringFlagAll(flags, name)` for repeatable flags
  (`--cert-chain`, `--attachment`, `--trust`, `--check`).
- **`src/utils/io.ts`** — `readBinaryFile()` for image / attachment loading; reuses
  `validatePath` for traversal protection.
- **`src/utils/error.ts`** — `deprecate(name, replacement)` helper for stderr deprecation
  notices.

#### Samples (v0.2.0 categories)

- `samples/render/encryption/` — AES-128 password protection demo.
- `samples/render/headers-footers/` — page templates with `{page}/{pages}/{date}/{title}`.
- `samples/render/attachments/` — PDF/A-3 hybrid invoice with embedded XML
  (Factur-X / ZUGFeRD pattern).
- `samples/render/multilang/` — Thai and Japanese rendering via `--lang`.
- `samples/render/table-variant/` — `PdfParams`-shaped financial ledger.
- `samples/sign/02-with-metadata.{sh,ps1}` — signature with reason / name / location /
  contact / signing-time.
- `samples/inspect/03-verbose-pages.{sh,ps1}` — `--verbose --pages` report.
- `samples/inspect/04-check-pdfa.{sh,ps1}` — assertion-style `--check pdfa`.
- `samples/verify/01-self-signed.{sh,ps1}`, `samples/verify/02-strict-mode.{sh,ps1}`.
- `samples/run-all.js` updated with per-category flag dispatch (encryption, attachments,
  headers-footers, multilang, table-variant).

### Changed

- **`pdfnative` dependency** bumped from `^1.0.4` to `^1.0.5`.
- **Test surface** grown from 47 to **123** tests across 8 files; coverage gates
  recalibrated to 75 % statements / 80 % branches / 85 % functions / 75 % lines, measured
  at 82.62 / 82.18 / 92.72 / 82.62. `src/commands/verify.ts` and `src/index.ts` are
  excluded from coverage with explicit rationale (see `vitest.config.ts`); fixture for
  signed-PDF round-tripping is tracked for v0.3.0.
- **`samples/README.md`** restructured with new v0.2.0 categories.

### Fixed

- **Windows path regression in `--attachment`** — `loadAttachmentsFromFlags` now detects
  Windows drive-letter colons (e.g. `D:\\path`) and no longer splits the flag value at the
  drive colon, preventing `ENOENT D\` errors on Windows.
- **`params.layout` silently dropped in render** — when the JSON input contained a
  `layout` object (e.g. a watermark) and the CLI also built a layout object (even an empty
  `{}`), the JSON-embedded layout was overwritten. Fixed by explicitly merging
  `params.layout` (base) with CLI-derived flags (override) via `{ ...params.layout, ...layout }`.
- **Multilang samples required unbundled fonts** — `samples/render/multilang/` JSONs tried
  to render Thai/Japanese glyphs, but `hasFontLoader` checks an in-memory registry that
  is empty in the CLI process. Samples replaced with Latin-only font-loader registration
  guides; `run-all.js` no longer passes `--lang th/ja`.
- **Attachment sample used wrong row format** — `samples/render/attachments/01-pdfa3-with-xml.json`
  table rows were plain arrays (`["cell1", "cell2"]`) instead of `PdfRow` objects
  (`{ "cells": [...], "type": "normal", "pointed": false }`). Sample corrected.

### Changed

- **`--lang <code,code>`** — clarified: activates a *programmatically registered* font
  loader (via `registerFontLoader(lang, loader)` in a wrapper script). Latin is built-in;
  non-Latin scripts require a caller-supplied TTF loader. The previous wording
  ("bundled Noto fonts") was inaccurate — pdfnative uses a lazy loader registry, not a
  pre-bundled font set.

### Deprecated

- **`--conformance <1b|2b|3b>`** — superseded by `--tagged <pdfa1b|pdfa2b|pdfa3b>`.
  Still works; emits a one-line stderr deprecation notice. Will be removed in **v1.0.0**.

### Security

- **Encryption passwords** — `--encrypt-owner-pass` / `--encrypt-user-pass` honoured but
  recommended path is the `PDFNATIVE_ENCRYPT_OWNER_PASS` / `PDFNATIVE_ENCRYPT_USER_PASS`
  env vars. Passwords are never logged; absence of `--encrypt-owner-pass` and presence of
  any other `--encrypt-*` flag is a hard usage error (exit 2).
- **PEM redaction** — `loadPem` / `loadPemChain` surface only generic error messages on
  parse failure; raw key material never appears in CliError messages or stderr.
- **Path traversal** — `--layout`, `--attachment`, `--watermark-image`, `--key`,
  `--cert`, `--cert-chain`, `--trust` and all `--input` / `--output` arguments validated
  against directory traversal before filesystem access.
- **Layout-file injection** — `attachments[].data` fields in `--layout` JSON are stripped
  on load; binary attachment payloads must come from `--attachment <path>`.

### Backward compatibility

- Every v0.1.0 invocation continues to produce a byte-equivalent PDF (modulo a one-line
  stderr deprecation notice for `--conformance`). All v0.1.0 exit codes and JSON shapes
  preserved; new `inspect` JSON fields are additive only.

## [0.1.0] – 2026-04-27

### Added

- **`render` command** — render a `DocumentParams` JSON file or stdin stream to a PDF using `pdfnative`.
  Supports `--stream` (AsyncGenerator streaming) and `--conformance` (PDF/A 1b/2b/3b) flags.
- **`sign` command** — apply a CMS/PKCS#7 digital signature to an existing PDF.
  Private key and certificate loaded from `PDFNATIVE_SIGN_KEY`/`PDFNATIVE_SIGN_CERT` environment
  variables (recommended) or `--key`/`--cert` file paths. Keys are never logged.
- **`inspect` command** — analyse a PDF and output version, page count, encryption status,
  PDF/A conformance level, signature count, and metadata. Supports `--format json|text`.
- **Zero-dep arg parser** (`src/utils/args.ts`) — handles `--flag value`, `--flag=value`,
  `-f value`, boolean flags, and `--` pass-through. No third-party parser dependency.
- **`--help`/`-h`** and **`--version`/`-V`** global flags.
- **Path traversal validation** — all file path arguments validated before filesystem access.
- **50 MB JSON input cap** — enforced before `JSON.parse` to prevent memory exhaustion.
- **NPM provenance** — builds signed via GitHub Actions OIDC (SLSA Level 2+).
- **CI** — Node.js matrix [20, 22], CodeQL SAST, OpenSSF Scorecard, Dependabot.
- **`docs/KNOWLEDGE_BASE.md`** — structured knowledge base for AI assistants.
- **Comprehensive samples** — 23 new sample files covering every CLI feature, organized in
  categorized subdirectories matching the `pdfnative` test-output structure:
  - `render/document/` — 5 documents (minimal, report, all-blocks reference, invoice, technical spec)
  - `render/table/` — 2 table-focused layouts (project status, financial summary)
  - `render/barcode/` — 3 barcode types (QR code, Code 128, EAN-13)
  - `render/form/` — 2 interactive form samples (contact form, survey)
  - `render/toc/` — table of contents sample
  - `render/link/` — hyperlink sample
  - `render/watermark/` — 2 watermark samples (draft, confidential)
  - `render/layout/` — 3 page size/orientation samples (US Letter, A5 portrait, A4 landscape)
  - `render/pdfa/` — 3 PDF/A conformance samples (PDF/A-1b, PDF/A-2b, PDF/A-3b)
  - `sign/01-basic.sh` + `sign/01-basic.ps1` — cross-platform digital signature walkthrough
  - `inspect/01-json.sh` + `inspect/01-json.ps1` — JSON metadata extraction scripts
  - `inspect/02-text.sh` + `inspect/02-text.ps1` — human-readable inspection scripts
  - `streaming/01-large-document.js` — 200-section streaming render demo
  - `run-all.js` — cross-platform Node.js batch runner with `--category` and `--clean` flags
- **`samples/output/`** added to `.gitignore`; generated PDFs never committed.

### Changed

- `samples/` organized in categorized subdirectories (document, table, barcode, form, toc, link, watermark, layout, pdfa).
- Root `README.md` Examples section updated to reflect new categorized sample layout.
- `docs/KNOWLEDGE_BASE.md` updated with complete block type reference table (all 10 block
  types: heading, paragraph, table, list, barcode, link, toc, formField, spacer, pageBreak).

[Unreleased]: https://github.com/Nizoka/pdfnative-cli/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/Nizoka/pdfnative-cli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Nizoka/pdfnative-cli/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Nizoka/pdfnative-cli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Nizoka/pdfnative-cli/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Nizoka/pdfnative-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Nizoka/pdfnative-cli/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/Nizoka/pdfnative-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Nizoka/pdfnative-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Nizoka/pdfnative-cli/releases/tag/v0.1.0
