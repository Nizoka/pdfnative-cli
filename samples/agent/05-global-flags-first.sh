#!/usr/bin/env bash
# agent/05-global-flags-first.sh — global flags may precede the command name (v1.5.0)
#
# Until 1.4.0 `pdfnative --json render …` swallowed the command name as the
# value of --json (llms.txt documented the workaround). The boolean globals
# (--json, --dry-run, --quiet, --no-color, --no-config, --help, --version)
# never consume the next token now, so an agent can build argv as
# [globals..., command, flags...] in either order. The envelope arrives on
# stderr; stdout stays the artefact.
#
# Usage:
#   bash samples/agent/05-global-flags-first.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INPUT="$ROOT_DIR/samples/render/document/01-minimal.json"

echo "→ pdfnative --json --dry-run render --input … (globals first)"
pdfnative --json --dry-run render --input "$INPUT" 2>&1 >/dev/null

echo "→ pdfnative render --input … --json --dry-run (globals last — still fine)"
pdfnative render --input "$INPUT" --json --dry-run 2>&1 >/dev/null

echo "→ --creation-date is global too: pdfnative --creation-date 2026-01-01T00:00:00Z --json render …"
pdfnative --creation-date 2026-01-01T00:00:00Z --json --dry-run render --input "$INPUT" 2>&1 >/dev/null
echo "  ✓ every form resolved \"render\" as the command"
