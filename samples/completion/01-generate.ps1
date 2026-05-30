# completion/01-generate.ps1 — generate shell completion scripts (v1.0.0)
#
# pdfnative emits bash / zsh / fish completion scripts. (PowerShell completion
# is on the roadmap.) Re-run after upgrading pdfnative-cli to refresh flags.
#
# Usage:
#   pwsh samples/completion/01-generate.ps1

$ErrorActionPreference = 'Stop'

Write-Host '-> bash (system-wide):'
Write-Host '    pdfnative completion bash | sudo tee /etc/bash_completion.d/pdfnative'
Write-Host ''
Write-Host '-> zsh (first fpath entry):'
Write-Host '    pdfnative completion zsh > "${fpath[1]}/_pdfnative"'
Write-Host ''
Write-Host '-> fish:'
Write-Host '    pdfnative completion fish > ~/.config/fish/completions/pdfnative.fish'
Write-Host ''
Write-Host 'First 8 lines of the bash script:'
pdfnative completion bash | Select-Object -First 8
