#!/usr/bin/env bash
# render/font/02-new-scripts.sh — six new scripts + colour emoji (pdfnative 1.3.0)
#
# Registers the six Unicode scripts added in pdfnative 1.3.0 (Telugu, Sinhala,
# Khmer, Myanmar, Tibetan, Amharic/Ethiopic) plus COLRv1 colour emoji via the
# --font shortcut. Each shortcut name doubles as its --lang code.
#
# Usage: bash samples/render/font/02-new-scripts.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/font"

mkdir -p "$OUT_DIR"

pdfnative render \
  --input  "$SCRIPT_DIR/02-new-scripts.json" \
  --output "$OUT_DIR/02-new-scripts.pdf" \
  --font te --font si --font km --font my --font bo --font am \
  --font color-emoji \
  --lang  te,si,km,my,bo,am,color-emoji

echo "✓ Rendered: $OUT_DIR/02-new-scripts.pdf"
