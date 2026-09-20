# tests/fixtures — Test-only material

**⚠️ TEST-ONLY KEYS AND CERTIFICATES — NEVER USE IN PRODUCTION ⚠️**

This folder holds the fixtures the `pdfnative-cli` test suite and the sample
generator need to be deterministic without downloading anything: self-signed
key pairs and X.509 certificates for the `sign` → `verify` round-trip, a
synthetic CMYK and Gray ICC profiles for the PDF/X-4 and output-intent paths,
and the engine's build-error message corpus.

| File | Purpose |
| ---- | ------- |
| `rsa-key.pem` | RSA-2048 private key (PKCS#8) |
| `rsa-cert.pem` | Self-signed X.509 cert for the above |
| `ec-key.pem` | EC P-256 private key (SEC1) |
| `ec-cert.pem` | Self-signed X.509 cert for the above |
| `synthetic-cmyk.icc` | Synthetic ICC v2 `prtr` CMYK profile (9 968 bytes) — the output intent of every PDF/X-4 test, corpus entry and sample |
| `synthetic-gray.icc` | Synthetic ICC v2 `prtr` Gray profile (408 bytes) — the Gray output intent, and the non-CMYK PDF/X intent that triggers `PDFX_DEVICE_CMYK` |
| `pdfnative-build-errors.json` | The coherence messages pdfnative 1.8.0's builders throw (PDF/X, print geometry, OutputIntent, attachments, watermark) — each must classify as `E_INPUT` |

These fixtures are committed for deterministic CI runs (no `openssl`
dependency on the runner). The keys are **only valid for the test suite** and
must never be reused outside it; the same key pair signs the sample corpus
(`scripts/generators/derived.ts`) and the conformance corpus
(`scripts/generate-pdfa-corpus.ts`), so those outputs are reproducible.

## Provenance

- **`synthetic-cmyk.icc`** is a copy of `docs/assets/synthetic-cmyk.icc` from the
  pdfnative repository (1.8.0): a minimal, valid ICC v2 profile with the `acsp`
  signature at byte 36, device class `prtr` and colour space `CMYK`, generated
  synthetically — **not a press profile**. pdfnative 1.8.0 validates the ICC
  header before accepting an output intent, so the 128-byte stub earlier tests
  used is rejected (`outputIntent.iccProfile is not an ICC profile`). The same
  bytes ship as `samples/render/print/synthetic-cmyk.icc`.
- **`synthetic-gray.icc`** is generated in this repository by
  `scripts/lib/synthetic-gray-profile.ts` (the monochrome twin of the engine's CMYK
  generator, which ships no Gray profile): ICC v2.1, class `prtr`, colour space
  `GRAY`, XYZ connection space, tags `desc`, `cprt`, `wtpt`, `kTRC` (gamma 2.2) —
  **not a press profile**. `tests/tools/synthetic-gray-profile.test.ts` holds the
  committed bytes to the generator; the same bytes ship as
  `samples/render/print/synthetic-gray.icc`. Regenerate both copies with
  `npx tsx scripts/lib/synthetic-gray-profile.ts`. The ICC v4 variant the generator
  can also write is never committed: tests and the conformance corpus build it on
  the fly to prove that PDF/A-1b refuses it (`PDFA_ICC_PROFILE_VERSION`).
- **`pdfnative-build-errors.json`** is derived from `docs/data/errors.json →
  buildErrors` of the pdfnative repository (1.8.0), with the `${…}` placeholders
  substituted by representative values. `tests/utils/build-errors.test.ts` feeds
  every message to `classifyBuildError()`; refresh it from the engine's registry
  when the pin moves.

## Regeneration

To regenerate the key material (10-year validity, `pdfnative-cli` test subjects):

```sh
# RSA
openssl req -x509 -newkey rsa:2048 -keyout rsa-key.pem -out rsa-cert.pem \
    -days 3650 -nodes -subj "/CN=pdfnative-cli RSA Test/O=pdfnative-cli/C=FR"

# EC P-256
openssl ecparam -name prime256v1 -genkey -noout -out ec-key.pem
openssl req -x509 -new -key ec-key.pem -out ec-cert.pem \
    -days 3650 -subj "/CN=pdfnative-cli EC Test/O=pdfnative-cli/C=FR"
```

Regenerating the keys changes the signed entries of
`tests/regression/baselines/samples.sha256.json` and of the conformance
corpus: rebaseline (`npx tsx scripts/verify-samples.ts --update`) and declare it
in the release note.
