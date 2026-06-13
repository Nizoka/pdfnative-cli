#!/usr/bin/env bash
# sign/05-cert-chain.sh — sign with an intermediate certificate chain
#
# Builds a tiny two-level PKI (root CA → signer), signs a PDF with the signer
# certificate, and embeds the CA via --cert-chain so a verifier can build the
# path to a trusted root. Verifies with --trust pointing at the root CA.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/sign/05-cert-chain.sh
#
# Output: samples/output/sign/05-cert-chain-signed.pdf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys/chain"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$OUTPUT_DIR/document/04-invoice.pdf"
SIGNED_PDF="$SIGN_OUT/05-cert-chain-signed.pdf"
CA_KEY="$KEYS_DIR/ca.key"
CA_CERT="$KEYS_DIR/ca.crt"
LEAF_KEY="$KEYS_DIR/signer.key"
LEAF_CSR="$KEYS_DIR/signer.csr"
LEAF_CERT="$KEYS_DIR/signer.crt"

# ── Step 1: render the source document ─────────────────────────────────────
if [ ! -f "$UNSIGNED_PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/04-invoice.json" \
    --output "$UNSIGNED_PDF"
fi

# ── Step 2: build a root CA and a signer certificate signed by it ──────────
if [ ! -f "$LEAF_CERT" ]; then
  echo "→ Building demo PKI (root CA → signer)…"
  openssl req -x509 -newkey rsa:2048 -keyout "$CA_KEY" -out "$CA_CERT" \
    -days 3650 -nodes -subj "/CN=pdfnative Demo Root CA/O=pdfnative/C=US" \
    -addext "basicConstraints=critical,CA:TRUE" 2>/dev/null
  openssl req -newkey rsa:2048 -keyout "$LEAF_KEY" -out "$LEAF_CSR" \
    -nodes -subj "/CN=pdfnative Demo Signer/O=pdfnative/C=US" 2>/dev/null
  openssl x509 -req -in "$LEAF_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -CAcreateserial -out "$LEAF_CERT" -days 825 -sha256 2>/dev/null
  echo "  ✓ Root CA: $CA_CERT"
  echo "  ✓ Signer:  $LEAF_CERT"
fi

# ── Step 3: sign with the signer cert + CA chain ───────────────────────────
echo "→ Signing with --cert-chain…"
pdfnative sign \
  --input      "$UNSIGNED_PDF" \
  --output     "$SIGNED_PDF" \
  --key        "$LEAF_KEY" \
  --cert       "$LEAF_CERT" \
  --cert-chain "$CA_CERT" \
  --reason     "Issued under demo root CA"

echo "  ✓ Signed: $SIGNED_PDF"

# ── Step 4: verify, trusting the root CA ───────────────────────────────────
echo "→ Verifying against the root CA…"
pdfnative verify \
  --input  "$SIGNED_PDF" \
  --trust  "$CA_CERT" \
  --format text

echo ""
echo "Expect: chain builds to the trusted root and the signature is valid."
