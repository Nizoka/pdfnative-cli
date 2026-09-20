---
description: "Run the pdfnative-cli quality gate (scripts/gate.ts) and report its summary."
agent: "agent"
---
# Quality Gate

Run THE gate and report its result. Do not run the individual steps by hand.

## Steps

1. `npm run gate` (CI profile, the default). When the user asks for a quick check, run `npm run gate:fast` instead; on a release branch, `npx tsx scripts/gate.ts --publish --require-all`. (PowerShell swallows a bare `--`, so pass gate flags by calling the script directly.)
2. Report the gate's own summary verbatim — it is at most 20 lines. Do not paste step logs into the conversation.
3. For a failing step only, open `test-output/.gate/<step>.log` and quote the smallest excerpt that explains the failure.
4. Re-run a single step after a fix with `npx tsx scripts/gate.ts --only <step>`; `--json` gives machine-readable output.

## What each profile contains

The step list is the `STEPS` table in `scripts/gate.ts` — read it there rather than from this prompt, so the two never drift. The `smoke` step drives the BUILT binary (`dist/cli.cjs`), so `build` precedes it; `validate:pdfa` is skipped without veraPDF unless `--require-all` turns the skip into a failure.

## Quality thresholds

- Zero TypeScript errors (three configs: `src`, `tests`, `scripts`), zero ESLint errors.
- All tests passing; coverage thresholds are declared once in `vitest.config.ts` and enforced by the gate.
- Counts and versions quoted in docs must match `docs/assets/ecosystem.json` (`verify:docs` step).
- Every generated sample matches `tests/regression/baselines/samples.sha256.json` (`verify:samples` step); a rebaseline is declared in the release note.
