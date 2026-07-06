#!/usr/bin/env bash
# govern/01-rules.sh — surface pdfnative's AI-governance / HITL contract
#
# The `govern` command exposes the pdfnative 1.5.0 AI-governance model to any
# agent driving the CLI:
#   • govern rules   → the human/agent protocol (AGENT_RULES) on stdout
#   • govern policy  → the machine-readable policy JSON on stdout
#
# Agents act as *draftsmen*: they may draft an issue/PR locally, but a HUMAN
# must review and submit it. Nothing here touches the network or GitHub.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/govern/01-rules.sh

set -euo pipefail

echo "→ Human/agent protocol (govern rules):"
pdfnative govern rules

echo
echo "→ Machine-readable policy (govern policy):"
pdfnative govern policy --pretty
