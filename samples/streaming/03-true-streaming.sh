#!/usr/bin/env bash
# streaming/03-true-streaming.sh — true constant-memory streaming (pdfnative 1.3.0+)
#
# Demonstrates `--stream-true`: a true constant-memory generator that produces
# byte-identical output to the buffered renderer while never holding the whole
# PDF in memory. Same constraints as `--stream` (no TOC blocks, no `{pages}`
# placeholder), but the lowest peak memory of all modes — ideal for very large
# documents or memory-constrained environments.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/streaming/03-true-streaming.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/streaming"

mkdir -p "$OUTPUT_DIR"

echo "→ True constant-memory streaming render…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/05-technical-spec.json" \
  --output "$OUTPUT_DIR/03-true-streaming.pdf" \
  --stream-true \
  --compress

echo "  ✓ Output: $OUTPUT_DIR/03-true-streaming.pdf"
