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
| `pdfnative-build-errors.json` | The 33 messages pdfnative ≥ 1.9.0 documents (PDF/X and the dual claim, spot colours, print geometry, OutputIntent, attachments, watermark; plus the annotation-type check and `PdfStreamLimitError`) — every builder message must classify as `E_INPUT` |
| `minimal-gray.jp2`, `minimal-rgb.jp2`, `minimal-rgba.jp2`, `minimal.j2k` | Minimal JPEG 2000 images (8 × 8, flat mid-grey codestreams; the `rgba` one carries an opacity channel) — the `/JPXDecode` pass-through of pdfnative ≥ 1.9.0 and the `PDFA1_JPX_IMAGE` / `PDFA_JPX_IMAGE` triggers |

These fixtures are committed for deterministic CI runs (no `openssl`
dependency on the runner). The keys are **only valid for the test suite** and
must never be reused outside it; the same key pair signs the sample corpus
(`scripts/generators/derived.ts`) and the conformance corpus
(`scripts/generate-pdfa-corpus.ts`), so those outputs are reproducible.

## Provenance

- **`synthetic-cmyk.icc`** is a copy of `docs/assets/synthetic-cmyk.icc` from the
  pdfnative repository (1.8.0): a minimal, valid ICC v2 profile with the `acsp`
  signature at byte 36, device class `prtr` and colour space `CMYK`, generated
  synthetically — **not a press profile**. pdfnative ≥ 1.8.0 validates the ICC
  header before accepting an output intent, so the 128-byte stub earlier tests
  used is rejected (`outputIntent.iccProfile is not an ICC profile`). The same
  bytes ship as `samples/render/print/synthetic-cmyk.icc`.
- **`synthetic-gray.icc`** is the output of `buildSyntheticGrayProfile()` on
  `pdfnative/tools` (pdfnative ≥ 1.9.0, #86; the generator the CLI carried in
  1.5.0 wrote the same bytes and is gone): ICC v2.1, class `prtr`, colour space
  `GRAY`, XYZ connection space, tags `desc`, `cprt`, `wtpt`, `kTRC` (gamma 2.2) —
  **not a press profile**. `tests/tools/synthetic-profiles.test.ts` holds both
  committed copies (this one and `samples/render/print/synthetic-gray.icc`) and
  the two CMYK copies to the engine builders, byte for byte. The ICC v4 variant is
  never committed: `scripts/lib/icc-canary.ts` patches the header's version bytes
  on the fly so tests and the conformance corpus can prove that PDF/A-1b refuses
  it (`PDFA_ICC_PROFILE_VERSION`).
- **`pdfnative-build-errors.json`** is derived from `docs/data/errors.json →
  buildErrors` of the pdfnative repository (1.9.0), with the `${…}` placeholders
  substituted by representative values. `tests/utils/build-errors.test.ts` feeds
  every builder message (`thrownBy` starting with `buildDocumentPDFBytes`) to
  `classifyBuildError()`; the annotation-type check and the stream-limit error are
  classified elsewhere (`annotate` validates the type first; `mapPdfError` matches
  `PdfStreamLimitError` by instance). Refresh it from the engine's registry when
  the pin moves.
- **`minimal-*.jp2` / `minimal.j2k`** are written by the engine's own
  deterministic helpers (`scripts/helpers/images.ts` of the pdfnative repository
  at 1.9.0: `makeMinimalJP2(components, { alpha, size: 8 })` and
  `makeMinimalJ2K(1, 8)`) — a JP2 signature box, file-type and header boxes and a
  minimal codestream the engine passes through without decoding. Regenerate them
  with the same calls; their bytes are held by the JPEG 2000 render tests.

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
