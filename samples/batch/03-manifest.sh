#!/usr/bin/env bash
# batch/03-manifest.sh — run a declarative multi-command pipeline (v1.4.0)
#
# Demonstrates `batch --manifest`: a tasks.json declares an ordered pipeline
# (render → encrypt → inspect) where "@id" values reference the output of an
# earlier task. Fully offline — network-reaching flags in a manifest are
# refused unless batch is invoked with --allow-network.
#
# Usage:
#   bash samples/batch/03-manifest.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest/tasks.json"
# Manifest-relative paths get the same traversal check as direct CLI flags, so
# the pipeline writes below the manifest's own directory (git-ignored).
OUT_DIR="$SCRIPT_DIR/manifest/out"

echo "→ Previewing the pipeline (nothing is executed):"
pdfnative batch --manifest "$MANIFEST" --dry-run

echo ""
echo "→ Running the manifest pipeline (render → encrypt → inspect):"
pdfnative batch --manifest "$MANIFEST" --format json

echo ""
echo "  ✓ PDFs written to $OUT_DIR (exit code is 1 if any task fails)."
