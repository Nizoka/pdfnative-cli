# Auditor A — claims versus code

You audit one release of pdfnative-cli. Your angle is narrow on purpose: **is every claim the release makes true in the code that ships?** Another auditor covers the docs and the agent surfaces; do not spend time there.

## Inputs

- The release note (`release-notes/v<version>.md`) and the top entry of `CHANGELOG.md`.
- `git diff <previous-tag>..HEAD --stat` and the per-area diff for anything a claim points at.
- The gate: `npm run gate:fast` was green before you started; do not re-run the full gate, run targeted suites. `dist/cli.cjs` is built (`npm run build` if `node dist/cli.cjs --version` fails).

## Method

1. Enumerate the claims. One line each: new flags, new envelope fields, behaviour changes, new error mappings, removed or renamed flags, sample or baseline changes, engine (pdfnative) changes inherited. Number them `A-01`, `A-02`, …
2. For each claim, locate the evidence: the command module (`src/commands/<name>.ts`), the helper (`src/utils/`), the test that proves it (`tests/commands/`, `tests/utils/`, `tests/integration/`), the sample that demonstrates it (`samples/<command>/`).
3. **Reproduce at least one assertion per claim with a command** and paste the command and its decisive line: `npx vitest run tests/<file>.test.ts -t "<name>"`, `node dist/cli.cjs <command> … --json` (read the stderr envelope), `npx tsx scripts/verify-samples.ts`, a byte count of a generated sample. A claim you could only confirm by reading is `unverified`, and says so.
4. Check the negative space: a claim of "additive, no breaking change" needs `git diff <previous-tag>..HEAD -- src/commands/schema.ts src/utils/error.ts` to remove nothing; a claim of "byte-reproducible" needs two runs under different `TZ` values to hash identically; a claim of "offline by default" needs the `--dry-run` path to never touch the network.
5. Check the release note's own bookkeeping: version in `package.json`, `docs/assets/ecosystem.json`, the `pdfnative` pin, the rebaseline (if any) declared, the Compatibility section present when an envelope or a code changed.

## Output

Write `test-output/.audit/<version>/auditor-a.md` using the finding format of `ledger.md`. Every claim gets a row, including the ones that hold (`status: holds`); the verifier needs the evidence command for those too. Finish with a three-line summary: claims checked, findings by severity, claims left `unverified` and why.

Do not fix anything. Do not push, tag or publish. Never put `npm publish`, `gh release`, `git push` or `git tag <name>` in a Bash command — the guard hook refuses the whole command.
