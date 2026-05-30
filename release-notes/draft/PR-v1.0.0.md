# v1.0.0 — Verify-side Long-Term Validation (RFC 3161 + OCSP + CRL) + batch / completion / config

> **Branch:** `release/v1.0.0` → `main`
> **Type:** First stable release (additive, fully backward-compatible with v0.3.0)
> **pdfnative bump:** `^1.1.0` → `^1.2.0`

## Summary

First stable release. Completes the **verify-side Long-Term Validation (LTV)**
story and raises the CLI to top-tier 2026 ergonomics:

- **RFC 3161 timestamp validation (PAdES-T)** — TSA SignerInfo signature,
  `TSTInfo` message digest, and `messageImprint` binding all verified; TSA
  chain built and trust-evaluated.
- **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — parsed from the PDF `/DSS`
  offline, or fetched online behind an **SSRF guard**. Offline by default.
- **`batch`, `completion`, `.pdfnativerc.json`** and global
  `--quiet` / `--no-color` / `--version --json` flags.
- **Smart tables** + page-by-page streaming from pdfnative 1.2.0.
- **Both remaining upstream workarounds removed** (`cert-fix`,
  `sign-placeholder`) — now fixed in pdfnative 1.2.0.

## Changes

### `src/commands/verify.ts`
- Async revocation loop; new flags `--revocation offline|online|disabled`
  (default `offline`) and `--revocation-policy soft-fail|strict` (default
  `soft-fail`), both validated.
- New report fields: `timestampValid`, `timestampTime`, `tsaSubject`,
  `revocationChecked`, `revocationStatus`, `revocationSource`,
  `revocationMethod`, `revocationRevokedAt`. `revocationOk()` gates
  `allValid` under `strict`.

### `src/commands/sign.ts`
- `--timestamp <tsa-url>` reserved (validates http(s); errors clearly that
  PAdES-T timestamp embedding is upstream-blocked, exit code 2).

### `src/commands/render.ts`
- Smart-table flags `--table-wrap`, `--repeat-header`, `--zebra`,
  `--min-row-height`, `--cell-padding`; `--stream-page-by-page`; PDF/A targets
  sourced from `PDF_A_CONFORMANCE_TARGETS`.

### New files
- `src/utils/timestamp-verify.ts` — RFC 3161 timestamp-token validation (PAdES-T).
- `src/utils/cert-chain.ts` — shared X.509 chain construction + trust evaluation.
- `src/utils/revocation.ts` — OCSP (RFC 6960) + CRL (RFC 5280), embedded `/DSS` + online.
- `src/utils/fetch-guard.ts` — SSRF-guarded HTTP(S) client for opt-in online revocation.
- `src/utils/config.ts` — `.pdfnativerc.json` discovery + flag-default merge.
- `src/utils/colors.ts` — `NO_COLOR`/TTY-aware ANSI helper.
- `src/commands/batch.ts` — parallel directory render reusing `render()`.
- `src/commands/completion.ts` — bash/zsh/fish completion script emitter.
- `tests/utils/{config,colors,fetch-guard,cms-verify,revocation,timestamp-verify,cert-chain}.test.ts`,
  `tests/commands/{completion,batch}.test.ts`.
- `release-notes/v1.0.0.md`, `samples/{render/table-smart,batch,completion,config}/*`,
  `samples/verify/05-revocation.*`.

### Removed
- `src/utils/cert-fix.ts` and `src/utils/sign-placeholder.ts` (and their tests) —
  upstream-fixed in pdfnative 1.2.0. `sign` uses `addSignaturePlaceholder`;
  `verify`/`keys` use the corrected `parseCertificate` directly.

### `src/index.ts`
- Wires config (`loadConfig`/`applyConfigDefaults`, `--config`/`--no-config`),
  global flags, and registers `batch` + `completion` with usage text.

## Validation

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm test` → **226 / 226 passing** (was 131 in 0.3.0).
- `npm run test:coverage` → thresholds met
  (statements 80.1 %, branches 69.7 %, functions 84.4 %, lines 82.2 % — vitest 4
  AST-aware measurement; see note below).
- `npm audit` → **0 vulnerabilities** (test toolchain upgraded to vitest 4).
- `npm run build` → ESM 124.60 KB, CJS 125.31 KB, types emitted.
- Smoke: `version --json`, `completion bash|zsh|fish`, `batch` (dir → PDFs),
  config (letter via `.pdfnativerc.json` vs A4 with `--no-config`),
  `sign --timestamp` errors with exit 2, smart-table sample renders.

### Coverage note

The integration-only PKI modules — `cms-verify`, `revocation`,
`timestamp-verify`, `fetch-guard` — are excluded from coverage thresholds
(consistent with the existing `verify.ts` exclusion). Their happy paths need
live OCSP responder / CRL signer / TSA token / DSS fixtures and a reachable
public host; testable entry points (request builders, `isBlockedAddress`,
`verifySignedStructure` via self-signed fixtures, guard rejections) are unit-
tested. Thresholds were re-baselined to vitest 4's AST-aware V8 measurement,
which counts branches/functions more granularly than vitest 2 (same 226 tests,
same code — not a real coverage regression).

### Security & dependency hardening

- **SHA-1 / OCSP `CertID` (CodeQL false positive).** The lone SHA-1 usage is the
  OCSP `CertID` (RFC 6960 §B.1 default), a non-security identifier over the
  issuer's public DN/key; OCSP trust comes from the responder signature, verified
  separately. Call sites are annotated and the rationale is documented in
  [SECURITY.md](../../SECURITY.md). The CodeQL `js/weak-cryptographic-algorithm`
  alert is dismissed as *"Won't fix"* with this justification.
- **Test toolchain: vitest / @vitest/coverage-v8 2 → 4** — clears every known
  dev-dependency advisory (`npm audit` → 0). Dev-only; the published package still
  ships `pdfnative` as its only runtime dependency.
- **Pinned-action bumps** — `codeql-action` 4.36.0, `setup-node` 6.4.0,
  `upload-artifact` 7.0.1, `scorecard-action` 2.4.3; `typescript-eslint` 8.59.2.
  Resolves the open Dependabot PRs (see release checklist).

## Backward compatibility

- **No flag was removed or renamed.**
- **No exit code semantics changed.**
- Every v0.3.0 invocation continues to work unchanged.
- `verify` JSON output gained LTV keys; existing keys are unmodified.
  `timestampPresent` is still reported.

## Out of scope (upstream-coordinated)

- **Sign-side LTV** — embedding a TSA timestamp into the CMS (PAdES-T) and
  writing the DSS at signing time. Belongs in `pdfnative`; not exposed by 1.2.0.
  `sign --timestamp` is reserved and errors clearly.
- PAdES-LT / LTA *production*.

## Self-review checklist

- [x] No `console.log` anywhere; all output via `process.stdout.write` /
      `process.stderr.write`.
- [x] No key material in error messages (sign error replaced with fixed string).
- [x] Online revocation is opt-in and passes the SSRF guard (scheme allow-list,
      private/loopback/link-local/CGNAT/multicast IPv4+IPv6 blocking, no
      redirects, timeout + size caps).
- [x] Unverifiable revocation data yields `unknown`, never `good`.
- [x] Path-traversal validation preserved on every file path arg.
- [x] 50 MB JSON input cap + 50 MiB ASN.1 node cap preserved.
- [x] TypeScript strict; no `any`; new types `readonly` where applicable.
- [x] ESM-first; all internal imports use `.js`.
- [x] `pdfnative` is still the **only** runtime dependency.
