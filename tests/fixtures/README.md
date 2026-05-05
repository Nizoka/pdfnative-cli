# tests/fixtures — Test-only crypto material

**⚠️ TEST-ONLY KEYS AND CERTIFICATES — NEVER USE IN PRODUCTION ⚠️**

This folder contains self-signed key pairs and X.509 certificates used to
exercise the `sign` → `verify` round-trip in the `pdfnative-cli` test suite.

| File           | Purpose                              |
| -------------- | ------------------------------------ |
| `rsa-key.pem`  | RSA-2048 private key (PKCS#8)        |
| `rsa-cert.pem` | Self-signed X.509 cert for the above |
| `ec-key.pem`   | EC P-256 private key (SEC1)          |
| `ec-cert.pem`  | Self-signed X.509 cert for the above |

These fixtures are committed for deterministic CI runs (no `openssl`
dependency on the runner). They are **only valid for the test suite** and
must never be reused outside it.

## Regeneration

To regenerate (10-year validity, `pdfnative-cli` test subjects):

```sh
# RSA
openssl req -x509 -newkey rsa:2048 -keyout rsa-key.pem -out rsa-cert.pem \
    -days 3650 -nodes -subj "/CN=pdfnative-cli RSA Test/O=pdfnative-cli/C=FR"

# EC P-256
openssl ecparam -name prime256v1 -genkey -noout -out ec-key.pem
openssl req -x509 -new -key ec-key.pem -out ec-cert.pem \
    -days 3650 -subj "/CN=pdfnative-cli EC Test/O=pdfnative-cli/C=FR"
```
