#!/usr/bin/env bash
# render/print/05-pdfx4.sh — a PDF/X-4 press file, checked, then broken on purpose (v1.5.0)
#
# 1. render --pdfx pdfx4 with the synthetic CMYK output profile, fonts embedded,
#    trapping state known, --strict so a conformance diagnostic fails the render;
# 2. inspect --pdfx prints the structural ISO 15930-7 report and --check pdfx
#    turns it into an exit code (0 = the prerequisites hold);
# 3. annotate a link onto the file: PDF/X forbids annotations in the print
#    area, so the same check now fails (exit 1, E_CHECK_FAILED under --json).
#
# The ICC profile is a structurally valid, colourimetrically meaningless test
# profile — ask your printer for theirs (ISO Coated v2, GRACoL, …).
#
# Usage:
#   bash samples/render/print/05-pdfx4.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
PRINT_DIR="$ROOT_DIR/samples/render/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering PDF/X-4"
pdfnative render \
  --input  "$PRINT_DIR/05-pdfx4.json" \
  --output "$OUTPUT_DIR/05-pdfx4.pdf" \
  --pdfx pdfx4 \
  --output-intent-icc "$PRINT_DIR/synthetic-cmyk.icc" \
  --output-intent-id "Synthetic CMYK (pdfnative test profile)" \
  --trapped false \
  --font latin --lang latin \
  --strict \
  --creation-date 2026-01-01T00:00:00Z

echo "→ Structural PDF/X-4 report"
pdfnative inspect --input "$OUTPUT_DIR/05-pdfx4.pdf" --pdfx --format text | sed -n '/^PDF\/X/p'

echo "→ Asserting the claim (CI-style)"
if pdfnative inspect --input "$OUTPUT_DIR/05-pdfx4.pdf" --check pdfx --json --summary; then
  echo "  ✓ PASS — the ISO 15930-7 prerequisites hold."
else
  echo "  ✗ FAIL — see the report above."
  exit 1
fi

echo "→ Breaking it: a link annotation inside the print area"
pdfnative annotate \
  --input  "$OUTPUT_DIR/05-pdfx4.pdf" \
  --output "$OUTPUT_DIR/05-pdfx4-annotated.pdf" \
  --annotations "$ROOT_DIR/samples/annotate/02-links.json"
if pdfnative inspect --input "$OUTPUT_DIR/05-pdfx4-annotated.pdf" --check pdfx --json --fields pdfxConformance 2>/dev/null; then
  echo "  ✗ unexpected: the annotated file still passes"
  exit 1
else
  echo "  ✓ expected: the annotated file fails --check pdfx (exit 1)"
fi
