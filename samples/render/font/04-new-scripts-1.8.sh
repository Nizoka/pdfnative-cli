#!/usr/bin/env bash
# render/font/04-new-scripts-1.8.sh — Lao, Tai Tham, New Tai Lue, Tai Le, Cham (v1.5.0)
#
# The five script codes pdfnative 1.8.0 added: --font registers each bundled
# module, --lang embeds them (27 scripts in all; ha, yo, ig, sw alias latin).
#
# Usage:
#   bash samples/render/font/04-new-scripts-1.8.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/font"
mkdir -p "$OUTPUT_DIR"

pdfnative render \
  --input  "$SCRIPT_DIR/04-new-scripts-1.8.json" \
  --output "$OUTPUT_DIR/04-new-scripts-1.8.pdf" \
  --font lo --font nod --font khb --font tdd --font cjm --font latin \
  --lang lo,nod,khb,tdd,cjm,latin
echo "✓ Written: $OUTPUT_DIR/04-new-scripts-1.8.pdf"
echo "→ The alias route (Yoruba tone marks on the latin module):"
printf '{"blocks":[{"type":"paragraph","text":"Ẹ káàbọ̀ — Ọ̀tọ̀ ìjọ"}]}' > "$OUTPUT_DIR/yoruba.json"
pdfnative render --input "$OUTPUT_DIR/yoruba.json" --output "$OUTPUT_DIR/yoruba.pdf" --font latin --lang yo
echo "✓ Written: $OUTPUT_DIR/yoruba.pdf"
