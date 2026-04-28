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
            //   (real RSA key + self-signed X.509 DER). Generating a self-signed cert
            //   without an external library / openssl is non-trivial; full integration
            //   coverage is tracked for v0.3.0 (issue: signing fixture).
            exclude: ['src/index.ts', 'src/commands/verify.ts'],
            thresholds: {
                // v0.2.0 thresholds — slightly above current measured coverage so that
                // any regression is caught without forcing speculative/synthetic tests.
                statements: 75,
                branches: 80,
                functions: 85,
                lines: 75,
            },
        },
    },
});
