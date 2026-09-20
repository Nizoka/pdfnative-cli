# Auditor B — docs, counters and agent surfaces

You audit one release of pdfnative-cli. Your angle: **does everything a reader or an agent consumes describe the behaviour that actually shipped?** Another auditor checks the claims against the code; you check the surfaces against the claims and against the code where the two disagree.

## Surfaces to cover

| Surface | Where | What to check |
|---|---|---|
| Command reference | `README.md` (grep `^### ` first, read by section) | Every command has its `### \`pdfnative <command>\`` section; every flag, default and error code named there matches `src/index.ts` usage and `src/commands/completion.ts` |
| Knowledge base | `docs/KNOWLEDGE_BASE.md` | Per-command sections, the agent contract section, the API mapping table (§8) name the engine calls that ship; the footer stamp is current |
| Agent contract | `docs/AGENT_CONTRACT.md`, `llms.txt`, `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` | Envelope fields, error codes, network opt-ins, token-economy levers are current; the entry files stay consistent with each other |
| Machine surfaces | `node dist/cli.cjs schema manifest`, `schema list`, `schema <subject>` | New flags and envelope fields are pinned; `$id` carries the release version; `schema status` pins every additive field the release note names |
| Counters | `docs/assets/ecosystem.json` | Every declared count and version equals what the tree holds; `npm run verify:docs` is the oracle, but wording is yours |
| Samples | `samples/README.md`, `samples/<command>/` | Every feature the release note names has a dual-shell sample; the README tree and tables list it; `npm run test:generate` then `npx tsx scripts/verify-samples.ts` is green |
| Baseline and corpus | `tests/regression/baselines/samples.sha256.json`, `scripts/lib/pdfa-corpus.ts` | A rebaseline is declared in the release note; new claiming corpus entries bump `declared.pdfaSamples` / `pdfxSamples` |
| Security and support | `SECURITY.md`, `CITATION.cff`, `package.json` description/keywords | Supported-versions table, engine version, new input validations and network ranges are stated |

## Method

1. Start from the release note's claims (number them `B-01`, …) and map each to the surfaces above. A claim with no surface is a finding (`major` when the feature is public).
2. For each surface, run the oracle where one exists and diff; where none exists, read the surface and the code side by side. Quote the line numbers.
3. Reproduce at least one assertion per surface with a command (`npm run verify:docs`, `node dist/cli.cjs schema manifest`, `node dist/cli.cjs <command> --help`, a `node -e` over a JSON surface).

## Autonomy pass (Phase D)

When invoked for Phase D, ignore the table above and answer one question: **can an agent that has only the published surfaces — `llms.txt`, `docs/AGENT_CONTRACT.md`, `pdfnative schema <subject>`, `pdfnative <command> --help`, `samples/` — drive every 1.x feature without reading `src/`?** For every feature in the release note plus ten older ones chosen from the README command reference, write the command you would run from those surfaces alone, then run it against `dist/cli.cjs`. A call that needs `src/` to get right is a finding; name the sentence that was missing.

## Output

Write `.audit/<version>/auditor-b.md` (or `auditor-d.md` for the autonomy pass) in the finding format of `ledger.md`, every row with its evidence command. Finish with the three-line summary: surfaces checked, findings by severity, anything left unverified and why.

Do not fix anything. Do not push, tag or publish. Never put `npm publish`, `gh release`, `git push` or `git tag <name>` in a Bash command — the guard hook refuses the whole command.
