#!/usr/bin/env bash
# render/watch/01-basic.sh — Live re-render on input change (v0.3.0)
#
# Demonstrates `pdfnative render --watch`. The CLI re-renders the PDF whenever
# the input JSON file is modified (200 ms debounce). Use Ctrl+C to stop.
#
# This sample is INTERACTIVE and is intentionally NOT included in
# samples/run-all.js. After launching the watcher, edit
# samples/output/watch/source.json in another terminal to see live re-renders.
#
# Usage: bash samples/render/watch/01-basic.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/watch"
SRC_JSON="$OUT_DIR/source.json"
OUT_PDF="$OUT_DIR/01-basic.pdf"

mkdir -p "$OUT_DIR"

cat > "$SRC_JSON" <<'EOF'
{
    "title": "Live document",
    "blocks": [
        { "type": "heading", "text": "Edit me!", "level": 1 },
        { "type": "paragraph", "text": "Save this file to trigger a re-render." }
    ]
}
EOF

echo "→ Watching $SRC_JSON"
echo "  Edit it in another terminal, then save — the PDF re-renders automatically."
echo "  Output: $OUT_PDF"
echo "  Press Ctrl+C to stop."
echo ""

pdfnative render \
  --input  "$SRC_JSON" \
  --output "$OUT_PDF" \
  --watch
