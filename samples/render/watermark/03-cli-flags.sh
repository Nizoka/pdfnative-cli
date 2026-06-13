#!/usr/bin/env bash
# render/watermark/03-cli-flags.sh — apply a watermark purely from the CLI
#
# Demonstrates the full --watermark-* flag surface. The input JSON contains no
# watermark of its own; the diagonal stamp is layered on from the command line,
# overriding any layout.watermark in the JSON. Handy for CI pipelines that stamp
# build status onto an otherwise clean document.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/watermark/03-cli-flags.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/watermark"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with a CLI-driven watermark…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/watermark/03-cli-flags.json" \
  --output "$OUTPUT_DIR/03-cli-flags.pdf" \
  --watermark-text      "CONFIDENTIAL" \
  --watermark-opacity   0.15 \
  --watermark-angle     45 \
  --watermark-color     "#FF3B30" \
  --watermark-font-size 64 \
  --watermark-position  background

echo "  ✓ Output: $OUTPUT_DIR/03-cli-flags.pdf"
