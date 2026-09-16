#!/usr/bin/env bash
# render/typography/01-typography.sh — the four typography samples (v1.5.0, pdfnative 1.8.0)
#
# Renders 01–04 with the bundled Latin font (kerning, OpenType features and
# the French narrow no-break space need a registered font), then shows the
# pagination report of 01 with and without --split-paragraphs — no PDF is
# produced by --inspect-layout, only JSON.
#
# Usage:
#   bash samples/render/typography/01-typography.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/typography"
mkdir -p "$OUTPUT_DIR"

for f in 01-paragraph-breaking 02-justify-optical-hyphenation 03-french-spacing-units-short-words 04-kerning-features-metrics; do
  echo "→ Rendering $f"
  pdfnative render --input "$SCRIPT_DIR/$f.json" --output "$OUTPUT_DIR/$f.pdf" --font latin --lang latin
done

echo "→ Flags layer on top of layout.typography (one level deep): --kerning --font-features onum,smcp"
pdfnative render --input "$SCRIPT_DIR/02-justify-optical-hyphenation.json" --output "$OUTPUT_DIR/02-with-flags.pdf" \
  --font latin --lang latin --kerning --font-features onum,smcp

echo "→ Pagination of 01 without paragraph splitting (pages per block):"
pdfnative render --input "$SCRIPT_DIR/01-paragraph-breaking.json" --font latin --lang latin --inspect-layout \
  | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('   pages:',r.pageCount??r.pages?.length??'?')"
echo "→ Same with --split-paragraphs (the JSON already sets it; the flag is idempotent):"
pdfnative render --input "$SCRIPT_DIR/01-paragraph-breaking.json" --font latin --lang latin --split-paragraphs --inspect-layout \
  | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('   pages:',r.pageCount??r.pages?.length??'?')"
echo "✓ Output: $OUTPUT_DIR"
