#!/usr/bin/env bash
# render/reproducible/01-double-render.sh — the sample IS the proof (v1.5.0)
#
# Renders the same document twice under two time zones with a pinned
# creation date and compares the SHA-256 hashes: identical bytes on every
# host. A third render without the pin shows the hash moving with the clock.
#
# Usage:
#   bash samples/render/reproducible/01-double-render.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/reproducible"
INPUT="$ROOT_DIR/samples/render/reproducible/01-pinned-date.json"
PIN="2026-01-01T00:00:00Z"
mkdir -p "$OUTPUT_DIR"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

echo "→ Render A under TZ=Europe/Paris with --creation-date $PIN"
TZ=Europe/Paris pdfnative render --input "$INPUT" --output "$OUTPUT_DIR/a.pdf" --creation-date "$PIN" --header-right '{date}'
echo "→ Render B under TZ=Pacific/Auckland with the same pin"
TZ=Pacific/Auckland pdfnative render --input "$INPUT" --output "$OUTPUT_DIR/b.pdf" --creation-date "$PIN" --header-right '{date}'
echo "→ Render C with SOURCE_DATE_EPOCH=1767225600 (the same instant, no flag)"
SOURCE_DATE_EPOCH=1767225600 pdfnative render --input "$INPUT" --output "$OUTPUT_DIR/c.pdf" --header-right '{date}'

A=$(sha "$OUTPUT_DIR/a.pdf"); B=$(sha "$OUTPUT_DIR/b.pdf"); C=$(sha "$OUTPUT_DIR/c.pdf")
echo "  a.pdf $A"
echo "  b.pdf $B"
echo "  c.pdf $C"
if [ "$A" = "$B" ] && [ "$B" = "$C" ]; then
  echo "  ✓ PASS — identical bytes across time zones and pin sources."
else
  echo "  ✗ FAIL — the renders differ."
  exit 1
fi

echo "→ Render D without a pin (wall clock, still UTC): its hash moves with the clock"
pdfnative render --input "$INPUT" --output "$OUTPUT_DIR/d.pdf" --header-right '{date}'
echo "  d.pdf $(sha "$OUTPUT_DIR/d.pdf")"
