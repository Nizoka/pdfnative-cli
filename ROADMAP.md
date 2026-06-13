# Roadmap

This document outlines the planned development direction for pdfnative-cli. Priorities may shift based on community feedback.

## Released

- [x] **`render` command** — JSON → PDF, streaming, PDF/A conformance flag
- [x] **`sign` command** — RSA/ECDSA digital signatures via env vars or file args
- [x] **`inspect` command** — PDF metadata, conformance, signatures (JSON/text output)
- [x] **Zero-dep arg parser** — custom lightweight parser, no third-party dep
- [x] **Security hardening** — path traversal validation, JSON size cap, no key logging
- [x] **NPM provenance** — OIDC signed builds
- [x] **Full governance** — CodeQL, Scorecard, Dependabot, CODEOWNERS

### v0.2.0 — Full pdfnative coverage _(released 2026-04-28)_

- [x] **`render` hybrid layout model** — flags + `--layout file.json`, full
  `PdfLayoutOptions` surface: encryption (AES-128/256), watermarks (text & image),
  headers/footers with `{page}/{pages}/{date}/{title}`, page size & margins, compression,
  PDF/A-3 attachments, multi-language fonts (`--lang`), `--variant table` for `PdfParams`.
- [x] **`sign --reason / --name / --location / --contact / --signing-time / --cert-chain`** —
  signature metadata + intermediate-CA chain support.
- [x] **`inspect --verbose / --pages / --check pdfa|signed|encrypted`** — observability
  and CI assertions.
- [x] **`verify` command (NEW)** — integrity + cert-chain + trust verification
  (CMS-signature-value verification deferred — see v0.3.0 below).
- [x] **`--conformance` deprecated** in favour of `--tagged`.
- [x] **`pdfnative` bumped** to `^1.0.5`.

### v0.3.0 — Sign & Verify completeness _(released 2026-05-05)_

- [x] **ECDSA-SHA256 signing** — full P-256 SEC1 / PKCS#8 key parsing in
  [src/utils/keys.ts](src/utils/keys.ts); selectable via `sign --algorithm ecdsa-sha256`.
- [x] **`verify` — full CMS signature-value verification** — RSA-SHA256 and
  ECDSA-SHA256 cryptographic signature checks with re-encoded `signedAttrs`,
  `messageDigest` integrity comparison, certificate-chain construction, and
  trust-anchor evaluation.
- [x] **Signed-PDF round-trip integration test** —
  [tests/integration/sign-verify-roundtrip.test.ts](tests/integration/sign-verify-roundtrip.test.ts)
  generates real PEM fixtures (RSA + EC) and asserts `signatureValid: true`.
- [x] **`render --watch`** — watch input file and re-render on change (200 ms debounce).
- [x] **`render --template`** — load a JSON template file, deep-merge with stdin/`--input`.
- [x] **`render --font`** — register bundled `latin` / `emoji` font shortcuts.
- [x] **RFC 3161 timestamp recognition** — `verify` reports `timestampPresent: true`
  when a signature-timestamp attribute is found. **Validation deferred** — see v1.0.0.
- [x] **`pdfnative` bumped** to `^1.1.0` (was `^1.0.5`).

### v1.0.0 — LTV verification, smart tables & CLI excellence _(released 2026)_

- [x] **`pdfnative` bumped** to `^1.2.0`; removed the two upstream workarounds
  (`cert-fix`, `sign-placeholder`) now fixed in pdfnative — uses
  `addSignaturePlaceholder` and the corrected `parseCertificate` directly (#45, #46).
- [x] **Full RFC 3161 timestamp validation (PAdES-T)** — `verify` cryptographically
  verifies the TSA-token signature, the `messageImprint` binding to the document
  signature, the TSA certificate chain, and reports `genTime` / `tsaSubject`.
- [x] **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded `/DSS` (offline,
  default) and opt-in online fetching via AIA / CDP URLs through an SSRF-guarded
  client. `verify --revocation offline|online|disabled` and
  `--revocation-policy soft-fail|strict`.
- [x] **Smart tables** — `render` exposes pdfnative 1.2.0 `TableBlock` smarts via both
  `--layout` JSON and dedicated flags (`--table-wrap`, `--repeat-header`, `--zebra`,
  `--min-row-height`, `--cell-padding`).
- [x] **Page-by-page streaming** — `render --stream-page-by-page` (TOC- and
  `{pages}`-compatible, unlike single-pass `--stream`).
- [x] **`.pdfnativerc.json` config file** — discovery cwd-upward, global + per-command
  sections; precedence flags > env > config.
- [x] **`batch` command** — parallel directory rendering reusing the render pipeline.
- [x] **Shell completions** — `completion bash|zsh|fish`.
- [x] **Global flags** — `--quiet`, `--no-color` (+`NO_COLOR`), `--version --json`.

## In Progress

### v1.1.0 — pdfnative 1.3.0 coverage _(released 2026-06-30)_

- [x] **`pdfnative` bumped** to `^1.3.0` (was `^1.2.0`).
- [x] **22 Unicode scripts + COLRv1 colour emoji** — `render --font` allow-list expanded to
  every bundled pdfnative font, including the six new 1.3.0 scripts (Telugu `te`, Sinhala
  `si`, Tibetan `bo`, Khmer `km`, Myanmar `my`, Amharic/Ethiopic `am`) and `color-emoji`.
- [x] **`render --stream-true`** — true constant-memory streaming
  (`buildDocumentPDFStreamTrue` / `buildPDFStreamTrue`); byte-identical to the buffered
  builders, lowest peak memory.
- [x] **`render --max-blocks <n>`** — expose `layout.maxBlocks` (default 100 000).
- [x] **`inspect --pdfua` / `--check pdfua`** — read-only PDF/UA (ISO 14289-1) structural
  validation via `validatePdfUA`, for CI accessibility gates.
- [x] **Agent-native contract** — global `--json` status/error envelopes, stable `E_*`
  error codes, a `--dry-run` validation mode for `render` / `sign` / `batch`, and a new
  `schema` command exporting versioned JSON Schemas. Documented in `AGENTS.md`.
- [x] **Supply-chain transparency** — CycloneDX SBOM attached to each release; OpenSSF
  Scorecard badge published.

### Next — Sign-side LTV (PAdES-T / LT / LTA), upstream-coordinated

Sign-side LTV is **PDF-writing logic that belongs in pdfnative**; the CLI exposes the
surface and will light it up once the upstream primitives ship.

- [ ] **`sign --timestamp <tsa-url>`** — embed an RFC 3161 timestamp token into the CMS
  at signing time. Flag is reserved (errors clearly today); blocked on pdfnative
  timestamp-embedding support.
- [ ] **PAdES-B-LT / B-LTA** — emit `/DSS` dictionaries and document timestamps when
  signing. Blocked on pdfnative DSS-writing primitives.
- [ ] **OCSP / CRL stapling at signing time** — collect and embed revocation data into
  the signed PDF for archival.


## Future Considerations

- **`merge` / `encrypt` / `modify` standalone commands** — once pdfnative exposes the
  matching primitives.
- **Additional shell integrations** — PowerShell completion, man pages.
