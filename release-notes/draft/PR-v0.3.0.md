# v0.3.0 — Full Sign & Verify (ECDSA, CMS, RFC 3161) + render --watch / --template / --font

> **Branch:** `release/v0.3.0` → `main`
> **Type:** Minor release (additive, fully backward-compatible with v0.2.0)
> **pdfnative bump:** `^1.0.0` → `^1.1.0`

## Summary

Closes the digital-signature story. Sign and verify are now end-to-end:

- ECDSA-SHA256 alongside RSA-SHA256.
- Full CMS / PKCS#7 cryptographic verification — signature value, message
  digest, certificate chain, trust root, RFC 3161 timestamp presence.
- An automatic AcroForm signature-placeholder injector that lets users sign
  any `pdfnative render` output in one shell command.

`render` gains three iteration ergonomics: `--watch`, `--template`, and
`--font latin|emoji` shortcuts.

## Changes

### `src/commands/sign.ts`
- `--algorithm ecdsa-sha256` is now fully wired (loads SEC1 / PKCS#8 P-256 keys).
- Auto-injects a CMS `/Sig` placeholder (`/Contents <00…00>`, `/ByteRange [0 0 0 0]`,
  AcroForm `/SigFlags 3`, signature widget) on PDFs that lack one.
- Calls `ensureCryptoReady()` before any pdfnative key parsing.

### `src/commands/verify.ts` + `src/utils/cms-verify.ts`
- New report fields: `signatureValid`, `signatureAlgorithm`, `timestampPresent`.
- Replaces all `pdfnative.derDecode` calls with a new absolute-offset DER walker
  (`src/utils/asn1-walk.ts`) — works around an upstream bug where `node.offset`
  is relative to an intermediate parent buffer at depth ≥ 2.
- Wraps every embedded CMS certificate in `correctCertificateIssuerRaw` to
  fix pdfnative's broken `issuer.raw` / `subject.raw` slices.

### `src/commands/render.ts`
- `--watch <input>` (200 ms debounce, stderr-only logs, requires file `--output`).
- `--template <file.json>` (deep-merge under stdin / `--input`; arrays replace).
- `--font <name>` (allow-list `latin` / `emoji`, repeatable, registered through
  pdfnative `registerFont` from the package's bundled font modules).

### New files
- `src/utils/asn1-walk.ts` — minimal absolute-offset DER walker.
- `src/utils/cert-fix.ts` — recovers correct issuer/subject DN slices from TBS bytes.
- `src/utils/sign-placeholder.ts` — single-pass incremental update placeholder injector.
- `tests/fixtures/{rsa,ec}-{key,cert}.pem` — TEST-ONLY self-signed P-256 / RSA-2048 material.
- `tests/integration/sign-verify-roundtrip.test.ts` — RSA + ECDSA + tampering-detection roundtrips.

## Validation

- `npm run lint` → clean.
- `npm run typecheck:all` → clean.
- `npm test` → **131 / 131 passing** (was 121 in 0.2.0).
- `npm run test:coverage` → thresholds met
  (statements 77.1 %, branches 74.4 %, functions 94.4 %, lines 77.1 %).
- `npm run build` → ESM 79.84 KB, CJS 80.57 KB, types emitted.
- Smoke: `render → sign → verify` end-to-end produces
  `integrity: true, signatureValid: true, signatureAlgorithm: "rsa-sha256"`,
  ECDSA path identical with `ecdsa-sha256`.

## Backward compatibility

- **No flag was removed or renamed.**
- **No exit code semantics changed.**
- Every v0.2.0 invocation continues to work unchanged.
- `verify` JSON output gained three keys; existing keys are unmodified.

## Out of scope (tracked for v0.4.0)

- Full RFC 3161 timestamp validation (TSA chain + MD compare).
- OCSP / CRL revocation.
- LTV / PAdES-LTA.
- Custom font registration via `--font name=<path>`.

## Self-review checklist

- [x] No `console.log` anywhere; all output via `process.stdout.write` /
      `process.stderr.write`.
- [x] No key material in error messages (signing-error catch deliberately
      drops underlying causes).
- [x] Path-traversal validation preserved on every new file path arg.
- [x] 50 MB JSON input cap preserved.
- [x] All new exports either have JSDoc or are marked `@internal`.
- [x] TypeScript strict; no `any`; new types `readonly` where applicable.
- [x] ESM-first; all internal imports use `.js`.
- [x] `pdfnative` is still the **only** runtime dependency.
