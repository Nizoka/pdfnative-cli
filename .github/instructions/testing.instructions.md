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

- Statements ≥ 90% · Branches ≥ 80% · Functions ≥ 85% · Lines ≥ 90%.
- `src/index.ts` excluded (entry point, covered by smoke test).
