# v1.4.0 — PAdES B-T/B-LT/B-LTA, compare, metadata & manifest pipelines

> **Branch:** release/v1.4.0 → main
> **Type:** Minor release (additive, 100% backward-compatible command surface with v1.3.0)
> **pdfnative bump:** ^1.6.0 → ^1.7.0
> **Support policy:** Node.js ≥ 22 (was ≥ 20 — Node 20 EOL 2026-04-30); CI matrix 22 + 24

## Summary

1. Completes the ROADMAP "Next" section: sign-side LTV. `sign --timestamp <tsa-url>`
   (RFC 3161, PAdES B-T) is now functional; new `ltv collect|embed|add` command writes
   `/DSS` + `/VRI` (B-LT, with an air-gapped collect→embed flow); new `doc-timestamp`
   command appends `/DocTimeStamp` revisions (B-LTA).
2. Two more new commands: `metadata` (incremental `/Info` + XMP updates that keep
   signatures valid) and `compare` (text/structure diff with CI exit codes).
3. Multi-signature support end-to-end: `sign --allow-multiple/--field-name/--profile/
   --digest/--signature-rect/--signature-page/--placeholder-bytes`, inventoried by
   `inspect --signatures`, validated per field by `verify` (incl. SHA-384/512 and
   `/DocTimeStamp` token validation).
4. `batch --manifest tasks.json` — declarative multi-command pipelines with `@id` output
   references; network inside a manifest requires `--allow-network`.
5. `render`: `--strict` PDF/A diagnostics, JSON-usable image blocks (`src`/`dataBase64`),
   print production (bleed/boxes/marks/userUnit/ICC output intent), viewer print
   preferences, charts v2 (9 kinds, dual axes, log/time), `--chunk-size`,
   `params.metadata` (+`trapped`).
6. Agent surface: new stable code `E_NETWORK`, `schema` subjects 15 → 19 (`ltv-data`,
   `compare`, `batch-manifest`, `metadata`), global `--max-inflate-size`, completions +
   manifest + `llms.txt` for all 21 commands.
7. Fixes a long-standing `inspect` bug (signature/form-field counters always 0).
8. veraPDF integration: the CLI's PDF/A claims are now validated against the veraPDF
   reference validator — a 12-file CLI-generated corpus (10 positive + 2 negative
   canaries) checked in a **blocking** CI workflow and again pre-publish; local gate
   via `npm run validate:pdfa` (exit 0 without veraPDF = skip, not a pass). The PDF/A
   samples themselves are now rendered actually-conformant (`--font latin --lang latin`
   via `run-all.js`).

## Changes

### package.json
- `version` 1.3.0 → 1.4.0; `pdfnative` `^1.6.0` → `^1.7.0`; `engines.node` `>=20` → `>=22`.
- Description + keywords extended (pdf-compare, document-timestamp, dss, pades-lt/lta,
  print-production, …). Security overrides refreshed (`js-yaml ^4.3.1`, `nanoid ^3.3.18`).

### src/core-bridge/index.ts
- Selective re-exports for the 1.7.0 surface: `signPdfBytesWithTimestamp`,
  `estimateContentsSize`, `collectValidationInfo` / `embedValidationInfo` /
  `addValidationInfo` / `vriKeyForContents`, `addDocumentTimestamp`, `listSignatures`,
  timestamp/revocation provider get/set, RFC 3161 token parsers,
  `setMaxInflateOutputSize`, DER/hash/RSA primitives for the offline mock PKI, and all
  associated types (print production, diagnostics, viewer preferences, metadata update,
  image blocks).

### New commands
- `src/commands/ltv.ts` — collect (network, `--online` mandatory) / embed (offline) / add;
  serialises `LtvData` as versioned base64 JSON (schema subject `ltv-data`).
- `src/commands/docTimestamp.ts` — `doc-timestamp` (B-LTA), `--url` mandatory opt-in.
- `src/commands/metadata.ts` — incremental `updateMetadata` (signatures preserved).
- `src/commands/compare.ts` — text/structure diff, `E_CHECK_FAILED` on differences.

### Enhanced commands
- `sign` — functional `--timestamp` (+`--timestamp-digest`, `--timestamp-nonce`),
  multi-signatures, `--profile`, `--digest`, visible-signature placement, placeholder
  sizing via `estimateContentsSize(..., { timestamp: true })`. No flags → byte-identical
  1.3.x path.
- `verify` — RSA SHA-384/512 OIDs, per-signer digest for the byte-range hash,
  `/DocTimeStamp` validation (imprint + token signature), additive `fieldName` /
  `isDocTimestamp`.
- `inspect` — `--signatures`, page boxes + `/UserUnit`, `metadata.trapped`,
  `--check "signatures>=N"`; fixed name-object comparisons in the legacy counters.
- `annotate` — `--password` (encrypted incremental updates).
- `render` — `--strict` + diagnostics routing, image-block resolution, `--chunk-size`,
  ICC `outputIntent` revival from JSON (`number[]` → bytes).
- `batch` — `--manifest` / `--allow-network` / `--continue-on-error` (validation before
  execution, whitelist, `@id` graph, fail-fast).
- Global `--max-inflate-size` (src/index.ts, dynamic import keeps startup fast).

### New / changed utilities
- `src/utils/tsa.ts` — `createTsaProvider(url)` : RFC 3161 POST over the existing SSRF
  guard (`E_NETWORK` on failure, response bodies never echoed).
- `src/utils/ltv-provider.ts` — `createRevocationProvider()` : OCSP POST / CRL GET over
  the same guard.
- `src/utils/manifest.ts` — pure manifest parsing/validation/@-resolution/network policy.
- `src/utils/keys.ts` — native crypto provider gains per-call digest selection
  (sha256/384/512).
- `src/utils/layout.ts` — revives `outputIntent.iccProfile` from JSON (`number[]` →
  bytes) so ICC output intents are reachable from `--layout` files.
- `src/utils/cms-verify.ts`, `src/utils/timestamp-verify.ts` — digest agility +
  `verifyDocTimestamp()`.
- `src/utils/error.ts` / `agent.ts` — `E_NETWORK` (auto-published in `schema manifest`).

### Wiring (single source of truth respected)
- `src/index.ts` — USAGE 17 → 21 (+ 4 `*_USAGE` blocks, help switch, `loadCommand`).
- `src/commands/completion.ts` — 4 new commands + all new flags (drives 4 shells + the
  capability manifest).
- `src/commands/schema.ts` — subjects 15 → 19 + extended render/inspect/verify/batch/
  status schemas.

### Samples
- New pairs (`.sh` + `.ps1`, offline by default; network steps gated on
  `PDFNATIVE_TSA_URL`): `sign/06-timestamp` (replaces `06-timestamp-reserved`),
  `sign/08-ltv` (full PAdES ladder), `sign/09-multiple-signatures`,
  `inspect/08-list-signatures`, `metadata/01-update-metadata`, `compare/01-compare`,
  `batch/03-manifest` (+ `manifest/tasks.json`).
- New render JSONs (auto-discovered by `run-all.js`): `render/print/01-bleed-marks`,
  `render/print/02-viewer-prefs`, `render/chart/03-stacked-bars`,
  `render/chart/04-area-scatter`, `render/chart/05-time-axis`.

### scripts/ & workflows (veraPDF PDF/A gate)
- `scripts/generate-pdfa-corpus.mjs` — drives the **built** CLI to write a 12-file
  PDF/A corpus to `test-output/pdfa/` + `manifest.json`: 10 positive entries
  (`--strict --font latin --lang latin` across 1b/2b/2u/3b, attachments,
  headers/footers, outline, opaque watermark, incremental PAdES sign, incremental
  `metadata`) and 2 negative canaries veraPDF must reject (no-fonts render —
  ISO 19005-2 §6.2.11.4.1; `--variant table` — ISO 19005-1 §6.3.4, the table path
  cannot embed fonts from the CLI).
- `scripts/validate-pdfa.mjs` — validates each file against its claimed XMP profile
  with veraPDF and compares with `expectCompliant`. Outcomes PASS/FAIL/XFAIL/XPASS/
  INFRA/SKIP; exit 0 ok/skip · 1 conformance (incl. fatal XPASS + coverage canary) ·
  2 no corpus · 3 INFRA. `VERAPDF_REQUIRED=1` fail-closed; `VERAPDF_HOME`,
  `VERAPDF_REPORT_DIR` supported; Windows `.bat` launcher handled.
- `package.json` — new scripts `corpus:pdfa` and `validate:pdfa`.
- `.github/workflows/verapdf.yml` — **blocking** (no `continue-on-error`), pinned
  veraPDF 1.30.2 installer with SHA-256 verified before `java -jar`, report + raw
  XML uploaded as artifact and rendered in the job summary.
- `.github/workflows/publish.yml` — the same veraPDF gate repeated pre-publish.
- Zero npm dependencies added — veraPDF is an external tool, never bundled.

### Docs
- README (What's new, Highlights, Supported Features group, "PDF/A status" callout,
  Quick Start, 21-command reference, Node ≥ 22), KNOWLEDGE_BASE (§2/4/5/6/8/9/10),
  CONTRIBUTING.md (new "PDF/A validation (veraPDF)" section: scripts, exit codes,
  skip semantics, install recipes, PR checklist), CLAUDE.md, AGENTS.md, llms.txt, ROADMAP
  (v1.4.0 released; Next cleared; deferred items recorded), samples/README,
  CHANGELOG, release-notes/v1.4.0.md, CITATION.cff re-synchronised (was 1.2.0 / "six
  composable commands"), CI matrix 22/24.
- Factual corrections: `svg` blocks were wrongly documented as non-JSON-usable;
  `math` was missing from the `render --font` list.

### Tests
- `tests/helpers/der.ts` + `tests/helpers/mock-pki.ts` — offline mock PKI (root CA,
  signer with AIA/CRL-DP URLs, TSA, OCSP responder) issuing genuine DER structures,
  ported from pdfnative's own unpublished test helper; validated against the library's
  parsers.
- New/extended suites: sign (timestamp + multisig), ltv (+doc-timestamp), verify
  (digests + DocTimeStamp), inspect/annotate/pagetree (boxes preservation), render
  (charts v2 / print / strict / images), metadata, compare, batch manifest, schema.
- **600 tests, 40 files, all green** (452 in v1.3.0). Coverage above the enforced
  thresholds (statements 79 / branches 68 / functions 83 / lines 79 — unchanged).

## Independent audit (this release)

- **V1 — double-blind gap analysis (2 agents)** before implementation: full pdfnative
  ≤ 1.7.0 public surface vs planned CLI surface. Consensus finding (both auditors):
  image blocks were the only generation capability unreachable from the CLI → fixed.
  Additional accepted findings: verify/digest coherence, `/DocTimeStamp` validation,
  `annotate --password`, print-box inspection, visible-signature flags,
  `--max-inflate-size`, `render --chunk-size`, two documentation corrections. Deferred
  to ROADMAP: custom TTF loading, link annotations on existing PDFs, doctor language
  enumeration.
- **V3 — post-implementation conformance review**: two independent reviewers (factual
  accuracy of docs vs code; 2026 open-source standards) plus an arbiter judging finding
  legitimacy; accepted findings applied. (Reports summarised in this PR's discussion.)

## Validation

- `npm run typecheck:all` — clean · `npm run lint` — 0 errors ·
  `npm run test:coverage` — 600/600, thresholds met · `npm run build` — ok ·
  `npm audit --audit-level=high` — 0 vulnerabilities.
- Built-binary smoke (`node dist/cli.cjs`): `--version` = 1.4.0, `--help`,
  `schema manifest` (21 commands, `E_NETWORK`), completions include the new commands,
  and an end-to-end render → metadata → compare → inspect --signatures round-trip.
- `node samples/run-all.js` green; new `.sh`/`.ps1` samples executed offline on
  Git Bash + PowerShell.
- `npm run validate:pdfa` with veraPDF 1.30.2 installed locally: **10 PASS +
  2 XFAIL** (both negative canaries correctly rejected by the validator), exit 0.
- Zero-network guarantee in tests: mock providers injected via
  `setTimestampProvider`/`setRevocationProvider`, RFC 2606 `.invalid` URLs.

## Backward compatibility

- No existing flag, default, exit code, error code or envelope changed. All new JSON
  fields are optional/additive; `sign` without new flags follows the 1.3.x code path
  byte-for-byte.
- `sign --timestamp` was a *reserved* flag whose error message announced future
  availability — activating it is the documented contract, not a break.
- Schema `$id`s embed the CLI version and moved 1.3.0 → 1.4.0 (expected, pinned by
  tests).
- Node ≥ 22 is a support-policy change (EOL alignment + upstream engines), not an API
  change.
- Inherited pdfnative 1.7.0 byte-level changes (forms `/ToUnicode`, RTL fixes, box
  preservation) are documented in the CHANGELOG.

## Out of scope (recorded in ROADMAP)

- `optimize` (linearisation/recompression) — still blocked upstream.
- Visual `compare` — no rasteriser upstream.
- Arbitrary object `modify` — `metadata` covers the metadata slice only.
- `render --font-file` (custom TTFs), link annotations on existing PDFs, doctor
  language-pack enumeration, dedicated TSA timeout flags.

## Self-review checklist

- [x] `npm run typecheck:all` clean
- [x] `npm run lint` 0 errors
- [x] `npm run test:coverage` green, thresholds unchanged and met
- [x] `npm run build` + built-binary smoke test (`node dist/cli.cjs --help`, new
      commands, `schema manifest`)
- [x] CHANGELOG.md updated (Keep a Changelog)
- [x] No breaking change to the machine contract (envelopes, exit codes, `E_*`)
- [x] No new runtime dependency (`pdfnative` remains the only one)
- [x] Docs + samples + completions + schemas cover the whole 21-command surface
- [x] No autonomous GitHub writes — this draft is committed for human review (HITL)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
