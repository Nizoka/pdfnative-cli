#!/usr/bin/env bash
# render/multilang/08-language-families.sh — the script families of pdfnative 1.8.0 and 1.9.0 (v1.5.0, v1.6.0)
#
# Five documents load the 19 script modules no other sample uses: Greek, Cyrillic,
# Georgian, Armenian, Polish, Turkish, Vietnamese (08); Arabic and Hebrew (09);
# Hindi, Bengali and Tamil (10); Chinese and Korean (11); Gujarati, Punjabi,
# Kannada, Malayalam and Odia (12, pdfnative 1.9.0). With the other samples
# every one of the 32 script codes is rendered by the corpus.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/multilang/08-language-families.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/multilang"
mkdir -p "$OUTPUT_DIR"

echo "→ European and Caucasian alphabets"
pdfnative render --input "$SCRIPT_DIR/08-european-caucasian.json" --output "$OUTPUT_DIR/08-european-caucasian.pdf" --font el --font ru --font ka --font hy --font pl --font tr --font vi --font latin --lang "el,ru,ka,hy,pl,tr,vi,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Right-to-left"
pdfnative render --input "$SCRIPT_DIR/09-rtl.json" --output "$OUTPUT_DIR/09-rtl.pdf" --font ar --font he --font latin --lang "ar,he,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Indic"
pdfnative render --input "$SCRIPT_DIR/10-indic.json" --output "$OUTPUT_DIR/10-indic.pdf" --font hi --font bn --font ta --font latin --lang "hi,bn,ta,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Chinese and Korean"
pdfnative render --input "$SCRIPT_DIR/11-cjk.json" --output "$OUTPUT_DIR/11-cjk.pdf" --font zh --font ko --font latin --lang "zh,ko,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Gujarati, Punjabi, Kannada, Malayalam and Odia (pdfnative 1.9.0)"
pdfnative render --input "$SCRIPT_DIR/12-five-indic-scripts.json" --output "$OUTPUT_DIR/12-five-indic-scripts.pdf" --font gu --font pa --font kn --font ml --font or --font latin --lang "gu,pa,kn,ml,or,latin" --creation-date 2026-01-01T00:00:00Z
echo "✓ Done: $OUTPUT_DIR"
