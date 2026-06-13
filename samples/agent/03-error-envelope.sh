#!/usr/bin/env bash
# agent/03-error-envelope.sh — deterministic failures via the JSON error envelope
#
# In agent mode (--json) every failure produces a single JSON object on stderr:
#   { "ok": false, "command": "...", "error": { "code": "E_*", "message": "..." } }
# The stable `code` lets an agent branch on the failure class without parsing
# the human-readable message. Numeric exit codes (0/1/2) are unchanged.
#
# Usage: bash samples/agent/03-error-envelope.sh

set -uo pipefail

echo "→ Feeding non-PDF bytes to inspect --json (expect E_PARSE on stderr):"
printf 'not a pdf' | pdfnative inspect --json || echo "  (exit code: $?)"

echo
echo "→ Unknown schema subject (expect E_USAGE, exit 2):"
pdfnative schema bogus --json || echo "  (exit code: $?)"
