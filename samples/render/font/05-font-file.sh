#!/usr/bin/env bash
# render/font/05-font-file.sh — a font you ship, embedded with --font-file (v1.5.0)
#
# --font-file <path.ttf>[:name] registers a TrueType/OpenType program from
# disk and embeds it (it is added to --lang). Guarded: path checked against
# traversal, 32 MB cap, sfnt signature required (no collections, no WOFF),
# parsed and validated by pdfnative's font compiler before registration —
# and never loaded from JSON. Point PDFNATIVE_FONT_FILE at any OFL/free
# TTF; without it the script demonstrates with a TTF decoded from a bundled
# pdfnative module (no download).
#
# Usage:
#   PDFNATIVE_FONT_FILE=/path/to/Inter-Regular.ttf bash samples/render/font/05-font-file.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/font"
mkdir -p "$OUTPUT_DIR"

FONT="${PDFNATIVE_FONT_FILE:-}"
if [ -z "$FONT" ]; then
  FONT="$OUTPUT_DIR/NotoSansHebrew-from-module.ttf"
  echo "→ PDFNATIVE_FONT_FILE not set: extracting a TTF from pdfnative's bundled Hebrew module"
  node -e '
    const { createRequire } = require("node:module");
    const { readFileSync, writeFileSync } = require("node:fs");
    const req = createRequire(process.argv[1] + "/package.json");
    const main = req.resolve("pdfnative");
    const mod = readFileSync(require("node:path").join(main, "..", "..", "fonts", "noto-hebrew-data.js"), "utf8");
    const m = /ttfBase64\s*=\s*["\x27]([A-Za-z0-9+/=]+)["\x27]/.exec(mod);
    if (!m) throw new Error("ttfBase64 not found");
    writeFileSync(process.argv[2], Buffer.from(m[1], "base64"));
  ' "$ROOT_DIR" "$FONT"
fi

printf '{"title":"Custom font","blocks":[{"type":"heading","text":"Set in a font shipped by the user","level":1},{"type":"paragraph","text":"שלום עולם — this run uses the --font-file program for the glyphs it covers; the rest falls back to the registered or base-14 fonts."}]}' > "$OUTPUT_DIR/custom-font.json"
echo "→ pdfnative render --font-file \"$FONT:brand\""
pdfnative render --input "$OUTPUT_DIR/custom-font.json" --output "$OUTPUT_DIR/05-font-file.pdf" --font-file "$FONT:brand" --json
echo "✓ Written: $OUTPUT_DIR/05-font-file.pdf"
