# scripts/ — the quality gate, the sample corpus, the conformance corpus and the verifiers

Maintenance scripts run with `tsx` (no build step) and drive the **built** CLI
(`node dist/cli.cjs …`, never a globally installed binary) wherever a PDF is produced. The
npm aliases in `package.json` are the public names; call a script directly to pass flags
(PowerShell swallows a bare `--` after `npm run`). `scripts/tsconfig.json` extends
`../tsconfig.scripts.json` so an editor types these files as `typecheck:scripts` does.

## Quick start

```bash
npx tsx scripts/gate.ts --fast     # typecheck:all, lint, test, verify:docs — the loop while you work
npm run gate                       # the CI profile (default)
npm run build && npm run test:generate && npx tsx scripts/verify-samples.ts   # the sample baseline
```

## The scripts

| Script | npm alias | Gate step | Purpose | Flags | Exit codes |
|---|---|---|---|---|---|
| `gate.ts` | `gate`, `gate:fast` | — (it is the gate) | Runs the STEPS table in order, one line per step, logs under `test-output/.gate/<id>.log`; profiles `--fast` / `--ci` (default) / `--publish` | `--only <id>`, `--from <id>`, `--require-all` (a SKIP fails), `--json` | 0 green (or skipped with a reason), 1 a step failed / would have skipped under `--require-all`, 2 usage |
| `generate-samples.ts` | `test:generate` | `test:generate` | Renders every `samples/render/**/*.json` (plan: `lib/sample-plan.ts`), the Node driver samples and the derived outputs into `test-output/samples/`, under `TZ=UTC` with a pinned creation date | `--quiet`, `--verbose`, `--json`, `--category <name>` | 0 every sample written, 1 a CLI invocation failed (stderr reproduced), 2 `dist/cli.cjs` missing or bad usage |
| `verify-samples.ts` | `verify:samples` | `verify:samples` | Fingerprints the generated corpus (bytes, or semantic for encrypted / signed samples) and holds it to `tests/regression/baselines/samples.sha256.json`, a chained baseline (`since` per entry) | `--strict` (a new, unbaselined sample fails), `--update` (rewrite — only with a rebaseline declared in the release note), `--json` | 0 match, 1 a changed / removed (or, with `--strict`, new) sample, 2 usage or missing corpus |
| `generate-pdfa-corpus.ts` | `corpus:pdfa` | `corpus:pdfa` | Writes the 16-file PDF/A + PDF/X conformance corpus (`lib/pdfa-corpus.ts`) into `test-output/pdfa/` through the built CLI | `--quiet`, `--verbose`, `--json` | 0 written, 1 a CLI invocation failed, 2 `dist/cli.cjs` missing or bad usage |
| `validate-pdfa.ts` | `validate:pdfa` | `validate:pdfa` (publish) | Runs every PDF/A-claiming corpus file through veraPDF (`VERAPDF_HOME` or PATH; `JAVACMD` for the JDK) and compares with `expectCompliant`; negative canaries must be rejected (XPASS fails) | `--quiet`, `--verbose`, `--json`; env `VERAPDF_HOME`, `VERAPDF_REPORT_DIR`, `JAVACMD` | 0 every expectation met, 1 a FAIL or XPASS, 2 infrastructure (veraPDF missing — the gate SKIPs, `--require-all` fails) |
| `validate-pdfx.ts` | `validate:pdfx` | `validate:pdfx` | Runs pdfnative's structural `validatePdfX()` over the PDF/X files of the corpus and compares with `expectPdfXCompliant`; in-process, never skips | `--quiet`, `--verbose`, `--json` | 0 every expectation met, 1 a FAIL or XPASS, 2 usage or missing corpus |
| `verify-docs.ts` | `verify:docs` | `verify:docs` | 26 rules holding every count, version, flag, subject, error code, link, anchor, stamp and embedded copy in the docs to `docs/assets/ecosystem.json` and the source constants (`lib/cli-surface.ts`); `verify-docs:allow <rule>` opts a line out | `--online` (compare with the npm registry), `--strict` (with `--online`: docs behind npm is an error), `--json` | 0 no error, 1 an error (warnings such as `eol-lf` do not fail), 2 usage |
| `release-prepare.ts` | `release:prepare` | — | Applies a version bump in one pass: package manifests, `ecosystem.json` + "Verified on" stamps, CITATION.cff, the SECURITY.md table, the README banner, the knowledge-base footer, llms.txt, a release-note scaffold; prints every touched file | `<version>` positional, `--dry-run`, `--json` | 0 applied, 1 a target file is missing or malformed, 2 usage |
| `build-claude-rules.ts` | `agents:rules` | (`verify:docs` rule `claude-rules-sync`) | Projects `.github/instructions/*.instructions.md` into `.claude/rules/*.md` (scoped by `applyTo` → `paths:`), deleting orphans | `--check` (exit 1 on drift, no writes), `--json` | 0 in sync or generated, 1 drift / a source without `applyTo` |
| `install-git-hooks.mjs` | `hooks:install`, `hooks:uninstall` | — | Sets `core.hooksPath` to `.githooks/` (pre-commit: lint + CRLF guard; pre-push: the fast gate) for this clone only | `--uninstall` | 0 done, 1 git unavailable |

## Libraries (`lib/`), helpers and generators

| Module | Used by | What it holds |
|---|---|---|
| `lib/sample-plan.ts` | generate-samples, tests | Which sample documents are rendered with which flags, skips and passwords (pure) |
| `lib/sample-fingerprint.ts` | verify-samples, `tests/regression/samples.test.ts` | Bytes / semantic fingerprints, the baseline chain (`chainSince`), identical groups |
| `lib/pdfa-corpus.ts` | generate-pdfa-corpus, validators, verify-docs | The conformance corpus table (`derived.pdfaCorpus`, canaries) |
| `lib/pdfx.ts`, `lib/verapdf.ts` | validate-pdfx, validate-pdfa, gate (skip condition) | PDF/X verdict plumbing; veraPDF location, invocation and report parsing |
| `lib/cli-surface.ts` | verify-docs, tests | The command surface derived from `src/commands/completion.ts`, `schema.ts`, `error.ts` |
| `lib/markdown-anchors.ts` | verify-docs (`anchor-parity`) | GitHub heading slugs, the anchor inventory of a document, its fragment links |
| `lib/bundle-probe.ts` | gate (`bundle-check`) | What `dist/cli.cjs` must (external engine) and must not (markers, font data, PEM, `console.log`) contain |
| `lib/synthetic-gray-profile.ts` | generate-pdfa-corpus, tests; run directly to rewrite the two committed copies | The synthetic ICC Gray `prtr` profile (`tests/fixtures/synthetic-gray.icc`, `samples/render/print/synthetic-gray.icc`) and its never-committed v4 variant |
| `lib/agent-config.ts`, `lib/prose-language.ts` | verify-docs, tests | `.claude/settings.json` checks; the English-only prose detector |
| `helpers/cli.ts`, `helpers/io.ts`, `helpers/tz.ts` | every generator | Spawning the built CLI, shared I/O and the pinned instant, `TZ=UTC` |
| `generators/render.ts`, `generators/drivers.ts`, `generators/derived.ts` | generate-samples | The three sample families: JSON renders, Node driver samples, outputs derived through the other commands |

## Conventions

- Every script prints a one-line summary when stdout is not a terminal (CI, the gate, an
  agent) and a table under `--verbose`; `--json` is the machine-readable form.
- Exit 2 is always usage or infrastructure, never a content failure, so the gate can tell
  "the tool is missing" from "the check failed".
- Nothing here has a runtime dependency: `tsx` and `vitest` are dev tooling, the scripts
  import `pdfnative` only through `src/core-bridge/index.ts` or spawn the built CLI.
- Tests for the pure parts live in `tests/tools/` (`gate`, `verify-docs`, `sample-plan`,
  `pdfx`, `verapdf`, `markdown-anchors`, `bundle-probe`, `build-claude-rules`,
  `release-prepare`, `cli-surface`, `agent-config`).
