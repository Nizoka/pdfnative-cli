---
paths:
  - "tests/**"
  - "vitest.config.ts"
  - "scripts/generators/**"
  - "scripts/lib/sample-plan.ts"
  - "scripts/lib/sample-fingerprint.ts"
---
<!-- GENERATED from .github/instructions/testing.instructions.md by scripts/build-claude-rules.ts — do not edit -->

# Testing

## Framework and suites

- **vitest** (native ESM). Run one file: `npx vitest run tests/<path>.test.ts`; the whole suite
  through the gate (`npx tsx scripts/gate.ts --fast`); coverage: `npm run test:coverage`.
- Suites mirror the tree: `tests/commands/` (one file per command, plus feature files such as
  `render-pdfx`, `render-typography`, `inspect-pdfx`), `tests/utils/`, `tests/integration/`
  (round-trips; the reproducible-build suite spawns the BUILT binary and is `describe.runIf`
  on `dist/cli.cjs`), `tests/tools/` (gate, validators, verify-docs, markdown-anchors,
  bundle-probe, release-prepare, guard, workflows), `tests/regression/` (the sample baseline,
  `runIf` on `test-output/samples/`), `tests/fuzz/` (hostile input over `tests/helpers/fuzz.ts`:
  seeded PRNG, "only a CliError with a stable code" invariant, PDF byte builders past the engine
  limits), `tests/docs/` (English-only prose scan). The two `runIf` suites skip in a plain
  local run only: the gate's ci / publish profiles build and generate the samples first and
  set `GATE_REQUIRE_ARTIFACTS=1`, under which a missing input fails the file instead of
  skipping it.
- `vitest.config.ts` pins `TZ=UTC`, `pool: 'forks'`, no shuffle, the dot reporter locally and
  a JSON report under `test-output/.gate/` when `GATE=1`.

## The engine surface

- `tests/regression/engine-surface.json` maps every bullet of the pinned engine's changelog entry
  to named tests and baseline samples, or to a motivated waiver; `engine-surface.test.ts` holds
  every reference to the tree and fails when the `pdfnative` pin moves without it
  (CONTRIBUTING.md §Bumping the engine pin). Renaming a test that the matrix names means
  updating the matrix.
- "Named" is never enough: a diagnostic code gets an entry in
  `tests/helpers/diagnostic-triggers.ts` (executed by `render-diagnostics.test.ts`), a script
  code a string in `tests/helpers/script-text.ts` (from the engine's vetted language documents),
  a `TypographyOptions` key a sample that sets it — and ONE observable assertion of its own
  (extracted text, the `--inspect-layout` page map, an operator position), never a shared
  "the bytes differ".
- A known engine limit is pinned with `it.fails` next to the passing case and listed in
  ROADMAP.md; it turns red when the engine fixes it. Never work around it in `src/`.
- Engine rules the CLI only transmits (`validatePdfX`) are tested as a TRANSMISSION contract:
  `inspect-pdfx-transmission.test.ts` builds the offending PDFs at test time
  (`buildObjectsPdf`, `patchBytes` in `tests/helpers/fuzz.ts`) and holds the command output to
  the bridge call on the same bytes.

## Command test pattern

1. Use `tests/helpers/cli-harness.ts`: `TempFiles` for temp inputs/outputs (cleaned in
   `afterEach`), `captured()` to intercept stdout/stderr, `withJsonEnvelope()` to run a command
   under `--json` and parse the stderr envelope, `renderTo()` for a quick PDF, `renderJson()`
   (envelope + bytes), `diagnosticCodes()`, `inspectLayoutTo()`, `sha256` / `latin1` /
   `pageCount` / `expectCliError`, and the `MINIMAL_DOC`, `SYNTHETIC_CMYK_ICC`,
   `SYNTHETIC_GRAY_ICC` fixtures. Under `captured()` the mocked stdout never calls a write
   callback back: a command that writes its ARTEFACT to stdout hangs — give it `--output`.
2. Drive commands through `parseArgs([...])`, e.g. `await render(parseArgs(['--input', tmpIn]))`.
3. Test error paths with `await expect(fn(...)).rejects.toBeInstanceOf(CliError)` and assert
   `.exitCode` and `.code` (the stable `E_*` value).
4. Assert PDF output starts with `%PDF` and contains `%%EOF`; for structure, re-open the bytes
   through the bridge (`openPdf`, `extractText`, `validatePdfX`) rather than regexing the file.
5. A behaviour that depends on the real engine (fonts, ICC, signatures) uses the committed
   fixtures under `tests/fixtures/` (`tests/fixtures/README.md` records their provenance);
   never a hand-made stub the engine now rejects (a 128-byte fake ICC failed under 1.8.0).

## Conventions

- `describe('functionName')` → `it('should …')`; one concept per assertion; `it.each` for
  parameterised flag forms and script codes.
- Append new cases before the final `});` of the relevant `describe`.
- `--variant table` tests need COMPLETE `PdfParams` (incl. `infoItems`, `balanceText`,
  `countText`) — `assembleTableParts` throws on missing `infoItems`; table rows are
  `{ cells, type, pointed }` objects.
- Invisible characters (U+00A0, U+00AD, U+202F, U+200D, U+FE0F, U+061C) are written as
  `\uXXXX` escapes or built with `String.fromCodePoint`, never typed.
- Prose in another language inside a test (a French-spacing sample) carries a
  `// demo-language: <tag> (reason)` comment on or above the line.
- No `toLocaleString()` without an explicit locale in `scripts/` or `src/` (the regression suite
  scans for it); pinned dates come from `scripts/helpers/io.ts` (`SAMPLE_CREATION_ISO`).

## Samples and the baseline

- `scripts/lib/sample-plan.ts` is the render plan (category/file flags, skips, passwords);
  `scripts/generators/` write `test-output/samples/` with the BUILT CLI. A new sample is a
  JSON under `samples/render/`, a plan entry when it needs flags, a dual-shell pair, and — after
  `npm run build && npm run test:generate` — a baseline entry
  (`npx tsx scripts/verify-samples.ts --update`, declared in the release note).
- Encrypted and signed outputs are fingerprinted semantically (`ENCRYPTED_SAMPLES`,
  `SIGNED_SAMPLES` in `scripts/lib/sample-fingerprint.ts`); deliberately identical pairs go in
  `IDENTICAL_SAMPLE_GROUPS`.

## Coverage targets

- Enforced thresholds live once in `vitest.config.ts` (statements/branches/functions/lines) and
  are never lowered; `docs/assets/ecosystem.json` mirrors the statements floor.
- `src/index.ts` and the CMS/PKI/LTV engine modules are excluded (see the commented block in
  `vitest.config.ts`); the gate's `smoke` step and the integration round-trips cover them.
