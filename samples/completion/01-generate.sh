#!/usr/bin/env bash
# completion/01-generate.sh — generate shell completion scripts (v1.0.0)
#
# Emits bash / zsh / fish completion scripts. Pick the install path that
# matches your shell. Re-run after upgrading pdfnative-cli to refresh flags.
#
# Usage:
#   bash samples/completion/01-generate.sh

set -euo pipefail

echo "→ bash (system-wide):"
echo "    pdfnative completion bash | sudo tee /etc/bash_completion.d/pdfnative >/dev/null"
echo ""
echo "→ zsh (first fpath entry):"
echo '    pdfnative completion zsh > "${fpath[1]}/_pdfnative"'
echo ""
echo "→ fish:"
echo "    pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish"
echo ""
echo "First 8 lines of the bash script:"
pdfnative completion bash | head -n 8
