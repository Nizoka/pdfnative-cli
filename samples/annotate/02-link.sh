#!/usr/bin/env bash
# annotate/02-link.sh — link annotations on an existing PDF (v1.5.0)
#
# The `link` type adds a /Link annotation with a URI action over a click
# rectangle. Only http:, https: and mailto: URLs pass pdfnative's validateURL
# (javascript:, file:, data: and control characters are refused, E_INPUT).
# The update is incremental: the original bytes — and any signature — stay.
#
# Usage:
#   bash samples/annotate/02-link.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/annotate"
mkdir -p "$OUTPUT_DIR"

pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/02-report.json" \
  --output "$OUTPUT_DIR/report.pdf"

echo "→ Adding two links (and a CMYK highlight) from 02-links.json"
pdfnative annotate \
  --input  "$OUTPUT_DIR/report.pdf" \
  --output "$OUTPUT_DIR/report-linked.pdf" \
  --annotations "$SCRIPT_DIR/02-links.json" --json

echo "→ Listing them back"
pdfnative inspect --input "$OUTPUT_DIR/report-linked.pdf" --annotations --json --fields annotations

echo "→ A blocked scheme is refused before anything is written"
printf '[{"page":1,"type":"link","rect":[72,600,300,620],"url":"javascript:alert(1)"}]' > "$OUTPUT_DIR/bad-link.json"
if pdfnative annotate --input "$OUTPUT_DIR/report.pdf" --output "$OUTPUT_DIR/never.pdf" --annotations "$OUTPUT_DIR/bad-link.json" --json 2>&1; then
  echo "  ✗ unexpected: the javascript: link was accepted"; exit 1
else
  echo "  ✓ expected: E_INPUT (exit 1), nothing written"
fi
