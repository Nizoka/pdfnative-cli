import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts'],
            // v0.1.0 coverage thresholds (initial CLI release)
            // Edge cases and error handling paths have limited coverage by design (I/O, PDF parsing).
            // v0.2.0 will target 90%+ statements / 85%+ branches.
            // Track coverage improvements: https://github.com/Nizoka/pdfnative-cli/issues/coverage
            thresholds: {
                statements: 75,
                branches: 70,
                functions: 85,
                lines: 75,
            },
        },
    },
});
