#!/usr/bin/env bash
# inspect/06-check-signed-encrypted.sh — CI gates for --check signed / encrypted
#
# `inspect --check <property>` exits non-zero when the assertion fails, so it
# can gate a pipeline. This sample exercises two checks:
#   - --check encrypted on a freshly encrypted PDF (expected PASS)
#   - --check signed   on an unsigned PDF          (expected FAIL → exit 1)
#   - --check signed   on a signed PDF if present  (expected PASS)
#
# Usage:
#   bash samples/inspect/06-check-signed-encrypted.sh

set -uo pipefail   # not -e: we deliberately observe a failing check below

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/inspect"
mkdir -p "$OUTPUT_DIR"

PLAIN_PDF="$OUTPUT_DIR/06-plain.pdf"
ENC_PDF="$OUTPUT_DIR/06-encrypted.pdf"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"

# ── Render a plain and an encrypted PDF ────────────────────────────────────
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$PLAIN_PDF"

PDFNATIVE_ENCRYPT_OWNER_PASS="${PDFNATIVE_ENCRYPT_OWNER_PASS:-owner-secret}" \
PDFNATIVE_ENCRYPT_USER_PASS="${PDFNATIVE_ENCRYPT_USER_PASS:-open-sesame}" \
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$ENC_PDF" \
  --encrypt-algorithm aes128

# ── Gate 1: encrypted PDF should pass --check encrypted ────────────────────
echo "→ --check encrypted on the encrypted PDF:"
if pdfnative inspect --input "$ENC_PDF" --check encrypted --format text >/dev/null; then
  echo "  ✓ PASS — document is encrypted."
else
  echo "  ✗ FAIL — expected the document to be encrypted."; exit 1
fi

# ── Gate 2: unsigned PDF should FAIL --check signed (exit 1) ────────────────
echo "→ --check signed on the unsigned PDF (expected to fail):"
if pdfnative inspect --input "$PLAIN_PDF" --check signed --format text >/dev/null; then
  echo "  ✗ UNEXPECTED — unsigned document passed --check signed."; exit 1
else
  echo "  ✓ PASS — gate correctly rejected the unsigned document (exit 1)."
fi

# ── Gate 3: signed PDF (if available) should pass --check signed ────────────
if [ -f "$SIGNED_PDF" ]; then
  echo "→ --check signed on $SIGNED_PDF:"
  if pdfnative inspect --input "$SIGNED_PDF" --check signed --format text >/dev/null; then
    echo "  ✓ PASS — document is signed."
  else
    echo "  ✗ FAIL — expected the document to be signed."; exit 1
  fi
else
  echo "→ (skip) run samples/sign/01-basic.sh to also exercise --check signed PASS."
fi
