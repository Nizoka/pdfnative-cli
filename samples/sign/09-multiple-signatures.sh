#!/usr/bin/env bash
# sign/09-multiple-signatures.sh — two signatures on one PDF (--allow-multiple)
#
# pdfnative-cli 1.4.0 — by default `sign` is idempotent and refuses to sign an
# already-signed PDF; `--allow-multiple` appends a second signature field as an
# incremental revision, keeping the first signature's bytes intact. Each
# signature gets its own form field via --field-name. 100% offline.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/sign/09-multiple-signatures.sh
#
# Output: samples/output/sign/09-multi-signed-twice.pdf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys/multi"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$SIGN_OUT/09-multi-source.pdf"
ONCE_PDF="$SIGN_OUT/09-multi-signed-once.pdf"
TWICE_PDF="$SIGN_OUT/09-multi-signed-twice.pdf"
KEY1="$KEYS_DIR/approver1.key"; CERT1="$KEYS_DIR/approver1.crt"
KEY2="$KEYS_DIR/approver2.key"; CERT2="$KEYS_DIR/approver2.crt"

# ── Step 1: render the source document ─────────────────────────────────────
echo "→ [1/5] Rendering source document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/04-invoice.json" \
  --output "$UNSIGNED_PDF"
echo "  ✓ Rendered: $UNSIGNED_PDF"

# ── Step 2: generate two demo signer identities ────────────────────────────
if [ ! -f "$CERT1" ] || [ ! -f "$CERT2" ]; then
  echo "→ [2/5] Generating two self-signed certificates (demo)…"
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY1" -out "$CERT1" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo Approver 1/O=pdfnative/C=US" 2>/dev/null
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY2" -out "$CERT2" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo Approver 2/O=pdfnative/C=US" 2>/dev/null
  echo "  ✓ Approver 1: $CERT1"
  echo "  ✓ Approver 2: $CERT2"
else
  echo "→ [2/5] Reusing demo certificates in $KEYS_DIR"
fi

# ── Step 3: first signature (field Approval1) ──────────────────────────────
echo "→ [3/5] First signature (--field-name Approval1)…"
pdfnative sign \
  --input      "$UNSIGNED_PDF" \
  --output     "$ONCE_PDF" \
  --key        "$KEY1" \
  --cert       "$CERT1" \
  --field-name Approval1 \
  --reason     "First approval"
echo "  ✓ Signed once: $ONCE_PDF"

# ── Step 4: second signature (--allow-multiple, field Approval2) ───────────
echo "→ [4/5] Second signature (--allow-multiple --field-name Approval2)…"
pdfnative sign \
  --input          "$ONCE_PDF" \
  --output         "$TWICE_PDF" \
  --key            "$KEY2" \
  --cert           "$CERT2" \
  --allow-multiple \
  --field-name     Approval2 \
  --reason         "Second approval"
echo "  ✓ Signed twice: $TWICE_PDF"

# ── Step 5: inventory + verify both signatures ─────────────────────────────
echo "→ [5/5] inspect --signatures — expect two entries (Approval1, Approval2):"
pdfnative inspect \
  --input "$TWICE_PDF" \
  --signatures \
  --format json \
  --fields signatures \
  --pretty

echo ""
echo "→ verify — expect both signatures to validate:"
pdfnative verify \
  --input  "$TWICE_PDF" \
  --format text

echo ""
echo "Expect: two signature fields, and verify reports both as valid — the"
echo "second revision did not break the first signature's byte range."
