#!/usr/bin/env bash
# annotate/01-annotate.sh — attach markup annotations to an existing PDF
#
# Renders a document, then layers three markup annotations onto page 1 (a yellow
# highlight, a sticky text note, and a blue review box). The change is written
# with an incremental save, so the original bytes — and any existing signature —
# stay intact. Annotations are described by a JSON array via --annotations.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/annotate/01-annotate.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/annotate"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/2] Rendering the base document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/02-report.json" \
  --output "$OUTPUT_DIR/base.pdf"

echo "→ [2/2] Attaching markup annotations…"
pdfnative annotate \
  --input       "$OUTPUT_DIR/base.pdf" \
  --output      "$OUTPUT_DIR/01-annotated.pdf" \
  --annotations "$ROOT_DIR/samples/annotate/01-annotations.json"

echo "  ✓ Output: $OUTPUT_DIR/01-annotated.pdf"
echo "→ Listing the annotations back out with inspect --annotations:"
pdfnative inspect --input "$OUTPUT_DIR/01-annotated.pdf" --annotations --format text
