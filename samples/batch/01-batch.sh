#!/usr/bin/env bash
# batch/01-batch.sh — render a directory of JSON files in parallel (v1.0.0)
#
# Demonstrates the `batch` command: every *.json in --input-dir is rendered to
# --output-dir/<name>.pdf, reusing the full render pipeline. All other render
# flags (here --compress) are forwarded to each file.
#
# Usage:
#   bash samples/batch/01-batch.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IN_DIR="$ROOT_DIR/render/document"
OUT_DIR="$ROOT_DIR/output/batch"

echo "→ Batch-rendering every *.json in:"
echo "  $IN_DIR"
echo ""
pdfnative batch \
  --input-dir   "$IN_DIR" \
  --output-dir  "$OUT_DIR" \
  --concurrency 4 \
  --compress \
  --format      json

echo ""
echo "  ✓ PDFs written to $OUT_DIR (exit code is 1 if any file fails)."
