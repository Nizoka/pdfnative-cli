#!/usr/bin/env bash
# render/typography/05-spacing-and-keep-rules.sh — fr-CA spacing, custom rules, soft hyphens, keep rules (v1.5.0)
#
# Three documents: the Canadian French preset (05), an explicit
# PunctuationSpacingRule[] (06), and soft hyphens with the per-block
# keepWithNext / splittable keys (07). All need a registered font for the
# narrow no-break space, hence --font latin --lang latin.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/typography/05-spacing-and-keep-rules.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/typography"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering"
pdfnative render --input "$SCRIPT_DIR/05-french-canadian-spacing.json" --output "$OUTPUT_DIR/05-french-canadian-spacing.pdf" --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
pdfnative render --input "$SCRIPT_DIR/06-custom-spacing-rules.json" --output "$OUTPUT_DIR/06-custom-spacing-rules.pdf" --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
pdfnative render --input "$SCRIPT_DIR/07-soft-hyphen-keep-with-next.json" --output "$OUTPUT_DIR/07-soft-hyphen-keep-with-next.pdf" --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
echo "→ The no-break spaces are in the file: extract-text returns U+00A0 and U+202F"
pdfnative extract-text --input "$OUTPUT_DIR/05-french-canadian-spacing.pdf" --format json --fields text
echo "→ The page map of the keep rules, without writing a PDF"
pdfnative render --input "$SCRIPT_DIR/07-soft-hyphen-keep-with-next.json" --font latin --lang latin --inspect-layout --output "$OUTPUT_DIR/07-layout.json"
echo "✓ Done: $OUTPUT_DIR"
