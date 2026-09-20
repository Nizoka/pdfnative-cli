#!/usr/bin/env bash
# render/pdfa/05-form-pdfa2b.sh — an AcroForm under a PDF/A-2b claim (v1.5.0)
#
# pdfnative 1.8.0 gives the form fields the embedded Latin font as their default
# resources, so a PDF/A document may carry an interactive form. --strict proves
# that no diagnostic is raised; without --font the render reports
# PDFA_UNEMBEDDED_FORM_FONT.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/pdfa/05-form-pdfa2b.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/pdfa"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering the archivable form"
pdfnative render --input "$SCRIPT_DIR/05-form-pdfa2b.json" --output "$OUTPUT_DIR/05-form-pdfa2b.pdf" --font latin --lang latin --strict --creation-date 2026-01-01T00:00:00Z
echo "→ The claim, and the fields a filler sees"
pdfnative inspect --input "$OUTPUT_DIR/05-form-pdfa2b.pdf" --check pdfa
pdfnative fill --input "$OUTPUT_DIR/05-form-pdfa2b.pdf" --export
echo "✓ Done: $OUTPUT_DIR"
