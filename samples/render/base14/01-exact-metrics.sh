#!/usr/bin/env bash
# render/base14/01-exact-metrics.sh — layout.typography.metrics "exact" on the base-14 path (v1.5.0)
#
# No --font flag on purpose: metrics "exact" measures Helvetica with the Adobe
# Core 14 widths and is inert once a registered font measures the text - the
# second render shows it.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/base14/01-exact-metrics.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/base14"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with exact metrics"
pdfnative render --input "$SCRIPT_DIR/01-exact-metrics.json" --output "$OUTPUT_DIR/01-exact-metrics.pdf" --creation-date 2026-01-01T00:00:00Z
echo "→ The same document with a registered font: the option no longer acts"
pdfnative render --input "$SCRIPT_DIR/01-exact-metrics.json" --output "$OUTPUT_DIR/01-exact-metrics-latin.pdf" --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
echo "✓ Done: $OUTPUT_DIR"
