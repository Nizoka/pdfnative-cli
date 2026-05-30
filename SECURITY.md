# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/Nizoka/pdfnative-cli/security/advisories/new).

Alternatively, contact us at: **security@pdfnative.dev**

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | ✅        |
| 0.2.x   | ✅        |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Security Model

pdfnative-cli is a thin dispatch layer over the [`pdfnative`](https://github.com/Nizoka/pdfnative) library. It introduces zero additional runtime dependencies. All PDF cryptographic operations are performed inside `pdfnative` — see the [pdfnative security policy](https://github.com/Nizoka/pdfnative/blob/main/SECURITY.md) for the full cryptographic implementation notes (RSA, ECDSA, AES).

The CLI exposes four commands (`render`, `sign`, `inspect`, `verify`). The `sign` and `verify` commands handle key material and certificate chain loading; security invariants for each are described below.

### Signing Key Handling

- Private keys are loaded from the `PDFNATIVE_SIGN_KEY` environment variable (PEM string) or from a file via `--key`. **Environment variable takes precedence** over file paths.
- Keys are never written to disk, logged, or included in error messages.
- PEM strings are consumed directly from memory and not persisted beyond the signing call.
- **Recommendation for high-frequency pipelines:** use `PDFNATIVE_SIGN_KEY` with a secrets manager (AWS Secrets Manager, Vault, GitHub Actions secrets) rather than a file on disk.

### Input Validation

- All file path arguments (`--input`, `--output`, `--key`, `--cert`, `--cert-chain`, `--layout`, `--attachment`, `--watermark-image`, `--trust`) are validated against path traversal (`../`) sequences before any filesystem access.
- JSON input size is capped at **50 MB** before `JSON.parse` to prevent memory exhaustion.
- `inspect` JSON output sanitizes all values — no raw binary blobs are emitted in default mode.

### Code Safety

- No `eval()`, `Function()`, or dynamic code execution.
- **Offline by default** — no command opens a socket unless you explicitly pass
  `verify --revocation online`. See *Network Access* below.
- NPM provenance — signed builds via GitHub Actions OIDC.

### Network Access & Revocation Checking

The CLI is **offline by default**. The only command that can make a network
request is `verify`, and only when you opt in with `--revocation online`.

When online revocation is enabled, every OCSP (AIA) and CRL (CDP) request passes
through an SSRF guard (`src/utils/fetch-guard.ts`) that enforces:

- an **http/https-only** scheme allow-list;
- **DNS resolution followed by address vetting** — requests to private (RFC 1918),
  loopback, link-local (incl. the `169.254.169.254` cloud-metadata address),
  unique-local, CGNAT (`100.64.0.0/10`) and multicast ranges are refused, for both
  IPv4 and IPv6 (including IPv4-mapped IPv6);
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

- **Byte-range integrity** — SHA-256 of the covered bytes vs the CMS `messageDigest`.
- **CMS signature value** — RSA-PKCS#1 v1.5 SHA-256 and ECDSA-SHA256 (P-256) over
  the re-encoded `signedAttrs`.
- **Certificate chain & trust** — chain construction and evaluation against
  `--trust` roots (or self-signed acceptance when no roots are supplied).
- **RFC 3161 timestamp (PAdES-T)** — the TSA SignerInfo signature, the TSTInfo
  eContent digest, and the `messageImprint` binding to the document signature are
  validated, and the TSA chain is built/trust-evaluated. Reported as `timestampValid`.
- **OCSP (RFC 6960) + CRL (RFC 5280) revocation** — embedded `/DSS` data (offline)
  and, with `--revocation online`, AIA/CDP fetches via the SSRF-guarded client.

**Out of scope** (do not rely on for legal / regulatory non-repudiation):

- **Sign-side LTV** — embedding timestamps, DSS dictionaries, VRI or
  document-timestamp chains *at signing time* is upstream-blocked in pdfnative; the
  `sign --timestamp` flag is reserved and currently errors. Tracked in
  [ROADMAP.md](./ROADMAP.md).
- **Full PAdES-B-LTA archival validation** — document-timestamp chain evaluation over
  time is not performed.

### Cryptographic algorithm usage

All signature-relevant hashing and verification uses SHA-256 or stronger (see the
scope above). **SHA-1 appears in exactly one place: the OCSP `CertID`** built by
`buildOcspRequest` and matched in `ocspCertIdMatches`
([src/utils/revocation.ts](./src/utils/revocation.ts)). This is **intentional and safe**:

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

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

1. Report vulnerabilities privately (see above).
2. Allow us reasonable time to fix and release a patch before public disclosure.
3. Avoid testing against systems you do not own.
