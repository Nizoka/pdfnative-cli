#!/usr/bin/env bash
# agent/04-token-economy.sh — shrink agent output ~90% with --summary / --fields
#
# The JSON that inspect/verify/batch write to stdout is the bulk of an agent's
# token cost. Three composable levers cut it dramatically without losing the
# fields an orchestrator branches on:
#   1. compact JSON — automatic under --json (--pretty opts back in)
#   2. --summary    — a canonical minimal verdict
#   3. --fields a,b — keep only named dot-paths
#
# Usage: bash samples/agent/04-token-economy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INPUT="$ROOT_DIR/render/document/01-minimal.json"

OUT_DIR="$ROOT_DIR/output/agent"
mkdir -p "$OUT_DIR"
PDF="$OUT_DIR/04-token-economy.pdf"
pdfnative render --input "$INPUT" --output "$PDF" >/dev/null

echo "→ Full inspect report (pretty, human form):"
pdfnative inspect --input "$PDF" | head -c 400; echo '…'

echo
echo "→ Same probe, agent summary (compact, minimal verdict):"
pdfnative inspect --input "$PDF" --json --summary

echo
echo "→ Just the two fields an agent needs:"
pdfnative inspect --input "$PDF" --json --fields pageCount,signatures

echo
echo "→ verify minimal verdict:"
pdfnative verify --input "$PDF" --json --summary
