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

## In Progress

### v0.3.0 — Sign & Verify completeness

- [ ] **ECDSA signing** — wire RSA path is shipped; ECDSA path currently stubbed pending
  pdfnative `parseEcPrivateKey` (already prepared in `src/utils/keys.ts` import surface).
- [ ] **`verify` — full CMS signature-value verification** — once pdfnative exposes a
  CMS verifier or stable signed-attribute DER re-encoding API, complete `verify` so
  signature value, not just integrity, is checked.
- [ ] **Signed-PDF round-trip test fixture** — generate a real PKCS#8 RSA key + self-signed
  X.509 cert (likely via a pinned dev-dependency that `node:crypto` cannot replace) so
  `src/commands/verify.ts` regains coverage instead of being excluded.
- [ ] **`render --watch`** — watch input file and re-render on change.
- [ ] **`render --template`** — load a JSON template file, merge with stdin input.
- [ ] **OCSP / CRL revocation** for `verify` (via pdfnative once available).
- [ ] **RFC 3161 timestamp tokens** — recognition + validation in both `sign` and `verify`.

## Future Considerations

- **Long-Term Validation (LTV)** — embed validation data (cert chain + OCSP responses)
  inside the signature for archival.
- **Config file** (`.pdfnativerc.json`) — default flags, key paths, conformance level.
- **`batch` command** — render multiple JSON files in parallel.
- **Shell completions** — bash/zsh/fish completion scripts.
- **`merge` / `encrypt` / `modify` standalone commands** — once pdfnative exposes the
  matching primitives.
