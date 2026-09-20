# render/font/05-font-file.ps1 — a font you ship, embedded with --font-file (v1.5.0)
#
# --font-file <path.ttf>[:name] registers a TrueType/OpenType program from
# disk and embeds it. Guarded: path, 32 MB cap, sfnt signature, parsed and
# validated by pdfnative's font compiler; never loaded from JSON. Point
# $env:PDFNATIVE_FONT_FILE at any OFL/free TTF; without it a TTF is decoded
# from a bundled pdfnative module (no download).

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\font'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$Font = $env:PDFNATIVE_FONT_FILE
if (-not $Font) {
    $Font = Join-Path $OutputDir 'NotoSansHebrew-from-module.ttf'
    Write-Host '→ PDFNATIVE_FONT_FILE not set: extracting a TTF from pdfnative''s bundled Hebrew module'
    $script = @'
const { createRequire } = require("node:module");
const { readFileSync, writeFileSync } = require("node:fs");
const req = createRequire(process.argv[1] + "/package.json");
const main = req.resolve("pdfnative");
const mod = readFileSync(require("node:path").join(main, "..", "..", "fonts", "noto-hebrew-data.js"), "utf8");
const m = /ttfBase64\s*=\s*["']([A-Za-z0-9+/=]+)["']/.exec(mod);
if (!m) throw new Error("ttfBase64 not found");
writeFileSync(process.argv[2], Buffer.from(m[1], "base64"));
'@
    & node -e $script $RootDir $Font
}

$doc = '{"title":"Custom font","blocks":[{"type":"heading","text":"Set in a font shipped by the user","level":1},{"type":"paragraph","text":"שלום עולם — this run uses the --font-file program for the glyphs it covers; the rest falls back to the registered or base-14 fonts."}]}'
Set-Content -Path (Join-Path $OutputDir 'custom-font.json') -Value $doc -Encoding utf8
Write-Host "→ pdfnative render --font-file `"$Font`:brand`""
& pdfnative render --input (Join-Path $OutputDir 'custom-font.json') --output (Join-Path $OutputDir '05-font-file.pdf') --font-file "${Font}:brand" --json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Written: $(Join-Path $OutputDir '05-font-file.pdf')"
