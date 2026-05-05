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
  when a signature-timestamp attribute is found. **Validation deferred** — see v0.4.0.
- [x] **`pdfnative` bumped** to `^1.1.0` (was `^1.0.5`).

## In Progress

### v0.4.0 — Long-Term Validation (LTV) & revocation

- [ ] **Full RFC 3161 timestamp validation** — verify TSA-token signature, certificate
  chain, and asserted time as part of `verify --strict`.
- [ ] **OCSP responder support** — online and embedded responses inside `verify`.
- [ ] **CRL support** — fetch / parse CRLs for offline revocation checks.
- [ ] **PAdES-B-LT / B-LTA** — emit DSS dictionaries and document timestamps when signing.
- [ ] **`verify --revocation-policy`** — strict / soft-fail / disabled selector.

## Future Considerations

- **Long-Term Validation (LTV)** — embed validation data (cert chain + OCSP responses)
  inside the signature for archival.
- **Config file** (`.pdfnativerc.json`) — default flags, key paths, conformance level.
- **`batch` command** — render multiple JSON files in parallel.
- **Shell completions** — bash/zsh/fish completion scripts.
- **`merge` / `encrypt` / `modify` standalone commands** — once pdfnative exposes the
  matching primitives.
