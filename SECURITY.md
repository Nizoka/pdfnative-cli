# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/Nizoka/pdfnative-cli/security/advisories/new).

Alternatively, contact us at: **security@pdfnative.dev**

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.6.x   | ✅        |
| 1.5.x   | ✅ (security fixes) |
| < 1.5   | ❌        |

### Supported runtimes

| | 1.x | What a minor may change |
|---|---|---|
| Node.js | Every line in Active or Maintenance LTS: Node.js 22 and 24, both run by the `ci` workflow on Linux, and 22 on Windows and macOS, all four as required checks (v1.6.0). The newest LTS line (Node.js 26, in LTS since 2026-10-28) is run by the advisory `node-current` workflow and promised by nothing until it joins `ci.yml` at the first minor after a green history | Drop a line after its end of life (Node 22: 2027-04-30), announced one minor ahead |
| Operating systems | Ubuntu, Windows and macOS: the full gate (`--ci --require-all`) runs on each, so a path separator, a case-insensitive file system or a CRLF checkout cannot break a release unnoticed | — |
| Deno, Bun, browsers | Not promised: the CLI is a Node binary (`node:` built-ins throughout — `fs`, `crypto`, `dns`, `http`); `dist/cli.js` (ESM) exists for programmatic consumption and is smoke-tested on Node only | — |

`engines.node` is `>=22`. npm warns, and refuses only under `engine-strict`, when a runtime is outside the range.

## Compatibility promise

From 1.6.0, pdfnative-cli proves its process contract mechanically for the whole 1.x line, on every pull request, so that "no breaking change" is a check and not a sentence:

| Leg | What is promised | Held by |
|---|---|---|
| The command surface | Every command, flag, global flag, `E_*` error code, exit code, `schema` subject and envelope field of a 1.x release keeps its name and its type; a minor only adds (a flag, a code, a subject, an additive envelope field) | `tests/compat/manifest-<previous>.json`, `status-<previous>.json` and `subjects-<previous>.json` (the previous release's `schema manifest` / `schema status` / `schema list`, as published) against the current command in `tests/tools/manifest-compat.test.ts` |
| The behaviour | The previous release's own test suite, exactly as tagged, passes against the current sources; the files it may skip are listed in `tests/compat/allow-<previous>.json`, each with a reason and, for a behaviour change, the ledger entry that justifies it | `npm run compat:previous` (`scripts/run-compat.ts`), the required `compat-previous` check and the publish gate |
| The bytes | A sample of the baseline emits the bytes its reference release emitted, unless the release note's compatibility ledger says why it moved | `tests/regression/baselines/samples.sha256.json` and the required `sample-regression` check |

What a 1.x minor may change, and how it is declared:

| Change | Semver | Declared in |
|---|---|---|
| A command, flag, error code, subject or envelope field removed or renamed; an exit code changed; a default value changed | major | — |
| Emitted bytes that differ from the previous release's for the same input, because the engine's previous bytes were wrong or its encoding changed (a font subset, a text object per line, a transparency group) | minor | The release note's Compatibility section, one ledger entry (C1, C2, …) per cause, naming which samples of the baseline were re-anchored |
| A new command, flag, error code, subject, envelope field, script or diagnostic code | minor | The release note's Added section; `schema manifest` and `schema status` carry it |
| A capability added where the CLI refused before (a joint PDF/A + PDF/X claim, an offline LTV material); a refusal the engine now makes earlier or with another code | minor | The release note's ledger, with the old and the new message |

## Security Model

pdfnative-cli is a thin dispatch layer over the [`pdfnative`](https://github.com/Nizoka/pdfnative) library. It introduces zero additional runtime dependencies. All PDF cryptographic operations are performed inside `pdfnative` — see the [pdfnative security policy](https://github.com/Nizoka/pdfnative/blob/main/SECURITY.md) for the full cryptographic implementation notes (RSA, ECDSA, AES).

The CLI exposes 21 commands (run `pdfnative --help` or `pdfnative schema manifest`
for the authoritative list). The `sign`, `verify`, `ltv` and `doc-timestamp`
commands handle key material, certificate chains and trusted-timestamp tokens;
security invariants for each are described below.

### Agent Mode (`--json`, `--dry-run`)

The agent-native contract is a **pure local presentation/validation layer** and adds **no network surface**:

- `--json` only changes how diagnostics are formatted on **stderr** (a machine-readable envelope). It never opens sockets, never alters what is written to stdout, and never relaxes any security check.
- `--dry-run` validates inputs and short-circuits **before** producing or writing output — and **never performs network I/O**, even when a network flag (`--timestamp`, `--url`, `--online`) is present. For `sign` it stops after credentials are parsed and the PDF is prepared, before any signature value is computed — and still never logs key material.
- Stable `E_*` error codes carry only a failure class and a redacted message; internal byte offsets, parser state, and key bytes are never exposed (the `sign` failure message stays the fixed `Failed to sign PDF.`). TSA / OCSP / CRL response bodies are never echoed into CLI output (`E_NETWORK` messages are generic).
- The CLI remains **offline by default** in every mode; network I/O happens only behind the explicit opt-in flags listed under *Network Access* below, and only through the SSRF guard.

### Signing Key Handling

- Private keys are loaded from the `PDFNATIVE_SIGN_KEY` environment variable (PEM string) or from a file via `--key`. **Environment variable takes precedence** over file paths.
- Keys are never written to disk, logged, or included in error messages. All `signPdfBytes` failures are replaced with the fixed string `Failed to sign PDF.` (error code `E_SIGN`).
- PEM strings are consumed directly from memory and not persisted beyond the signing call.
- **Native constant-time crypto by default.** CMS signing routes through Node's `node:crypto` (`createNativeCryptoProvider`) for side-channel-resistant RSA/ECDSA. `--pure-crypto` selects pdfnative's portable pure-JS bignum path; both keep key material in memory only.
- **Recommendation for high-frequency pipelines:** use `PDFNATIVE_SIGN_KEY` with a secrets manager (AWS Secrets Manager, Vault, GitHub Actions secrets) rather than a file on disk.

### Input Validation

- All file path arguments (`--input`, `--output`, `--output-dir`, `--key`, `--cert`, `--cert-chain`, `--layout`, `--attachment`, `--watermark-image`, `--outline`, `--annotations`, `--trust`, `--data`, `--from-json`, `--manifest`, `--output-intent-icc`, `--font-file`, the positional source paths of `merge` and `compare`, and every path-carrying value inside a `batch --manifest` file) are validated against path traversal (`../`) sequences before any filesystem access.
- JSON input size is capped at **50 MB** before `JSON.parse` to prevent memory exhaustion (this also covers `--layout` files, the `annotate --annotations` spec, `govern verify-issue` drafts, `ltv --data` files and `batch --manifest` files; manifests are additionally capped at 1 000 tasks).
- **Binary inputs are bounded and validated** (v1.5.0): an ICC profile passed with `--output-intent-icc` is capped at 16 MiB and must carry the `acsp` signature (the engine additionally requires a `prtr` CMYK profile for PDF/X); a font passed with `--font-file` is capped at 32 MiB, must start with a TrueType/OpenType magic (`00 01 00 00`, `true`, `OTTO` — collections and WOFF are refused), and is parsed by `parseFontData` and checked by `validateFontData` before it is registered. Neither a document JSON nor a `--layout` file can name a font or profile path — no code or data is loaded from a payload.
- `--creation-date` and `SOURCE_DATE_EPOCH` are parsed strictly (ISO 8601 / integer seconds); an invalid value is a usage error, never silently ignored, so a reproducibility promise is either honoured or refused.
- A **manifest has the filesystem access of the user who invokes `batch`** — the same trust level as flags typed on the command line. Only *network* access is additionally gated: any network-reaching flag inside a manifest requires `--allow-network` on the invocation itself, so a manifest obtained from elsewhere can never open a socket on its own.
- The global `--max-inflate-size <bytes>` flag caps the decompressed size of any single PDF stream while parsing untrusted input (anti zip-bomb; engine default 100 MiB).
- `merge` / `split` / `extract` enforce an optional `--max-output-size` cap and bound the number of source PDFs; `extract` / `annotate` bounds-check every page reference against the document before writing.
- `annotate` re-keys only the annotation fields pdfnative's builders understand — the raw JSON is never spread into the emitted dictionary, so unknown keys cannot be injected. A `link` annotation's `url` goes through the engine's `validateURL` (`http`, `https`, `mailto`; no `javascript:`, no control characters) and is escaped as a PDF string before it lands in the `/URI` action.
- `inspect` JSON output sanitizes all values — no raw binary blobs are emitted in default mode.

### Code Safety

- No `eval()`, `Function()`, or dynamic code execution (`batch --manifest` dispatches
  only to a fixed whitelist of CLI command modules — never to arbitrary code).
- **Offline by default** — no command opens a socket unless you pass one of the
  explicit opt-in flags listed below. The `govern` command (AI-governance / HITL) is
  fully offline: it never contacts GitHub or the network, and `govern verify-issue`
  is a pure local validator. See *Network Access* below.
- NPM provenance — signed builds via GitHub Actions OIDC (see *Supply chain* below).
- Parser robustness — the nine ClusterFuzzLite targets under `fuzz/` (argv, the config
  file, batch manifests, annotation specs, layout JSON, page selectors, dates, the URL guard,
  `--font-file`) rethrow any engine error (`TypeError`, `RangeError`, …) and swallow only
  a `CliError` carrying one of the 12 stable codes; `tests/fuzz/targets.test.ts` runs them
  on a seeded, truncated and mutated corpus at every gate run, next to the deterministic
  hostile-input suites of `tests/fuzz/`.

### Network Access (opt-in only)

The CLI is **offline by default**. Exactly four flags can cause a network request,
each naming the operation it enables:

| Opt-in | Command | What is fetched |
|--------|---------|-----------------|
| `--revocation online` | `verify` | OCSP (AIA) + CRL (CDP) revocation data |
| `--timestamp <url>` | `sign` | An RFC 3161 timestamp token from the named TSA |
| `--url <url>` | `doc-timestamp` | An RFC 3161 token for the `/DocTimeStamp` revision |
| `--online` | `ltv collect` / `ltv add` | OCSP + CRL validation data to archive in `/DSS` |

Inside a `batch --manifest` pipeline these flags are additionally refused unless the
`batch` invocation itself carries `--allow-network`. `ltv embed` is network-free by
design (air-gapped embedding of pre-collected data), and `--dry-run` never opens a
socket in any command.

Every request passes through the same SSRF guard (`src/utils/fetch-guard.ts`) that
enforces:

- an **http/https-only** scheme allow-list;
- **DNS resolution followed by address vetting** — requests to private (RFC 1918),
  loopback, link-local (incl. the `169.254.169.254` cloud-metadata address),
  unique-local, CGNAT (`100.64.0.0/10`), multicast, benchmarking (`198.18.0.0/15`),
  documentation (`192.0.2.0/24`, TEST-NET-1) and NAT64 (`64:ff9b::/96`) ranges are
  refused, for both IPv4 and IPv6 (including IPv4-mapped IPv6);
- **no redirect following** (a 3xx is refused rather than followed, so a redirect to
  an internal host cannot bypass the address check);
- a **10 s timeout** and a **5 MiB response cap**;
- no cookies, no auth, no connection reuse.

Embedded revocation data (OCSP responses / CRLs in the PDF `/DSS`) and RFC 3161
timestamp tokens are parsed **offline** with no network access. All such signatures
(CRL `tbsCertList`, OCSP `tbsResponseData`, TSA SignerInfo) are cryptographically
verified against the issuing certificate; unverifiable data yields an `unknown`
status, never a `good` one.

### Cryptographic Verification Scope (`verify` command)

The `verify` command verifies, with no network access by default:

- **Byte-range integrity** — the signer's declared digest (SHA-256, SHA-384 or
  SHA-512) of the covered bytes vs the CMS `messageDigest`.
- **CMS signature value** — RSA-PKCS#1 v1.5 with SHA-256/384/512, and ECDSA-SHA256
  (P-256), over the re-encoded `signedAttrs`. ECDSA with SHA-384/512 is detected and
  labelled but never reported valid (verification is P-256 + SHA-256 only).
- **Certificate chain & trust** — chain construction and evaluation against
  `--trust` roots (or self-signed acceptance when no roots are supplied).
- **RFC 3161 timestamp (PAdES-T)** — the TSA SignerInfo signature, the TSTInfo
  eContent digest, and the `messageImprint` binding to the document signature are
  validated, and the TSA chain is built/trust-evaluated. Reported as `timestampValid`.
- **`/DocTimeStamp` revisions (PAdES B-LTA)** — each document timestamp's token is
  parsed, its `messageImprint` is checked against the covered byte range, and the TSA
  token signature is verified; reported with `isDocTimestamp: true`.
- **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded `/DSS` data (offline)
  and, with `--revocation online`, AIA/CDP fetches via the SSRF-guarded client.

Sign-side LTV is available since v1.4.0: `sign --timestamp` (PAdES B-T),
`ltv collect|embed|add` (B-LT, `/DSS` + `/VRI`) and `doc-timestamp` (B-LTA). The
engine (pdfnative 1.9.0) verifies every TSA token before embedding it and never
opens a socket itself — the CLI injects the SSRF-guarded transport, with the
`sign --timestamp-timeout <ms>` bound on the TSA round-trip (default 10 s).

**Out of scope** (do not rely on for legal / regulatory non-repudiation):

- **Full PAdES-B-LTA archival validation** — evaluation of a document-timestamp
  *chain over time* (renewal policy, algorithm rollover assessment) is not performed;
  each timestamp is validated individually.
- **TSA certificate revocation** — the revocation status of the TSA's own
  certificate is not checked.

### Cryptographic algorithm usage

All signature-relevant hashing and verification uses SHA-256 or stronger (see the
scope above). SHA-1 appears in two deliberate places:

1. **Verification of legacy timestamp imprints** — an existing RFC 3161 token whose
   `messageImprint` was computed with SHA-1 is still *checked* (the digest named by
   the token's own `hashAlgorithm` is used for the comparison), reported as
   `timestampDigest: "sha1"` with the note `weak digest: RFC 3161 messageImprint uses
   SHA-1 (refused under --strict)`, and **fails the timestamp under `verify --strict`**
   (v1.5.0). This affects verification of third-party documents only; the CLI always
   *requests* SHA-256+ imprints when it timestamps (`--timestamp-digest` / `--digest`,
   default sha256), and the token's TSA signature itself must verify with SHA-256+.
2. **The OCSP `CertID`** built by `buildOcspRequest` and matched in
   `ocspCertIdMatches` ([src/utils/revocation.ts](./src/utils/revocation.ts)).
   (SHA-1 of a signature's `/Contents` is also used as the — non-cryptographic —
   `/VRI` dictionary key, as required by ISO 32000-2.)

The `CertID` usage is **intentional and safe**:

- RFC 6960 §B.1 defines **SHA-1 as the default `CertID` hash algorithm**, and it is
  the only one reliably indexed by deployed OCSP responders; using SHA-256 would make
  most responders answer `unknown`.
- The `CertID` hash is a **non-security identifier** computed over the issuer's
  **public** subject DN and public key — it is *not* an integrity or signature
  primitive. OCSP trust is established solely by the responder's digital signature,
  which is verified independently with SHA-256/ECDSA.
- NIST SP 800-131A explicitly permits SHA-1 for such **non-digital-signature**
  applications.

Static analysers (e.g. CodeQL `js/weak-cryptographic-algorithm`) may flag this line
because certificate-derived bytes are treated as "sensitive data". This is a
**reviewed false positive**: the data is public and the hash is not used for any
security decision. The call sites are annotated in source, and the alert is dismissed
as *"Won't fix"* in code scanning with this rationale.

### Reproducible builds (v1.5.0)

- The global `--creation-date <iso8601>` (or `SOURCE_DATE_EPOCH=<seconds>`) pins every
  date the engine writes — `/CreationDate`, `xmp:CreateDate`, the `{date}` placeholder
  and the trailer `/ID` — in UTC, so the same input produces byte-identical output on
  every host and in every timezone. A consumer can therefore verify a PDF by hash.
- Encrypted output is never byte-reproducible (the file key and IVs come from the CSPRNG,
  by design), and a signed PDF's incremental revision carries a per-revision `/ID` drawn at
  signing time (see ROADMAP.md). `sign --signing-time` and `metadata --mod-date` are
  deliberate legal instants and are not pinned by `--creation-date`.
- The repository proves the promise on itself: every generated sample is held to
  `tests/regression/baselines/samples.sha256.json` (byte-exact for plain output, semantic
  for encrypted and signed output) by `npm run verify:samples`, blocking in CI.

### Supply chain

- **Zero extra runtime dependencies** — `pdfnative` is the only one; `npm ci --ignore-scripts`
  everywhere in CI, `.npmrc` sets `ignore-scripts=true` and `audit-level=high`.
- **Hardened workflows** — every action pinned to a commit SHA and resolved to one SHA across
  the tree, `persist-credentials: false` on every checkout, `step-security/harden-runner` on
  every job (block mode with an allow-list where the endpoints are known, audit with a dated
  reason elsewhere), `npm ci --ignore-scripts` everywhere, write permissions at job level
  only, Dependency Review on every pull request, a weekly `npm audit`, Dependabot with a
  seven-day cooldown on all four ecosystems (npm, GitHub Actions, the fuzzing engine, its
  Docker base image), the workflows themselves linted by zizmor and actionlint on every pull
  request (`workflow lint`), CodeQL (`security-extended`, the `actions` language included)
  on every push, and the parser surface fuzzed by ClusterFuzzLite (`fuzz/`, Jazzer.js pinned
  by lockfile inside the build image, never in the package) — all of it held by
  `tests/tools/workflows.test.ts`.
- **Trusted Publishing** — `publish.yml` publishes in four jobs (v1.6.0): a `guard` that
  refuses anything but a `v*` tag matching `package.json` before any approval is asked; a
  `build` that runs the publish gate and packs the tarball once, recording its SHA-256 and
  SHA-512, without the right to mint a token; a `publish` behind the protected `npm-publish`
  environment that installs nothing, verifies the handed-on tarball against those digests and
  uploads exactly it through GitHub OIDC (no long-lived token) with an npm client pinned by
  the SHA-512 of its registry tarball, `npm publish --provenance`; and an `attest` that
  fetches the published tarball back from the registry, checks it against the same digests
  and `npm audit signatures`, and attests the bytes npm serves together with the CycloneDX
  and SPDX SBOMs and a toolchain SBOM, attaching them and the Sigstore bundle to the GitHub
  release. The provenance is **SLSA Build L2** (hosted platform, signed provenance). Verify an
  install with `npm audit signatures`.
- **One release gate** — `npx tsx scripts/gate.ts --publish --require-all` runs typecheck,
  lint, the build, the built-binary smoke test, the bundle-size budget, the bundle probe
  (the engine stays external; no font data, PEM block, `console.log` or undeclared
  `require` in `dist/cli.cjs`), the sample generation, the tests with coverage, the docs
  verifier, the sample baseline, the PDF/A corpus (veraPDF 1.30.2, installer SHA-256
  verified), the PDF/X corpus and the previous release's suite (`compat:previous`); a skipped
  step fails the publish.
- **Branch and tag protection** — `.github/rulesets/main.json` and `tags.json` are the
  committed copies of the GitHub rulesets (required checks `ci (22)`, `ci (24)`, `windows`,
  `macos`, `compat-previous`, `workflow lint`, `sample-regression`; release tags are never
  deleted or moved).
- **OpenSSF Scorecard** — scanned weekly on `main` (`scorecard.yml`, results in the Security
  tab). Two findings are deliberate and stay: the `attest` job holds `contents: write` at the
  job level (the pipeline's only write grant, needed to attach the files to the release), and
  that job installs `pdfnative-cli@<exact version>` with `--ignore-scripts` into a throwaway
  project after checking the tarball against the build digests, because `npm audit
  signatures` verifies an installed tree (Scorecard reads every `npm install` as unpinned).
  Code review by a second maintainer is not available in a single-maintainer project; the
  seven required checks, CodeQL, the previous release's suite replayed on every pull request,
  the fuzzers and the `npm-publish` environment approval stand in for it. The OpenSSF Best
  Practices badge is in progress.
- **Agents never publish** — the human-in-the-loop policy (`.github/AGENT_RULES.md`,
  `pdfnative govern`) is enforced in Claude Code sessions by `.claude/hooks/guard.mjs`,
  which refuses `npm publish`, `git push`, `git tag`, `gh pr/issue/release` writes.

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

1. Report vulnerabilities privately (see above).
2. Allow us reasonable time to fix and release a patch before public disclosure.
3. Avoid testing against systems you do not own.
