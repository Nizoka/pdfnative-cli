#!/usr/bin/env bash
# render/template/01-merge.sh — Deep-merge template + override (v0.3.0)
#
# Demonstrates `--template base.json` + `--input override.json`:
#   - Plain object fields merge recursively (override wins).
#   - Arrays are replaced wholesale by the override.
#
# The resulting PDF inherits `title` + `metadata.subject` from base.json,
# overrides `metadata.author`, and replaces the `blocks` array entirely.
#
# Usage: bash samples/render/template/01-merge.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/template"

mkdir -p "$OUT_DIR"

pdfnative render \
  --template "$SCRIPT_DIR/base.json" \
  --input    "$SCRIPT_DIR/override.json" \
  --output   "$OUT_DIR/01-merge.pdf"

echo "✓ Rendered: $OUT_DIR/01-merge.pdf"
echo "  Inspect metadata: pdfnative inspect --input \"$OUT_DIR/01-merge.pdf\" --format text"
