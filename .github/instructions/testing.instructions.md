---
description: "Use when writing tests, adding test coverage, or debugging test failures in pdfnative-cli. Covers vitest patterns, CLI testing conventions, and coverage targets."
applyTo: "tests/**"
---
# Testing Standards

## Framework

- **vitest** — native ESM, fast watch mode, built-in coverage.
- Run: `npm run test` (single run), `npm run test:watch` (watch), `npm run test:coverage`.
- Config: `vitest.config.ts`.

## Test Organization

```
tests/
├── utils/
│   └── args.test.ts        # arg parser edge cases
└── commands/
    ├── render.test.ts       # render command (JSON → PDF bytes)
    ├── sign.test.ts         # sign command (PDF + key → signed PDF)
    └── inspect.test.ts      # inspect command (PDF → metadata)
```

## Command Testing Patterns

Because commands write to `process.stdout` or files, tests should:

1. **Capture stdout**: redirect `process.stdout.write` via `vi.spyOn`.
2. **Use temp files**: write fixtures to OS temp dir (`os.tmpdir()`), clean up in `afterEach`.
3. **Test error paths**: verify `CliError` is thrown with correct `.exitCode`.

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '../../src/commands/render.js';
import { CliError } from '../../src/utils/error.js';
import { parseArgs } from '../../src/utils/args.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('render', () => {
    it('should produce a valid PDF for minimal DocumentParams', async () => {
        const tmpOut = path.join(os.tmpdir(), `test-${Date.now()}.pdf`);
        const input = JSON.stringify({ title: 'Test' });
        const tmpIn = path.join(os.tmpdir(), `in-${Date.now()}.json`);
        await fs.writeFile(tmpIn, input, 'utf8');

        await render(parseArgs([`--input`, tmpIn, `--output`, tmpOut]));

        const bytes = await fs.readFile(tmpOut);
        expect(bytes.slice(0, 4).toString()).toBe('%PDF');
        expect(bytes.toString().includes('%%EOF')).toBe(true);

        await fs.unlink(tmpIn);
        await fs.unlink(tmpOut);
    });

    it('should throw CliError(2) when JSON is invalid', async () => {
        const tmpIn = path.join(os.tmpdir(), `bad-${Date.now()}.json`);
        await fs.writeFile(tmpIn, '{bad json}', 'utf8');

        await expect(render(parseArgs([`--input`, tmpIn]))).rejects.toBeInstanceOf(CliError);

        await fs.unlink(tmpIn);
    });
});
```

## Args Testing Patterns

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/utils/args.js';

describe('parseArgs', () => {
    it('handles --flag value', () => {
        const result = parseArgs(['--input', 'file.pdf']);
        expect(result.flags['input']).toBe('file.pdf');
    });

    it('handles --flag=value', () => {
        const result = parseArgs(['--input=file.pdf']);
        expect(result.flags['input']).toBe('file.pdf');
    });
});
```

## Coverage Targets

- Statements: ≥ 90%
- Branches: ≥ 80%
- Functions: ≥ 85%
- Lines: ≥ 90%
- `src/index.ts` is excluded from coverage (entry point, tested via smoke test).

## Vitest Naming Convention

- `describe('functionName')` → `it('should ...')`
- One assertion per concept.
- Use `it.each` for parameterized cases (e.g., multiple flag forms).
