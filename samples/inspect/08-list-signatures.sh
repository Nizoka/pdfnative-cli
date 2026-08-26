#!/usr/bin/env bash
# inspect/08-list-signatures.sh — signature inventory + "signatures>=N" gates
#
# pdfnative-cli 1.4.0 — `inspect --signatures` lists every signature form
# field (fieldName, subFilter, byteRange, isDocTimestamp, isPlaceholder —
# never the signature bytes), and `--check "signatures>=N"` turns the count
# into a CI gate (exit 0 when satisfied, exit 1 otherwise). 100% offline.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/inspect/08-list-signatures.sh
#
# Output: samples/output/inspect/08-signed.pdf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/inspect"
KEYS_DIR="$OUTPUT_DIR/keys"

mkdir -p "$OUTPUT_DIR" "$KEYS_DIR"

PLAIN_PDF="$OUTPUT_DIR/08-plain.pdf"
SIGNED_PDF="$OUTPUT_DIR/08-signed.pdf"
KEY_FILE="$KEYS_DIR/08-signing.key"
CERT_FILE="$KEYS_DIR/08-signing.crt"

# ── Step 1: render a document ──────────────────────────────────────────────
echo "→ [1/4] Rendering source document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$PLAIN_PDF"
echo "  ✓ Rendered: $PLAIN_PDF"

# ── Step 2: sign it with a throwaway self-signed certificate ───────────────
echo "→ [2/4] Signing with a self-signed demo certificate…"
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo/O=pdfnative/C=US" 2>/dev/null
fi
pdfnative sign \
  --input  "$PLAIN_PDF" \
  --output "$SIGNED_PDF" \
  --key    "$KEY_FILE" \
  --cert   "$CERT_FILE"
echo "  ✓ Signed: $SIGNED_PDF"

# ── Step 3: list the signature fields (JSON inventory) ─────────────────────
echo "→ [3/4] inspect --signatures (JSON inventory):"
pdfnative inspect \
  --input "$SIGNED_PDF" \
  --signatures \
  --format json \
  --fields signatures \
  --pretty

# ── Step 4: count gates — signatures>=1 passes, signatures>=2 fails ────────
echo "→ [4/4] --check \"signatures>=1\" (expected PASS):"
pdfnative inspect --input "$SIGNED_PDF" --check "signatures>=1" --format text >/dev/null
echo "  ✓ exit code $? — the document carries at least one signature."

echo "→ --check \"signatures>=2\" (expected FAIL — shown pedagogically):"
pdfnative inspect --input "$SIGNED_PDF" --check "signatures>=2" --format text >/dev/null || true
echo "  ✓ the gate exits 1 when the count is not reached — '|| true' keeps this"
echo "    demo script alive; in CI you would let the non-zero exit fail the job."

echo ""
echo "Expect: one signature entry in the inventory; the >=1 gate passes (exit 0)"
echo "and the >=2 gate fails cleanly (exit 1)."
