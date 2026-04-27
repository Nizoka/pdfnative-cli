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

## In Progress

### v0.2.0 — Enhanced inspect

- [ ] **`inspect --verbose`** — raw PDF object tree output for debugging
- [ ] **`inspect --check pdfa`** — dedicated PDF/A conformance check exit code (0=pass, 1=fail)
- [ ] **`inspect --pages`** — per-page metadata (size, annotations, form fields)

### v0.3.0 — Render enhancements

- [ ] **`render --watch`** — watch input file and re-render on change
- [ ] **`render --template`** — load a JSON template file, merge with stdin input
- [ ] **Multi-page streaming progress** — report progress to stderr during `--stream` renders

## Future Considerations

- **Config file** (`.pdfnativerc.json`) — default flags, key paths, conformance level
- **`batch` command** — render multiple JSON files in parallel
- **Shell completions** — bash/zsh/fish completion scripts
- **`verify` command** — verify a signed PDF's signature chain without signing
