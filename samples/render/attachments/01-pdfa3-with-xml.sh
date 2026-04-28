#!/usr/bin/env bash
# render/attachments/01-pdfa3-with-xml.sh — PDF/A-3 with structured XML attachment
#
# Demonstrates:
#   --tagged pdfa3b
#   --attachment <path>:<mime>:<relationship>:<description>
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/attachments/01-pdfa3-with-xml.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/attachments"
XML_PATH="$ROOT_DIR/samples/render/attachments/invoice.xml"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering PDF/A-3b with embedded invoice.xml…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/attachments/01-pdfa3-with-xml.json" \
  --output "$OUTPUT_DIR/01-pdfa3-with-xml.pdf" \
  --tagged pdfa3b \
  --attachment "$XML_PATH:application/xml:Source:Structured invoice payload"

echo "  ✓ Output: $OUTPUT_DIR/01-pdfa3-with-xml.pdf"
echo ""
echo "Verify PDF/A conformance and signed status:"
echo "  pdfnative inspect --input \"$OUTPUT_DIR/01-pdfa3-with-xml.pdf\" --check pdfa"
