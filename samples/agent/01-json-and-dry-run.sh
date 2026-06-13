#!/usr/bin/env bash
# agent/01-json-and-dry-run.sh — agent mode: --json status envelope + --dry-run
#
# In agent mode (--json) the CLI keeps the primary artifact on stdout and emits
# a single JSON status/error envelope on stderr. --dry-run validates the input
# and exits 0 WITHOUT writing any output. Both are designed for autonomous AI
# agents and CI pipelines that branch on machine-readable results.
#
# Usage: bash samples/agent/01-json-and-dry-run.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INPUT="$ROOT_DIR/render/document/01-minimal.json"

echo "→ Dry-run validation (no file written); status envelope on stderr:"
# stdout (the PDF) is discarded; the JSON envelope is on stderr.
pdfnative render --input "$INPUT" --dry-run --json >/dev/null

echo
echo "→ Real render to a file; success envelope on stderr:"
OUT_DIR="$ROOT_DIR/output/agent"
mkdir -p "$OUT_DIR"
pdfnative render --input "$INPUT" --output "$OUT_DIR/01-minimal.pdf" --json
echo "  (envelope above carries { ok, command, output, bytes })"
