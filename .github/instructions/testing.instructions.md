---
description: "Use when writing tests, adding test coverage, or debugging test failures in pdfnative-cli. Covers vitest patterns, CLI testing conventions, and coverage targets."
applyTo: "tests/**"
---
# Testing

## Framework

- **vitest** (native ESM). Run: `npm test`, `npm run test:watch`, `npm run test:coverage`.
- Tests mirror `src/`: `tests/commands/*.test.ts`, `tests/utils/*.test.ts`,
  `tests/integration/*.test.ts`.

## Command test pattern

1. Capture stdout via `vi.spyOn(process.stdout, 'write')`.
2. Use `os.tmpdir()` temp files; clean up in `afterEach`.
3. Test error paths with `await expect(fn(...)).rejects.toBeInstanceOf(CliError)` and assert
   `.exitCode`.
4. Drive commands through `parseArgs([...])`, e.g. `await render(parseArgs(['--input', tmpIn]))`.
5. Assert PDF output starts with `%PDF` and contains `%%EOF`.

## Conventions

- `describe('functionName')` → `it('should ...')`; one concept per assertion; `it.each` for
  parameterized flag forms.
- Append new cases before the final `});` of the relevant `describe`.
- `--variant table` tests need COMPLETE `PdfParams` (incl. `infoItems`, `balanceText`,
  `countText`) — `assembleTableParts` throws on missing `infoItems`.

## Coverage targets

- Enforced thresholds live in `vitest.config.ts` (single source of truth):
  Statements ≥ 79% · Branches ≥ 68% · Functions ≥ 83% · Lines ≥ 79%.
- `src/index.ts` and the network-transport / CMS-engine modules are excluded
  (see the commented exclude block in `vitest.config.ts`).
