#!/usr/bin/env bash
# sign/06-timestamp.sh — PAdES B-T: sign with an RFC 3161 trusted timestamp
#
# pdfnative-cli 1.4.0 — `sign --timestamp <url>` embeds a verified RFC 3161
# timestamp token in the CMS unsigned attributes at signing time; combined
# with `--profile pades` this produces a PAdES B-T signature.
#
# Network is strictly OPT-IN. The offline part (render → PAdES B-B sign) always
# runs; the TSA request only happens when PDFNATIVE_TSA_URL is set.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#   - optional: PDFNATIVE_TSA_URL (e.g. http://timestamp.digicert.com) to run
#     the real timestamp step against a TSA
#
# Usage:
#   bash samples/sign/06-timestamp.sh
#   PDFNATIVE_TSA_URL=http://timestamp.digicert.com bash samples/sign/06-timestamp.sh
#
# Output: samples/output/sign/06-timestamp-pades-b.pdf
#         samples/output/sign/06-timestamp-pades-t.pdf (network mode only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$SIGN_OUT/06-timestamp-source.pdf"
PADES_B_PDF="$SIGN_OUT/06-timestamp-pades-b.pdf"
PADES_T_PDF="$SIGN_OUT/06-timestamp-pades-t.pdf"
KEY_FILE="$KEYS_DIR/signing.key"
CERT_FILE="$KEYS_DIR/signing.crt"

# ── Step 1: render the source document ─────────────────────────────────────
echo "→ [1/4] Rendering source document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$UNSIGNED_PDF"
echo "  ✓ Rendered: $UNSIGNED_PDF"

# ── Step 2: generate self-signed certificate (for demo only) ───────────────
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  echo "→ [2/4] Generating self-signed certificate (demo)…"
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo/O=pdfnative/C=US" 2>/dev/null
  echo "  ✓ Key:  $KEY_FILE"
  echo "  ✓ Cert: $CERT_FILE"
else
  echo "→ [2/4] Reusing demo certificate: $CERT_FILE"
fi

# ── Step 3: offline PAdES B-B signature (no network) ───────────────────────
echo "→ [3/4] Signing offline with --profile pades (PAdES B-B)…"
pdfnative sign \
  --input   "$UNSIGNED_PDF" \
  --output  "$PADES_B_PDF" \
  --key     "$KEY_FILE" \
  --cert    "$CERT_FILE" \
  --profile pades \
  --reason  "PAdES B-B baseline signature"
echo "  ✓ Signed: $PADES_B_PDF"

# ── Step 4: PAdES B-T — add an RFC 3161 timestamp (opt-in network) ─────────
if [ -n "${PDFNATIVE_TSA_URL:-}" ]; then
  echo "→ [4/4] Signing with --timestamp against $PDFNATIVE_TSA_URL (PAdES B-T)…"
  pdfnative sign \
    --input     "$UNSIGNED_PDF" \
    --output    "$PADES_T_PDF" \
    --key       "$KEY_FILE" \
    --cert      "$CERT_FILE" \
    --profile   pades \
    --timestamp "$PDFNATIVE_TSA_URL" \
    --reason    "PAdES B-T timestamped signature"
  echo "  ✓ Signed with timestamp: $PADES_T_PDF"

  echo "→ Verifying — look for the RFC 3161 timestamp (timestampPresent)…"
  pdfnative verify \
    --input  "$PADES_T_PDF" \
    --format text
else
  echo "→ [4/4] [skipped] network step — set PDFNATIVE_TSA_URL to run against a real TSA (e.g. http://timestamp.digicert.com)"
  echo "  Command that would run:"
  echo "    pdfnative sign \\"
  echo "      --input     \"$UNSIGNED_PDF\" \\"
  echo "      --output    \"$PADES_T_PDF\" \\"
  echo "      --key       \"$KEY_FILE\" \\"
  echo "      --cert      \"$CERT_FILE\" \\"
  echo "      --profile   pades \\"
  echo "      --timestamp \"\$PDFNATIVE_TSA_URL\""
  echo "  Then: pdfnative verify --input \"$PADES_T_PDF\" --format text"
fi

echo ""
echo "Expect: the offline PAdES B-B signature always verifies; with a TSA the"
echo "B-T output additionally reports a validated RFC 3161 timestamp token."
