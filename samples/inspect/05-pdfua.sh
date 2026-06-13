#!/usr/bin/env bash
# inspect/05-pdfua.sh — PDF/UA (ISO 14289-1) structural validation (pdfnative 1.3.0)
#
# Renders a tagged (PDF/UA-oriented) document, then runs the read-only PDF/UA
# structural validator. `--pdfua` adds a { valid, errors, warnings } report to
# the output; `--check pdfua` turns it into a CI accessibility gate (exit 1 when
# the structural prerequisites fail).
#
# Usage: bash samples/inspect/05-pdfua.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
UA_PDF="$OUTPUT_DIR/inspect/05-tagged.pdf"

mkdir -p "$OUTPUT_DIR/inspect"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --output "$UA_PDF" \
  --tagged pdfa2b

echo "→ PDF/UA structural report (JSON):"
pdfnative inspect --input "$UA_PDF" --pdfua --format json

echo "→ PDF/UA accessibility gate (--check pdfua):"
if pdfnative inspect --input "$UA_PDF" --check pdfua --format text; then
  echo "  ✓ PASS — structural prerequisites satisfied."
else
  echo "  ✗ FAIL — PDF/UA structural prerequisites not met (exit 1)."
fi
