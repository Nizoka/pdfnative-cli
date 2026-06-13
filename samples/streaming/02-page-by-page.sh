#!/usr/bin/env bash
# streaming/02-page-by-page.sh — page-by-page streaming (pdfnative 1.2.0+)
#
# Demonstrates `--stream-page-by-page`: the PDF is emitted one page at a time,
# keeping peak memory bounded by a single page rather than the whole document.
# Unlike `--stream`, this mode reflows across page boundaries, so it is the
# right choice for long, paginated documents (it does NOT support TOC blocks,
# which require multi-pass pagination — use buildDocumentPDFBytes for those).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/streaming/02-page-by-page.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/streaming"

mkdir -p "$OUTPUT_DIR"

echo "→ Page-by-page streaming render…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/05-technical-spec.json" \
  --output "$OUTPUT_DIR/02-page-by-page.pdf" \
  --stream-page-by-page \
  --compress

echo "  ✓ Output: $OUTPUT_DIR/02-page-by-page.pdf"
