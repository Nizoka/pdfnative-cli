#!/usr/bin/env bash
# doctor/01-doctor.sh — environment / capability preflight (pdfnative-cli 1.3.0)
#
# `doctor` reports the CLI version, Node version, Web Crypto (CSPRNG)
# availability (required by `encrypt`), the resolved pdfnative version, and the
# registered command count. Fully offline. Exit code 0 when all checks pass, 1
# otherwise — ideal as an agent pre-flight before attempting `encrypt`.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/doctor/01-doctor.sh

set -euo pipefail

echo "→ [1/2] Human-readable report:"
pdfnative doctor

echo "→ [2/2] Machine-readable report (agent pre-flight):"
pdfnative doctor --format json
echo "  (exit code $? — 0 means all capabilities are available)"
