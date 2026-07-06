#!/usr/bin/env bash
# govern/02-verify-issue.sh — gate an issue/PR draft against the HITL policy
#
# `govern verify-issue <draft.md>` validates a locally-authored draft before a
# human reviews and submits it. It PASSES a compliant draft (exit 0) and BLOCKS
# a non-compliant one (exit 1, error code E_POLICY) — e.g. a draft that proposes
# adding a runtime dependency, or one missing a reproduction code block.
#
# A passing check is necessary but NOT sufficient: a human must still review and
# submit under their own GitHub identity.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/govern/02-verify-issue.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ [1/2] Verifying a COMPLIANT draft (expect PASS / exit 0)…"
if pdfnative govern verify-issue "$SCRIPT_DIR/draft-good.md"; then
  echo "  ✓ draft-good.md passed."
else
  echo "  ✗ Unexpected failure on draft-good.md" >&2
fi

echo
echo "→ [2/2] Verifying a NON-COMPLIANT draft (expect BLOCK / exit 1)…"
if pdfnative govern verify-issue "$SCRIPT_DIR/draft-bad.md"; then
  echo "  ✗ draft-bad.md unexpectedly passed" >&2
else
  echo "  ✓ draft-bad.md was correctly blocked (E_POLICY)."
fi
