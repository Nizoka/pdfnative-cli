#!/usr/bin/env bash
# agent/02-schema.sh — discover input/output shapes via the schema command
#
# Agents can fetch a versioned JSON Schema (Draft 2020-12) for any CLI
# input/output shape and self-validate BEFORE invoking a command. Schemas carry
# a $id that embeds the CLI version so drift is detectable.
#
# Usage: bash samples/agent/02-schema.sh

set -euo pipefail

echo "→ Available schema subjects:"
pdfnative schema list

echo
echo "→ render input schema (default subject):"
pdfnative schema render

echo
echo "→ inspect output schema:"
pdfnative schema inspect
