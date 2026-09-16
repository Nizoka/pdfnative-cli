#!/usr/bin/env bash
# inspect/10-iso-dates.sh — ISO 8601 dates instead of the raw PDF date string (v1.5.0)
#
# /Info dates are stored as D:YYYYMMDDHHmmSS+HH'mm' (ISO 32000-1 §7.9.4).
# --iso-dates normalises metadata.creationDate to ISO 8601 so an agent can
# parse it without a PDF-specific parser; the raw form stays the default.
#
# Usage:
#   bash samples/inspect/10-iso-dates.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/inspect"
mkdir -p "$OUTPUT_DIR"

pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$OUTPUT_DIR/dated.pdf" \
  --creation-date 2026-06-15T12:30:45Z

echo "→ Raw PDF date string (default):"
pdfnative inspect --input "$OUTPUT_DIR/dated.pdf" --fields metadata.creationDate
echo "→ ISO 8601 (--iso-dates):"
pdfnative inspect --input "$OUTPUT_DIR/dated.pdf" --iso-dates --fields metadata.creationDate
