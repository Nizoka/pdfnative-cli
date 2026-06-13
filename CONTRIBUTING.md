# Contributing to pdfnative-cli

Thank you for considering contributing to pdfnative-cli!

## Development Setup

```bash
git clone https://github.com/Nizoka/pdfnative-cli.git
cd pdfnative-cli
npm install
```

### Requirements

- Node.js >= 20
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
```

All new code must include tests. Coverage thresholds: statements 75%, branches 80%, functions 85%, lines 75%.

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
