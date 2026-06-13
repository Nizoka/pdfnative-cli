#!/usr/bin/env bash
# render/document/06-max-blocks.sh — cap document blocks with --max-blocks
#
# --max-blocks <n> exposes pdfnative's layout.maxBlocks ceiling (default 100000)
# so a very large or runaway document fails fast instead of exhausting memory.
# This sample renders the same 5-block input twice:
#   1. with a generous cap (10000)  → succeeds
#   2. with a cap below the block count (3) → pdfnative aborts (non-zero exit)
#
# Pattern: pin a sane upper bound in CI so an accidentally huge payload is
# rejected deterministically rather than running the host out of memory.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/document/06-max-blocks.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
INPUT="$ROOT_DIR/samples/render/document/06-max-blocks.json"
OUTPUT_DIR="$ROOT_DIR/samples/output/document"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with a generous cap (--max-blocks 10000)…"
pdfnative render \
  --input  "$INPUT" \
  --output "$OUTPUT_DIR/06-max-blocks.pdf" \
  --max-blocks 10000
echo "  ✓ Output: $OUTPUT_DIR/06-max-blocks.pdf"

echo "→ Re-rendering with a deliberately low cap (--max-blocks 3) — expected to fail…"
if pdfnative render --input "$INPUT" --output /dev/null --max-blocks 3 2>/dev/null; then
  echo "  ✗ Unexpected success — the guard should have tripped." >&2
  exit 1
else
  echo "  ✓ Guard tripped as expected (non-zero exit)."
fi
