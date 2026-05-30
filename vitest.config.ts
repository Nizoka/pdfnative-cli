import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            // Excluded from coverage thresholds — exercised by the
            // sign→verify integration test and targeted unit tests for their
            // pure helpers, but their deep branches require integration-grade
            // PKI fixtures that belong in pdfnative, not unit fixtures here:
            //   - index.ts            dispatcher (samples/run-all.js smoke)
            //   - commands/verify.ts  CMS parsing needs a signed-PDF fixture
            //   - cms-verify.ts       RSA/ECDSA CMS engine — real SignedData
            //   - revocation.ts       OCSP/CRL responders + a DSS-equipped PDF
            //   - timestamp-verify.ts a real RFC 3161 TSA token
            //   - fetch-guard.ts      a reachable PUBLIC host (loopback is
            //                         blocked by the SSRF guard by design)
            exclude: [
                'src/index.ts',
                'src/commands/verify.ts',
                'src/utils/cms-verify.ts',
                'src/utils/revocation.ts',
                'src/utils/timestamp-verify.ts',
                'src/utils/fetch-guard.ts',
            ],
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
                // NOTE: vitest 4 enables AST-aware V8 coverage remapping by
                // default, which counts branches/functions more granularly than
                // vitest 2. The same 226 tests cover the same code, but the
                // reported percentages are lower; thresholds are re-baselined to
                // the vitest-4 measurement (not a real coverage regression).
                statements: 79,
                branches: 68,
                functions: 83,
                lines: 79,
            },
        },
    },
});
