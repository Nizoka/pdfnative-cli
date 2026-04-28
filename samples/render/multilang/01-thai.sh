#!/usr/bin/env bash
# render/multilang/01-thai.sh — render real Thai and multilingual PDFs
#
# The --lang flag in the pdfnative CLI activates a registered font loader.
# Because the CLI starts a fresh process each time, font loaders must be
# registered programmatically via registerFonts() BEFORE the render call.
# These two Node.js driver scripts do exactly that, using the Noto font data
# bundled inside pdfnative (no external font files required).
#
# Prerequisites:
#   - Node.js >= 20
#   - pdfnative installed: npm install (from repo root)
#
# Usage:
#   bash samples/render/multilang/01-thai.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "→ Rendering Thai sample (Noto Sans Thai, bundled with pdfnative)…"
node "$SCRIPT_DIR/03-thai.js"

echo ""
echo "→ Rendering multilingual sample (Thai + Japanese + Arabic + Russian)…"
node "$SCRIPT_DIR/04-multilingual.js"

echo ""
echo "Done. Output: $ROOT_DIR/samples/output/multilang/"
