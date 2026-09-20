<!--
Thank you for contributing to pdfnative-cli. Describe the change, then walk
the checklist. The items mirror CONTRIBUTING.md §Pull Request Checklist word
for word; keep the two in step when you change either (verify:docs rule
pr-template-parity and tests/tools/workflows.test.ts both check it).
-->

## What and why

<!-- One paragraph: what changes, why, and which issue it closes (`Closes #…`). -->

## Checklist

- [ ] `npm run gate` passes — the CI profile in one command (`npm run gate:fast` for a quick loop while iterating; PowerShell swallows a bare `--`, so call `npx tsx scripts/gate.ts --fast` there)
- [ ] All tests pass (`npm run test`)
- [ ] Type check passes (`npm run typecheck:all`)
- [ ] Lint passes (`npm run lint`)
- [ ] New code has tests (coverage thresholds in `vitest.config.ts` must not regress)
- [ ] No `any` types introduced
- [ ] No new runtime dependencies added (`pdfnative` stays the only one)
- [ ] A new or changed command touches every wiring point: `src/index.ts` usage + dispatch, `src/commands/completion.ts`, `src/commands/schema.ts`, `samples/<command>/`, README, `docs/KNOWLEDGE_BASE.md`
- [ ] If samples, PDF/A or PDF/X behaviour changed: `npm run build && npm run test:generate && npm run verify:samples && npm run corpus:pdfa && npm run validate:pdfx && npm run validate:pdfa` passes locally (veraPDF installed — see [PDF/A validation](../CONTRIBUTING.md#pdfa-validation-verapdf); new claiming corpus entries bump `declared.pdfaSamples` / `declared.pdfxSamples`; an intended output change is rebaselined with `npx tsx scripts/verify-samples.ts --update` and declared in the release note)
- [ ] If docs, README, llms.txt, AGENTS.md, CLAUDE.md or `.claude/` changed: `npm run verify:docs` passes
- [ ] CHANGELOG.md updated if user-facing changes
- [ ] For releases: follow [Release](../CONTRIBUTING.md#release) — `release-notes/vX.Y.Z.md` and `release-notes/draft/PR-vX.Y.Z.md` written, and `npx tsx scripts/gate.ts --publish --require-all` passes locally, which runs every individual gate: `typecheck:all`, `lint`, `test:coverage`, `build`, `dist-check`, `smoke`, `bundle-size`, `verify:docs`, `test:generate`, `verify:samples`, `corpus:pdfa`, `validate:pdfx`, `validate:pdfa`

<!--
Runtime changes also need a ROADMAP.md entry and a line in the next
release-notes/vX.Y.Z.md; a flag, envelope field or exit-code change is a
change to the agent contract (docs/AGENT_CONTRACT.md) and is called out
there. Pull requests, tags and releases are submitted by the maintainer,
never by an agent (.github/AGENT_RULES.md §5).
-->
