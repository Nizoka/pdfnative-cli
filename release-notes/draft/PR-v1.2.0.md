# v1.2.0 — pdfnative 1.5.0: page-tree, annotations, bookmarks, native crypto & AI-governance (HITL)

> **Branch:** `release/v1.2.0` → `main`
> **Type:** Minor release (additive, 100% backward-compatible with v1.1.0)
> **pdfnative bump:** `^1.3.0` → `^1.5.0`

## Summary

Five new commands and a set of `render` / `sign` / `inspect` enhancements land the
**pdfnative 1.5.0** engine's page-tree and annotation APIs on the CLI, plus an
agent-facing **AI-governance / Human-in-the-Loop (HITL)** capability — zero
breaking changes, zero new runtime dependencies:

1. **Page-tree commands** — `merge`, `split`, `extract` expose `mergePdfs` /
   `splitPdf` / `extractPages` with traversal-guarded paths, `--drop-annotations`,
   and a `--max-output-size` cap.
2. **Markup annotations** — `annotate` attaches highlight / text / shape / line /
   freetext annotations via an **incremental save** (existing signatures stay
   valid); `inspect --annotations` lists them back out.
3. **AI-governance / HITL** — `govern rules | policy | verify-issue` surfaces
   pdfnative's governance contract; `verify-issue` gates a local draft with the
   new `E_POLICY` code. Fully offline.
4. **`render` tooling** — PDF bookmarks (`--outline`), a bundled math font
   (`--font math`), and layout introspection (`--inspect-layout` /
   `--debug-layout`).
5. **Native signing** — `sign` uses `node:crypto` for constant-time RSA/ECDSA by
   default; `--pure-crypto` opts out.

## Changes

### `package.json`
- `pdfnative` bumped `^1.3.0` → `^1.5.0`; version → `1.2.0`.
- Keywords enriched (`ai-governance`, `hitl`, `human-in-the-loop`, `pdf-merge`,
  `pdf-split`, `pdf-extract`, `annotate`, `markup-annotations`, `bookmarks`,
  `outline`, `page-labels`, `layout-inspection`, `math-symbols`).
- `overrides`: `js-yaml ^4.3.0`, `vite ^8.0.16` (transitive dev-only advisories).

### `src/core-bridge/index.ts`
- Re-export `mergePdfs` / `splitPdf` / `extractPages` (+ `PageRange` / `MergeOptions`),
  `createModifier` / `buildAnnotationBody` (+ annotation types / `ParsedAnnotation`),
  `inspectDocumentLayout` (+ `LayoutInspection` / `InspectedPage` / `InspectedBlock`
  / `LayoutDebugOptions`), `setCryptoProvider` / `getCryptoProvider` / `CryptoProvider`,
  `OutlineItem` / `PageLabelRange` / `PageLabelStyle`.

### New commands
- `src/commands/merge.ts` — 2–50 sources (positionals + `--input`) → `mergePdfs`.
- `src/commands/split.ts` — `--output-dir` (required), `--pages` per-range or one
  per page, `--prefix` (sanitised), zero-padded `<prefix>-<n>.pdf`.
- `src/commands/extract.ts` — `--pages` (required, 1-based, order-preserving).
- `src/commands/annotate.ts` — `--annotations` JSON (array or `{ annotations }`);
  validates `page` / `type` / `rect` (and `start` / `end` for `line`); re-keys only
  known fields; `createModifier` + `buildAnnotationBody` + incremental `save()`.
- `src/commands/govern.ts` — `rules` / `policy` / `verify-issue`; a violation →
  `CliError('', 1, ErrorCode.POLICY)`.

### Enhanced commands
- `src/commands/render.ts` — `--outline auto|<file.json>` (`loadOutline`),
  `--inspect-layout` (`LayoutInspection` JSON via `inspectDocumentLayout`),
  `--debug-layout`, and `math` added to the bundled-font allow-list.
- `src/commands/sign.ts` — native `node:crypto` provider by default via
  `createNativeCryptoProvider`; `--pure-crypto` passes no provider.
- `src/commands/inspect.ts` — `--annotations` (markup + link) and automatic
  page-label reporting (`getPageLabels`).
- `src/commands/schema.ts` — new `annotate` and `govern-verify` subjects;
  `pageLabels` / `annotations` added to the `inspect` schema.
- `src/commands/completion.ts` — new commands + flags in the bash/zsh/fish tables.

### New utilities
- `src/utils/pages.ts` — `parsePageList` (0-based indices) / `parsePageRanges`
  (`PageRange[]`) from `1,3,5-7` syntax. Pure, zero-dep.
- `src/utils/pdfops.ts` — `parseMaxOutputSize`, `collectSourcePaths` (traversal guard).
- `src/utils/governance.ts` — `AI_GOVERNANCE_POLICY`, `AGENT_RULES_TEXT`, pure
  `validateGovernanceDraft` (a zero-dependency port of pdfnative's `verify-issue.mjs`).
- `src/utils/keys.ts` — `createNativeCryptoProvider(pem)` (`createPrivateKey` +
  `createSign('sha256')`).
- `src/utils/layout.ts` — `parseDebugLayout` for `--debug-layout`.
- `src/utils/error.ts` / `agent.ts` — `E_POLICY` code + default message.
- `src/index.ts` — dispatch, usage, and help wiring for the five new commands.

### Governance files
- `.github/ai-governance.json`, `.github/AGENT_RULES.md`, `.github/drafts/README.md`
  — adapted for the CLI (verification points at `pdfnative govern verify-issue`).

### Samples
- `merge/`, `split/`, `extract/`, `annotate/`, `govern/`, `render/outline/`,
  `render/math/`, `render/inspect-layout/`, `sign/07-native-crypto.*`,
  `inspect/07-annotations.*` (Bash + PowerShell). `samples/run-all.js` handles
  the new `outline` / `math` categories and skips the non-document outline tree.

### Docs
- `README.md`, `AGENTS.md`, `docs/KNOWLEDGE_BASE.md`, `SECURITY.md`,
  `CHANGELOG.md`, `ROADMAP.md`, `.github/copilot-instructions.md`,
  `.github/instructions/commands.instructions.md`, `samples/README.md`.
- `release-notes/v1.2.0.md`.

### Tests
- `tests/commands/{pagetree,annotate,govern,render-enhancements}.test.ts`,
  `tests/utils/{pages,pdfops,governance}.test.ts`; new cases appended to
  `schema.test.ts` and `sign-verify-roundtrip.test.ts`.

## Validation

- `npm run typecheck:all` → clean (src + tests).
- `npm run lint` → clean.
- `npm run build` → CJS + ESM + types emitted.
- `npm run test:coverage` → all tests passing; coverage above thresholds
  (statements 79 / branches 68 / functions 83 / lines 79).
- `npm audit` → **0 vulnerabilities**.
- Smoke (via `node dist/cli.cjs`):
  - `merge` (3-page), `split` (per-range → 2 parts), `extract` (`4,1-2` → 3 pages).
  - `annotate` → `inspect --annotations` lists 3 annotations.
  - `render --outline auto` / `--outline <tree>` / `--font math` /
    `--inspect-layout` / `--debug-layout`.
  - `govern policy` (exit 0) / `verify-issue` good (exit 0) / bad (exit 1, `E_POLICY`).
  - `sign` native + `--pure-crypto` → `verify --summary` `{ valid: true }` for both.

## Backward compatibility

- **No flag removed or renamed; no exit-code semantics changed** (0/1/2).
- All new commands / flags are additive; every v1.1.0 invocation works unchanged.
- `E_POLICY` is a new, additive error code.

## Out of scope (unchanged)

- **MCP / daemon / HTTP interfaces** — the CLI stays a stateless process.
- **Sign-side LTV** (PAdES-T/LT/LTA) — upstream-blocked in pdfnative;
  `sign --timestamp` stays reserved and errors with `E_UNSUPPORTED` (exit 2).
- No new runtime dependency — `pdfnative` remains the only one.

## Self-review checklist

- [x] No `console.log`; all output via `process.stdout.write` /
      `process.stderr.write`.
- [x] stdout = artifact, stderr = diagnostics; `--json` never touches stdout.
- [x] No key material in output; native + pure-JS signing both keep keys in memory.
- [x] Numeric exit codes (0/1/2) unchanged; `E_POLICY` is additive.
- [x] `--dry-run` writes no output for `merge` / `split` / `extract` / `annotate`
      (in addition to `render` / `sign` / `batch`).
- [x] Path-traversal validation on all new path args; `--max-output-size` caps;
      page references bounds-checked; `annotate` re-keys only known fields.
- [x] `govern` is fully offline — no GitHub or network access.
- [x] TypeScript strict; no `any`; new types `readonly` where applicable;
      ESM-first `.js` imports.
- [x] `pdfnative` is still the **only** runtime dependency.
- [x] `npm audit` clean; coverage thresholds green.
