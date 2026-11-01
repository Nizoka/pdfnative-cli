#!/bin/bash -eu
# pdfnative-cli — the ClusterFuzzLite build step.
#
# What the targets fuzz is the CLI's own parsers — argv, the config file,
# batch manifests, annotation specs, layout JSON, page selectors, dates, the
# URL guard, the --font-file path — reached through `#fuzz-surface`, which
# package.json resolves to fuzz/.build/fuzz-surface.js: a tsup bundle of
# fuzz/surface.ts with the engine inside, because this script replaces
# node_modules by the fuzzing engine's tree before the targets load.
# `tests/fuzz/targets.test.ts` runs the same files against `src/` through
# vitest's alias, so the targets are proved callable and proved to rethrow an
# engine error before they ever reach a container. One file, two engines,
# and the half that can be checked anywhere is checked everywhere.

cd "$SRC/pdfnative-cli"

# --ignore-scripts, the same rule as every runner and every contributor
# machine (.npmrc): no dependency's lifecycle script runs while building a
# fuzzing image either. `npm run build` writes dist/ and the fuzz surface.
npm ci --ignore-scripts
npm run build

# Seed corpora, built from the repository's own inputs
# (tests/fuzz/_fuzz-seeds.ts): the sample manifests, annotation specs and
# config, the layout objects of the render samples, argv lines, selectors,
# dates, URLs and one bundled TrueType face. Starting a parser fuzzer from
# random bytes wastes hours rediscovering `{ "version": 1`; starting it from
# an input that parses puts it inside the grammar on the first mutation.
# targets.test.ts proves every seed parses, on every gate run.
seeds="$(mktemp -d)"
npx tsx tests/fuzz/_fuzz-seeds.ts "$seeds"
for target in annotations argv config font-file layout manifest pages pdfdate url; do
  zip -j "$OUT/${target}_seed_corpus.zip" "$seeds/$target"/*.bin >/dev/null
done

# The engine, never in the manifest. .clusterfuzzlite/engine/package.json
# names one exact version, and its package-lock.json pins every package of
# the engine's tree to a version and a sha512 integrity that `npm ci` checks
# before it unpacks anything — no range, no resolution at build time, the
# same supply-chain rule as the project's own lockfile. The project's
# node_modules is then replaced by the engine's: the targets import only
# fuzz/.build/, which has no dependency, and the OSS-Fuzz wrapper runs
# `<project>/node_modules/@jazzer.js/core/dist/cli.js`.
(cd .clusterfuzzlite/engine && npm ci --ignore-scripts)
rm -rf node_modules
mv .clusterfuzzlite/engine/node_modules node_modules

compile_javascript_fuzzer pdfnative-cli fuzz/annotations.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/argv.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/config.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/font-file.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/layout.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/manifest.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/pages.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/pdfdate.js --sync
compile_javascript_fuzzer pdfnative-cli fuzz/url.js --sync
