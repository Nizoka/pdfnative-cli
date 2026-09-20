# <concise issue or pull-request title>

<!--
Copy this file to .github/drafts/<slug>.md (git-ignored; only README.md and
TEMPLATE.md are tracked), fill every section, then validate it:

    pdfnative govern verify-issue .github/drafts/<slug>.md

The verifier fails on a proposed runtime dependency or a missing
reproduction code block, and warns on a missing Environment / Expected
section. A passing check is necessary, not sufficient: a human reviews the
draft and submits it under their own GitHub identity (.github/AGENT_RULES.md).
-->

## Type

<!-- Bug / Enhancement / Documentation / Governance -->

## Environment

- pdfnative-cli version: <!-- pdfnative --version -->
- pdfnative version: <!-- pdfnative doctor --format json → checks[].name === "pdfnative" -->
- Node.js version: <!-- node --version (the CLI needs >= 22) -->
- OS:

## Expected behavior

<!-- What you expected to happen. -->

## Actual behavior

<!-- What actually happened: exit code, the stderr envelope under --json, the error code (E_*). -->

## Minimal reproduction

```bash
# A self-contained CLI invocation (or a Node script driving the built binary)
# that fails or regresses locally BEFORE this draft is proposed. Include the
# exit code and the --json envelope it produced.
pdfnative --json <command> --input <file> …
```

## Affected packages

<!-- pdfnative-cli only, or also pdfnative / pdfnative-mcp / pdfnative-react (name the engine symbol when the fix is upstream). -->

## Compliance report

- [ ] Zero-dependency confirmed (no new runtime dependency — `pdfnative` stays the only one)
- [ ] Reproduction command executed locally (command and result quoted above)
- [ ] Duplicate search performed (open + closed issues and pull requests)
- [ ] Affected packages identified
- [ ] Contract preserved (stdout artifact / stderr diagnostics, exit 0/1/2, stable `E_*` codes) — or the intentional change is named
- [ ] User reminded that submission publishes under their GitHub identity
