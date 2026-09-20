import { defineConfig } from 'vitest/config';

/**
 * Reporters are chosen for token-cheap output: `dot` prints one character
 * per test instead of one line per file, and `github-actions` adds inline
 * annotations on CI only. When `scripts/gate.ts` drives the run (GATE=1) a
 * JSON report is written as well, which is where the gate reads the test
 * count from; nothing else needs the file, so it is not produced otherwise.
 */
const reporters: Array<'dot' | 'github-actions' | ['json', { outputFile: string }]> = ['dot'];
if (process.env.GITHUB_ACTIONS) reporters.push('github-actions');
if (process.env.GATE === '1') reporters.push(['json', { outputFile: 'test-output/.gate/vitest.json' }]);

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        reporters,
        // PDF dates carry the local UTC offset, so any test that formats one
        // would otherwise pass in Paris and fail on a UTC runner (or the
        // reverse). Pinning the zone here makes the suite machine-independent;
        // scripts/helpers/tz.ts does the same for the sample generator.
        env: { TZ: 'UTC' },
        // Process isolation: a test that leaks a global, a timer, an env var
        // (PDFNATIVE_JSON, TZ) or a registered font cannot influence the next
        // file's outcome.
        pool: 'forks',
        // Determinism: the same ordering on every machine, so a failure seen
        // in CI reproduces locally without a seed.
        sequence: { shuffle: false },
        // AES-256 (Standard Security Handler R6) key derivation runs many
        // SHA-2 rounds per operation and is CPU-bound, so the encrypt /
        // render-encryption tests can exceed the 5 s default on slower or
        // loaded machines. Give every test more headroom (real hangs are still
        // caught well within this bound).
        testTimeout: 20000,
        hookTimeout: 30_000,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            // Excluded from coverage thresholds — exercised by the
            // sign→verify integration test and targeted unit tests for their
            // pure helpers, but their deep branches require integration-grade
            // PKI fixtures that belong in pdfnative, not unit fixtures here:
            //   - index.ts            dispatcher (the gate's `smoke` step
            //                         drives the built binary)
            //   - commands/verify.ts  CMS parsing needs a signed-PDF fixture
            //   - cms-verify.ts       RSA/ECDSA CMS engine — real SignedData
            //   - revocation.ts       OCSP/CRL responders + a DSS-equipped PDF
            //   - timestamp-verify.ts a real RFC 3161 TSA token
            //   - fetch-guard.ts      a reachable PUBLIC host (loopback is
            //                         blocked by the SSRF guard by design)
            //   - tsa.ts              real-TSA transport on fetch-guard; tests
            //                         inject a mock TimestampProvider instead
            //   - ltv-provider.ts     real OCSP/CRL transport on fetch-guard;
            //                         tests inject a mock RevocationProvider
            exclude: [
                'src/index.ts',
                'src/commands/verify.ts',
                'src/utils/cms-verify.ts',
                'src/utils/revocation.ts',
                'src/utils/timestamp-verify.ts',
                'src/utils/fetch-guard.ts',
                'src/utils/tsa.ts',
                'src/utils/ltv-provider.ts',
            ],
            // `text-summary` is four lines instead of one per source file;
            // `json-summary` is what scripts/gate.ts reads the percentage
            // from; `html` stays for local drill-down.
            reporter: ['text-summary', 'json-summary', 'html'],
            thresholds: {
                // Thresholds reflect unit coverage for the directly testable
                // surface: arg parsing, config loading, completions, batch,
                // layout, key parsing, cert-chain, colors and asn1-walk. The
                // CMS/PKI/LTV verification engine and the SSRF-guarded fetch
                // client are validated by the integration round-trip plus the
                // pure-helper unit tests above, and are excluded here because
                // full branch coverage requires OCSP/CRL/TSA/DSS fixtures and
                // a reachable public host.
                //
                // The thresholds live once, here; docs/assets/ecosystem.json
                // `declared.coverageStatements` mirrors the statements floor
                // and `verify:docs` holds every document to it. They are
                // re-measured at each release and never lowered.
                statements: 82,
                branches: 71,
                functions: 86,
                lines: 82,
            },
        },
    },
});
