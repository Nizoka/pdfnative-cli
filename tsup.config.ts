import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: { cli: 'src/index.ts' },
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        splitting: false,
        treeshake: true,
        minify: false,
        target: 'es2022',
        outDir: 'dist',
        // Inject shebang only into the CJS binary — the ESM variant is
        // intended for programmatic consumption (e.g. Bun, Deno).
        banner: {
            js: '#!/usr/bin/env node',
        },
        noExternal: [],
    },
    {
        // The ClusterFuzzLite surface (fuzz/surface.ts → fuzz/.build/, git-ignored,
        // never in the package): the CLI's own parsers with the engine bundled
        // in, because .clusterfuzzlite/build.sh replaces node_modules by the
        // fuzzing engine's tree before the targets load. Resolved by the
        // targets through the `#fuzz-surface` import of package.json; vitest
        // aliases the same specifier to the source file.
        entry: { 'fuzz-surface': 'fuzz/surface.ts' },
        format: ['esm'],
        dts: false,
        sourcemap: false,
        clean: true,
        splitting: false,
        treeshake: true,
        minify: false,
        target: 'es2022',
        platform: 'node',
        outDir: 'fuzz/.build',
        noExternal: ['pdfnative', 'pdfnative/tools'],
    },
]);
