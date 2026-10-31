/**
 * pdfnative-cli — the fuzzing surface
 * ===================================
 * Every parser the ClusterFuzzLite targets in this directory exercise, in
 * one module: the CLI's own input grammars (argv, the config file, batch
 * manifests, annotation specs, layout JSON, page selectors, dates, the URL
 * guard, the `--font-file` sniffer) and the one engine parser the CLI hands
 * user bytes to before rendering (`parseFontData`).
 *
 * The targets import this file as `#fuzz-surface`:
 *   - in the container, package.json `imports` resolves it to
 *     `fuzz/.build/fuzz-surface.js`, a tsup bundle with the engine inside
 *     (build.sh replaces node_modules by the fuzzing engine's tree);
 *   - under vitest, the alias in vitest.config.ts resolves it to this
 *     source file, so `tests/fuzz/targets.test.ts` runs the same targets
 *     against `src/` on every gate run.
 *
 * Nothing here reads a file, opens a socket or looks a name up: the file
 * discovery of `loadConfig`, the DNS step of `guardedFetch` and the disk
 * read of `--font-file` stay in `src/`, behind the pure halves exported
 * here. The two classes a target treats as a refusal are exported under
 * their own names; everything else is a function the planted-error test
 * replaces to prove the targets rethrow an engine error.
 *
 * @module fuzz/surface
 */

export { CliError, ErrorCode } from '../src/utils/error.js';
export { FetchGuardError, isBlockedAddress, parseFetchUrl } from '../src/utils/fetch-guard.js';
export { GLOBAL_BOOLEAN_FLAGS, parseArgs } from '../src/utils/args.js';
export { splitCommandArgv } from '../src/utils/argv.js';
export { KNOWN_COMMANDS, parseConfigText } from '../src/utils/config.js';
export { assertOfflinePolicy, parseManifest } from '../src/utils/manifest.js';
export { parseAnnotationsJson } from '../src/commands/annotate.js';
export { deepMerge, isPlainObject, mergeNestedLayout, reviveLayoutJson } from '../src/utils/layout.js';
export { parsePageList, parsePageRanges } from '../src/utils/pages.js';
export { pdfDateToIso } from '../src/utils/pdfdate.js';
export { parseIsoDate, parseSourceDateEpoch } from '../src/utils/reproducible.js';
export { defaultFontName, parseFontFileSpec, sniffFontFormat } from '../src/utils/fonts.js';
export { parseFontData } from '../src/core-bridge/index.js';
