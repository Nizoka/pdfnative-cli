# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/Nizoka/pdfnative-cli/security/advisories/new).

Alternatively, contact us at: **security@pdfnative.dev**

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
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
- No network calls — pdfnative-cli never opens a socket or fetches remote resources.
- NPM provenance — signed builds via GitHub Actions OIDC.

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

1. Report vulnerabilities privately (see above).
2. Allow us reasonable time to fix and release a patch before public disclosure.
3. Avoid testing against systems you do not own.
