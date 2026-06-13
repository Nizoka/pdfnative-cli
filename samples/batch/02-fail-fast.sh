#!/usr/bin/env bash
# batch/02-fail-fast.sh — stop a batch at the first failure (v1.0.0)
#
# By default `batch` renders every file then reports failures. With --fail-fast
# it aborts as soon as one render fails, which is what you want in CI. This
# sample builds a scratch input directory containing one valid and one invalid
# document, runs the batch with --fail-fast, and asserts a non-zero exit.
#
# Usage:
#   bash samples/batch/02-fail-fast.sh

set -uo pipefail   # not -e: we expect the batch to exit non-zero

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IN_DIR="$ROOT_DIR/output/batch-failfast/in"
OUT_DIR="$ROOT_DIR/output/batch-failfast/out"

rm -rf "$ROOT_DIR/output/batch-failfast"
mkdir -p "$IN_DIR" "$OUT_DIR"

# A valid document…
cp "$ROOT_DIR/render/document/01-minimal.json" "$IN_DIR/01-ok.json"
# …and a deliberately invalid one (not a JSON document definition).
printf '{ this is not valid json' > "$IN_DIR/02-broken.json"

echo "→ Batch with --fail-fast over one valid + one invalid input:"
pdfnative batch \
  --input-dir  "$IN_DIR" \
  --output-dir "$OUT_DIR" \
  --fail-fast \
  --format     json
STATUS=$?

echo ""
echo "  exit code: $STATUS (expected non-zero)"
if [ "$STATUS" -ne 0 ]; then
  echo "  ✓ PASS — batch aborted on the first failure."
else
  echo "  ✗ UNEXPECTED — batch did not fail."
  exit 1
fi
