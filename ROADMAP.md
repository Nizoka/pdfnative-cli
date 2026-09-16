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
- [x] **Smart tables** — `render` exposes the engine's `TableBlock` smarts (pdfnative ≥ 1.2.0) via both
  `--layout` JSON and dedicated flags (`--table-wrap`, `--repeat-header`, `--zebra`,
  `--min-row-height`, `--cell-padding`).
- [x] **Page-by-page streaming** — `render --stream-page-by-page` (TOC- and
  `{pages}`-compatible, unlike single-pass `--stream`).
- [x] **`.pdfnativerc.json` config file** — discovery cwd-upward, global + per-command
  sections; precedence flags > env > config.
- [x] **`batch` command** — parallel directory rendering reusing the render pipeline.
- [x] **Shell completions** — `completion bash|zsh|fish`.
- [x] **Global flags** — `--quiet`, `--no-color` (+`NO_COLOR`), `--version --json`.

## Recent releases

<!-- The release history below quotes the engine version and the counts of its day; verify-docs:allow version-token / stale-token markers keep it verbatim. -->

<!-- verify-docs:allow version-token -->
### v1.1.0 — pdfnative 1.3.0 coverage _(released 2026-06-30)_

- [x] **`pdfnative` bumped** to `^1.3.0` (was `^1.2.0`).
<!-- verify-docs:allow stale-token -->
- [x] **22 Unicode scripts + COLRv1 colour emoji** — `render --font` allow-list expanded to
<!-- verify-docs:allow version-token -->
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

<!-- verify-docs:allow version-token -->
### v1.2.0 — pdfnative 1.5.0: page-tree, annotations & governance _(released 2026-07-06)_

- [x] **`pdfnative` bumped** to `^1.5.0` (was `^1.3.0`).
- [x] **`merge` command** — concatenate PDFs via `mergePdfs` (pdfnative ≥ 1.5.0)
  (`--drop-annotations`, `--max-output-size`).
- [x] **`split` command** — split one PDF into many via `splitPdf` (per-page default or
  per-range `--pages`; `--output-dir`, `--prefix`).
- [x] **`extract` command** — pull selected pages via `extractPages` (1-based `--pages`,
  order preserved, repeats allowed).
- [x] **`annotate` command** — attach markup annotations (`createModifier` +
  `buildAnnotationBody`) with an incremental save so existing signatures stay valid.
- [x] **`govern` command** — surface pdfnative's AI-governance / HITL contract
  (`rules` / `policy` / `verify-issue`); gates drafts with the new `E_POLICY` code.
- [x] **`render --outline`** — PDF bookmarks (`auto` from headings or an explicit
  `OutlineItem[]` tree).
- [x] **`render --font math`** — bundled Noto Sans Math for math/technical symbols.
- [x] **`render --inspect-layout` / `--debug-layout`** — layout introspection report and
  debug-guide overlay.
- [x] **Native constant-time signing** — `sign` uses `node:crypto` by default;
  `--pure-crypto` opts out.
- [x] **`inspect --annotations` + page labels** — list markup/link annotations and report
  `/PageLabels`.
- [x] **`schema annotate` / `schema govern-verify`** — new agent-validation subjects.

<!-- verify-docs:allow version-token -->
### v1.3.0 — pdfnative 1.6.0: text, forms, encryption & charts _(released 2026-07-24)_

- [x] **`pdfnative` bumped** to `^1.6.0` (was `^1.5.0`).
- [x] **`extract-text` command** — reading-order Unicode text via `extractText`
  (`--format text|json|ndjson`, `--pages`, `--runs`, `--password`, `--max-length`). NDJSON
  and `--summary`/`--fields` make it agent/RAG-native. No OCR.
- [x] **`fill` command** — fill and/or flatten existing AcroForms via `fillForm` /
  `flattenForm` with an incremental save (existing signatures stay valid).
- [x] **`encrypt` / `decrypt` commands** — AES-128/256 re-encryption and transparent
  decryption via the engine's page-tree re-encryption (pdfnative ≥ 1.6.0; Future Consideration, now shipped).
- [x] **`render` native charts** — the `chart` document block (bar/barH/line/pie/donut) as
  pure PDF path operators, tagged `/Figure`.
- [x] **`merge`/`split`/`extract` — `--password` / `--encrypt` / `--stream`** — encrypted
  sources, output re-encryption, and constant-memory streaming (`stream*` variants).
- [x] **`inspect --form-fields` / `--encryption` / `--password`** — list form fields, report
  the encryption scheme, and open encrypted documents.
- [x] **Agent capability manifest** — `schema manifest` + repo `llms.txt`; new schema subjects
  `extract-text` / `fill` / `status`; new stable `E_PASSWORD` error code.
- [x] **PowerShell completion** — `completion powershell`.
- [x] **`CLAUDE.md`** — Claude Code contributor guide.
- [x] **`fill --export`** — dump an AcroForm's current values as a `--data`-shaped JSON map
  (read → edit → fill round-trip).
- [x] **`doctor` command** — offline environment/capability preflight (CLI/Node/pdfnative
  versions, Web Crypto CSPRNG, command count); text or `--json`, exit 0/1.
- [x] **`encrypt` / `decrypt --stream`** — constant-memory streaming parity with the
  page-tree commands.
- [x] **Unified `render` encryption flags** — `render` now accepts `--encrypt [aes-128|aes-256]`
  / `--owner-password` / `--user-password` / `--permissions` (same vocabulary as
  merge/split/extract); the `--encrypt-*` flags remain as aliases.
- [x] **fix** — `render --encrypt` was a silent no-op (help documented flags the code didn't
  read); it now encrypts. And `schema` / `--version` were broken in the published binary
  (bundle-relative `package.json` path); version resolution is now bundle-safe. An empty
  env password no longer overrides an explicit `--password`.

### v1.4.0 — PAdES B-T/B-LT/B-LTA, compare, metadata & manifest pipelines _(released 2026-08-26)_

- [x] **`pdfnative` bumped** to `^1.7.0` (was `^1.6.0`); **Node ≥ 22** (Node 20 is EOL).
- [x] **`sign --timestamp <tsa-url>` (PAdES B-T)** — the formerly reserved flag now embeds a
  verified RFC 3161 timestamp token in the CMS unsigned attributes at signing time
  (`signPdfBytesWithTimestamp` + a CLI-injected, SSRF-guarded TSA provider). Plus
  `--timestamp-digest sha256|sha384|sha512` and `--timestamp-nonce <hex>`.
- [x] **`sign` — profiles, digests, placement & multiple signatures** — `--profile pkcs7|pades`
  (ETSI.CAdES.detached, PAdES B-B), `--digest sha256|sha384|sha512` (RSA), and
  `--allow-multiple` / `--field-name` / `--signature-rect` / `--signature-page` /
  `--placeholder-bytes` for appending additional signature fields.
- [x] **`ltv` command (PAdES B-LT)** — `collect` (fetch OCSP/CRL, **requires `--online`**) /
  `embed` (offline, air-gap friendly) / `add` (both in one pass); writes `/DSS` + `/VRI` via
  `collectValidationInfo` / `embedValidationInfo` / `addValidationInfo`.
- [x] **`doc-timestamp` command (PAdES B-LTA)** — appends a `/DocTimeStamp` signature field
  (SubFilter `/ETSI.RFC3161`) as an incremental revision via `addDocumentTimestamp`;
  `--url` is the explicit network opt-in.
- [x] **`verify` — LTV-era upgrades** — SHA-384/512 CMS digests, per-signature `fieldName`,
  and `/DocTimeStamp` revisions validated as RFC 3161 tokens (`isDocTimestamp: true`).
- [x] **`metadata` command** — update `/Info` + XMP (title/author/subject/keywords/modDate)
  with an incremental save that keeps existing signatures valid (`modifier.updateMetadata`).
- [x] **`compare` command** — text + structural diff of two PDFs (`--mode`, `--tolerance`,
  `--ignore-whitespace`, `--pages`, per-side passwords); identical → exit 0, differences →
  exit 1 with stable `E_CHECK_FAILED`. Visual/pixel diffing stays out of scope (no rasteriser).
- [x] **`batch --manifest tasks.json`** — declarative multi-command pipelines (`@id` output
  references, a 14-command whitelist, `--allow-network` gate, `--continue-on-error`);
  Future Consideration, now shipped.
- [x] **`render` — print production & charts v2** — `layout.print` (bleed/trim/art/crop boxes,
  printer's marks, `userUnit`), `outputIntent` (ICC RGB), `viewerPreferences` (duplex,
  `pickTrayByPDFSize`, `printPageRange`, `numCopies`), `params.metadata.trapped`; charts grow
  to 9 types (`stackedBar`, `stackedBarH`, `area`, `scatter`) with `axis2`, `xAxis`
  `category|linear|time`, log scale, `dataLabels`, `labelStride`/`labelRotation`.
- [x] **`render` — PDF/A diagnostics + images** — `--strict` escalates conformance diagnostics
  to a pre-output error (otherwise stderr warnings + a `diagnostics[]` array in the `--json`
  envelope); `image` blocks are now JSON-usable via `src` (path) / `dataBase64`; `--chunk-size`
  for the streaming modes.
- [x] **`inspect` — signature inventory & print boxes** — `--signatures` (via `listSignatures`),
  `--check "signatures>=N"`, per-page Bleed/Trim/Art boxes + `userUnit`, `metadata.trapped`;
  **fix**: the per-page `signatures`/`formFields` counters always reported 0.
- [x] **`annotate --password`** — annotate encrypted PDFs (appended objects encrypted under the
  existing scheme).
- [x] **Global `--max-inflate-size`** — anti-zip-bomb cap on any single decompressed PDF stream
  (default 100 MiB) via `setMaxInflateOutputSize`.
- [x] **Page-box preservation** — `merge`/`split`/`extract` now preserve Bleed/Trim/Art boxes
  and `/UserUnit` (pdfnative ≥ 1.7.0).
- [x] **Agent surface** — new stable `E_NETWORK` code; schema subjects `metadata`, `ltv-data`,
  `compare`, `batch-manifest` (19 total).
- [x] **Offline mock-PKI test infrastructure** — `tests/helpers/mock-pki.ts` runs a real
  RFC 3161 TSA + OCSP/CRL responder in-process, so the network paths are tested without
  touching the network.
- [x] **Blocking veraPDF PDF/A gate** — `npm run validate:pdfa` over a 12-file manifested
  corpus (10 positives + 2 negative canaries with expected ISO 19005 clauses), blocking in
  CI (`verapdf.yml`, pinned installer with verified SHA-256) and again before every
  `npm publish`.

### v1.5.0 — typography, 27 scripts, CMYK & PDF/X-4 _(released 2026-09-17)_

- [x] **`pdfnative` bumped** to `^1.8.0` (was `^1.7.0`) — every 1.8.0 feature exposed.
- [x] **Typography** — `layout.typography` passthrough (widows/orphans, `keepWithNext`,
  splittable paragraphs, justify, optical margins, soft hyphens, punctuation spacing + unit
  binding, kerning, OpenType features, exact base-14 metrics) plus `--split-paragraphs`,
  `--keep-headings-with-next`, `--kerning`, `--font-features`; nested `typography` /
  `outputIntent` merge one level between flags, `--layout` and the document.
- [x] **CMYK & PDF/X-4** — CMYK colours everywhere, printer's `colourBars`, `render --pdfx pdfx4
  --output-intent-icc --output-intent-id --trapped`, coherence pre-checks, `PDFX_*` diagnostics
  under `--strict`, envelope `pdfx`; `inspect --pdfx` / `--check pdfx` / `pdfxConformance`;
  `validate:pdfx` over a 3-file PDF/X corpus (incl. a negative canary) in the gate.
- [x] **27 Unicode scripts + `--font-file`** — `lo nod khb tdd cjm`, the `ha yo ig sw` aliases,
  custom TTF/OTF fonts from disk (validated, capped, never from JSON), and font embedding on
  `--variant table` (closes the table-variant PDF/A gap; the canary became a positive).
- [x] **Reproducible output** — global `--creation-date` / `SOURCE_DATE_EPOCH` via
  `setDefaultCreationDate`, applied process-wide (incl. `batch`); envelope `creationDate`;
  `--layout` revival of `creationDate` / ICC arrays; the 50 MB cap now guards `--layout` too.
- [x] **Global flags before the command** — `parseArgs` boolean-flag table + `splitCommandArgv`.
- [x] **`annotate link`** — `/Link` + `/URI` bodies built after `validateURL` (CMYK colours too).
- [x] **`sign --timestamp-timeout`**, **`verify` weak-digest note** (SHA-1 imprint refused under
  `--strict`, `timestampDigest` reported), **`inspect --iso-dates`**, **`doctor`** font / Unicode /
  conformance checks, **fetch-guard** benchmarking / TEST-NET / NAT64 ranges, `E_INPUT`
  classification of every PDF/X and print coherence message (`utils/build-errors.ts`).
- [x] **Engineering parity with pdfnative 1.8.0** — `scripts/gate.ts` (fast / CI / publish,
  `--require-all`), hermetic sample generator over the built binary with a byte/semantic
  SHA-256 baseline (`verify:samples`, chained `since`), 16-file PDF/A + PDF/X corpus, TypeScript
  validators, `verify:docs` (25 rules) over `docs/assets/ecosystem.json`, `release-prepare.ts`,
  hardened workflows (harden-runner, SHA pins, dependency-review, audit, sample-regression,
  docs, composite veraPDF action, Trusted Publishing + SBOM + attestations), committed rulesets,
  the Claude Code layer (`CLAUDE.md` = `@AGENTS.md`, settings, guard hook, generated rules,
  `release-audit` skill), `docs/AGENT_CONTRACT.md` split out of AGENTS.md, CHANGELOG compare links.

## Future Considerations

Feasibility is called out honestly: some ideas need pdfnative to expose a primitive first
(the CLI stays a thin dispatch layer and never re-implements engine logic).

- **`compare` — visual (pixel) diff** — the text / structural diff **shipped in v1.4.0**; a
  **visual** diff remains **blocked**: pdfnative is a generator/parser with **no rasteriser**,
  so rendering pages to images is out of scope until an upstream raster primitive exists.
- **`optimize`** — shrink PDFs for web/archival: image re-compression/resampling, unused-object
  GC, and linearisation ("Fast Web View"). **Blocked** — pdfnative does not yet expose the
  low-level optimisation/linearisation primitives this would wrap.
- **`modify` standalone command** — **partially delivered** in v1.4.0 via `metadata`
  (incremental `/Info` + XMP edits that keep signatures valid). Arbitrary in-place object
  edits remain blocked on the matching pdfnative primitives.
- **Category help commands** (`pdfnative page --help`, `pdfnative security --help`) — the global
  `--help` already **groups** commands by category (Create & edit / Page tree / Security /
  Read & extract / Automation & meta); dedicated category dispatch commands are deferred (extra
  surface + category-vs-command ambiguity).
- **Additional shell integrations** — PowerShell completion ✅ shipped in v1.3.0. **man pages**
  remain (deferred: ongoing maintenance cost vs. `--help`/completions already covering usage).
- **Positional arguments in manifest tasks** — `batch --manifest` tasks carry only a flat flag
  map today, so `ltv` (subcommand positional) and `compare` (two positional PDF paths) are
  excluded from the manifest whitelist. Supporting positionals would reintroduce both.
- **`metadata` keeps the PDF/X identification** — pdfnative 1.8.0's `PdfModifier.updateMetadata`
  rewrites the XMP packet without `pdfxid:GTS_PDFXVersion`, `xmpMM` and `pdf:Trapped`, so a
  `metadata` edit silently drops a PDF/X-4 claim (`inspect --check pdfx` catches it; the
  integration suite documents it). **Blocked upstream** — needs the modifier to carry the
  PDF/X identification through the rewrite.
- **Reproducible signed output** — the incremental revision `sign` appends carries a
  per-revision trailer `/ID` the engine derives at signing time (both crypto providers), so a
  signed PDF is never byte-identical across runs even with `--creation-date` and
  `--signing-time` pinned. The sample baseline fingerprints signed samples semantically.
  **Blocked upstream** — needs the signing path to honour the pinned creation instant.
- **PDF/X-1a / PDF/X-3 / PDF/X-4p, spot colours** — pdfnative 1.8.0 validates and emits
  PDF/X-4 only (`PDF_X_CONFORMANCE_TARGETS`); the older targets need DeviceN / Separation
  colour spaces and externally referenced profiles the engine does not expose. **Blocked upstream**.
- **PDF/A and PDF/X in one file** — ISO 19005 and ISO 15930 can be claimed together
  (PDF/A-2 + PDF/X-4), but the engine refuses `layout.pdfx` with `tagged` and the CLI mirrors
  that pre-check. **Blocked upstream**.
- **Hyphenation dictionaries from the CLI** — `layout.typography.softHyphens` breaks at
  existing U+00AD soft hyphens; a language dictionary or a hyphenation provider (a function in
  the engine's API) would need the CLI to load code or data from a user path. Deferred by
  posture (the CLI loads fonts from disk, never code); a bundled dictionary would have to ship
  upstream first.
- **Visual (pixel) regression of the sample baseline** — the byte/semantic fingerprints prove
  identity, not appearance; a rendering comparison stays out of scope without a rasteriser.
