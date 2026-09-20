#!/usr/bin/env bash
# doctor/02-capabilities.sh — the v1.5.0 capability checks as an agent gate
#
# doctor reports, beside the CLI/Node/Web Crypto/pdfnative checks, the
# bundled font inventory (31 modules / 27 scripts, each probed on disk), the
# Unicode version of the shaping engine and the conformance targets of
# --tagged and --pdfx. An agent branches on the JSON before rendering a
# script it needs a font for.
#
# Usage:
#   bash samples/doctor/02-capabilities.sh

set -euo pipefail

echo "→ pdfnative doctor --json --fields ok,checks"
pdfnative doctor --json --fields ok,checks

echo "→ Gate: is the Lao font (lo) available and is pdfx4 a supported target?"
REPORT=$(pdfnative doctor --format json)
node -e '
  const r = JSON.parse(process.argv[1]);
  const by = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  const fontsOk = by.fonts.status === "ok" && by.fonts.detail.includes("lo");
  const pdfxOk = by.conformance.value.split(",").includes("pdfx4");
  console.log(`   fonts: ${by.fonts.value} (${fontsOk ? "lo available" : "lo MISSING"})`);
  console.log(`   unicode: ${by.unicode.value}`);
  console.log(`   pdfx4 target: ${pdfxOk ? "yes" : "no"}`);
  process.exit(fontsOk && pdfxOk ? 0 : 1);
' "$REPORT"
echo "  ✓ PASS — the environment can render Lao and claim PDF/X-4."
