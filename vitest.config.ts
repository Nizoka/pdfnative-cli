import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            // src/index.ts: dispatcher, exercised by integration smoke (samples/run-all.js).
            // src/commands/verify.ts: CMS-parsing branches require a signed-PDF fixture
            //   covered by tests/integration/sign-verify-roundtrip.test.ts (happy path);
            //   defensive parse-error branches are not unit-targeted.
            exclude: ['src/index.ts', 'src/commands/verify.ts'],
            thresholds: {
                // v0.3.0 hardening: thresholds raised to reflect added unit
                // coverage for asn1-walk, cert-fix, sign-placeholder and EC
                // key parsing. Branch coverage on `cms-verify.ts` and the
                // streaming I/O paths is intentionally lower — those branches
                // are exercised by the sign→verify integration test
                // (tests/integration/sign-verify-roundtrip.test.ts) rather
                // than by isolated unit tests, since they require valid CMS
                // / encrypted PDF fixtures whose construction belongs in
                // pdfnative itself.
                statements: 79,
                branches: 77,
                functions: 95,
                lines: 79,
            },
        },
    },
});
