# Contributing to pdfnative-cli

Thank you for considering contributing to pdfnative-cli!

## Development Setup

```bash
git clone https://github.com/Nizoka/pdfnative-cli.git
cd pdfnative-cli
npm install
```

### Requirements

- Node.js >= 22
- npm >= 9

## Build

```bash
npm run build          # tsup → dist/ (ESM + CJS + .d.ts)
npm run dev            # tsup --watch
```

## Test

```bash
npm run test           # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest with v8 coverage
npm run corpus:pdfa    # build the CLI + generate the PDF/A validation corpus
npm run validate:pdfa  # build + corpus + veraPDF validation (see below)
```

All new code must include tests. Coverage thresholds (enforced by `vitest.config.ts`, the single source of truth): statements 79%, branches 68%, functions 83%, lines 79%. Never lower them to make a change pass — add tests.

## PDF/A validation (veraPDF)

The CLI's PDF/A claims are checked against the official reference validator,
[veraPDF](https://verapdf.org). `npm run validate:pdfa` builds `dist/cli.cjs`,
drives the **built** CLI to write a 12-file corpus to `test-output/pdfa/`
(`scripts/generate-pdfa-corpus.mjs` — a representative sample, not an exhaustive
feature matrix: renders at all four levels 1b / 2b / 2u / 3b, a PDF/A-3b XML
attachment, header/footer templates, `--outline auto`, an opaque watermark, an
incremental PAdES signature over a claiming file, and an incremental `metadata`
update), then validates each file against the profile it claims in XMP with
`scripts/validate-pdfa.mjs` and compares the verdict with the manifest's
`expectCompliant` flag.

The positive entries render with `--strict --font latin --lang latin`: the CLI
has no `embedFonts` switch — `--font latin` registers the bundled Noto Sans
loader and `--lang latin` injects the matching `fontEntries`, which routes all
Latin text away from non-embedded base-14 Helvetica (the sRGB OutputIntent is
emitted automatically by the engine). The corpus also includes **two negative
canaries** (`expectCompliant: false`) that veraPDF **must reject** — otherwise
the validator is accepting everything and the run fails:

- a render without fonts, whose claim violates ISO 19005-2 §6.2.11.4.1 (fonts
  used for rendering shall be embedded);
- a `--variant table` render under PDF/A-1b — the `PdfParams` path has no
  `fontEntries` channel, so the CLI **cannot** embed fonts on it and the claim
  violates ISO 19005-1 §6.3.4. This is a documented CLI gap, kept as a canary.

An unexpected pass (`XPASS`) is always fatal, and a coverage canary fails the
run if a manifest file is missing or its XMP claim disagrees with the manifest.

Per file the validator reports `PASS` / `FAIL` / `XFAIL` / `XPASS` / `INFRA` /
`SKIP`. Exit codes of `scripts/validate-pdfa.mjs`:

| Exit | Meaning |
|------|---------|
| 0 | Every expectation met — **or** veraPDF is absent and `VERAPDF_REQUIRED` is unset: install hints are printed and validation is **SKIPPED** (exit 0 is a skip, not a pass) |
| 1 | Conformance expectation not met (`FAIL` or `XPASS`), no negative canary in the corpus, or the coverage canary tripped |
| 2 | Corpus directory / manifest absent — run `npm run corpus:pdfa` first |
| 3 | `INFRA`: veraPDF/Java unusable or produced no report (only fatal with `VERAPDF_REQUIRED=1`) — not a conformance verdict |

Environment: `VERAPDF_HOME=<dir>` points at a veraPDF install (`verapdf` /
`verapdf.bat` at the root or under `bin/`); `VERAPDF_REQUIRED=1` fails closed
(missing veraPDF → exit 3 instead of a skip; set in CI, unset locally);
`VERAPDF_REPORT_DIR=<dir>` relocates the raw per-file veraPDF XML reports
(default `test-output/pdfa/reports/`).

**CI is blocking**: the same scripts run with `VERAPDF_REQUIRED=1` and a pinned
veraPDF **1.30.2** whose installer SHA-256 is verified before `java -jar`
executes it, on every push / PR touching `src/`, `samples/`, `scripts/` or the
package manifest (`.github/workflows/verapdf.yml`), and again as a pre-publish
gate in `.github/workflows/publish.yml`. veraPDF is an external CI tool, not a
dependency — the zero-extra-runtime-dependency policy is unchanged.

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
# Windows — download the same installer zip, unzip, and run the GUI installer
# (or the headless recipe above with a Windows <installpath>). The install
# directory contains verapdf.bat; point VERAPDF_HOME at it:
$env:VERAPDF_HOME = "C:\Program Files\veraPDF"
```

Then expose it: add the install directory to `PATH`, or set `VERAPDF_HOME` to
it. Windows note: the `.bat` launcher is invoked through a shell with quoted
arguments (Node refuses to spawn batch files directly), so paths with spaces
work.

**PR checklist**: if you change samples or anything affecting PDF/A behaviour
(`render`, fonts, metadata/XMP, signing over claiming files), make sure
`npm run validate:pdfa` passes locally with veraPDF installed — remember that
exit 0 without veraPDF is a skip, not a proof.

## Lint & Type Check

```bash
npm run lint              # eslint src/ tests/
npm run typecheck         # tsc --noEmit (src/)
npm run typecheck:tests   # tsc --project tsconfig.test.json
npm run typecheck:all     # both above
```

All must pass before opening a PR.

## Code Style

- **TypeScript strict mode** — `strict: true`
- **ESM-first** — all internal imports use `.js` extension
- **`const` over `let`** — never use `var`
- **No `any`** — use `unknown` with type narrowing
- **No `console.log`** — use `process.stdout.write(msg + '\n')` / `process.stderr.write(msg + '\n')`
- **`readonly`** on interface props where mutation is unnecessary

## Agent contract

The CLI is agent-native (see [AGENTS.md](AGENTS.md)). When you add or change a command:

- Throw `CliError(message, exitCode, ErrorCode.X)` with a stable code from `utils/error.ts`.
  Numeric exit codes (0/1/2) must not change.
- Keep **stdout** for the artifact and **stderr** for diagnostics. For success status on
  `render`/`sign`/`batch`, call `emitStatus({...})` (no-op outside `--json`).
- Honour `--dry-run` via `hasFlag(args.flags, 'dry-run') || isDryRun()`.
- If a command gains a new input/output shape, update the matching schema in
  `commands/schema.ts` (hand-authored Draft 2020-12; bump nothing — the `$id` tracks the
  package version automatically) and add a `schema.test.ts` assertion.

## Project Structure

```
src/
├── index.ts           # CLI entry: parse argv → dispatch → exit
├── commands/
│   ├── render.ts      # JSON → PDF
│   ├── sign.ts        # digital signature
│   ├── inspect.ts     # PDF analysis
│   └── verify.ts      # CMS/PKCS#7 signature verification
├── utils/
│   ├── args.ts        # zero-dep arg parser
│   ├── io.ts          # stdin/file I/O helpers
│   ├── layout.ts      # layout option composer (CLI flags + --layout file)
│   ├── keys.ts        # PEM / PEM-chain loader with key-material redaction
│   └── error.ts       # CliError, die(), deprecate()
└── core-bridge/
    └── index.ts       # re-exports from pdfnative
tests/                 # vitest test suite (mirrors src/)
```

## Security

- **Never log key material** from the `sign` command — not in error messages, not debug output.
- Validate file paths against path traversal before filesystem access.
- Cap JSON input at 50 MB before parsing.
- A CycloneDX **SBOM** (`sbom.cdx.json`) is generated in CI and attached to each release; the
  generator is build-time only — do not add it as a runtime dependency.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (deps, CI, governance)
- `docs:` documentation only
- `test:` tests only
- `refactor:` no behaviour change
