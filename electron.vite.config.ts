import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const require = createRequire(import.meta.url)

/**
 * What stays out of each bundle is derived from the manifest of the package being built: a
 * dependency a package declares is one it resolves through Node at runtime, so it must not be
 * inlined. `@alpha/core` is the deliberate exception — it is source-only (`exports` points at
 * `src`), so it is bundled into whoever imports it.
 *
 * This is written out by hand rather than left to `build.externalizeDeps` because that option
 * had no effect under electron-vite 5 + Vite 8 in this repo: the built output still contained
 * Electron's own `getElectronPath()` inlined into the main bundle, which is what made the app
 * fail to launch with "Unable to find Electron app". An explicit list is checkable, and the
 * smoke test catches a regression here loudly.
 */
const externalFor = (manifest: string): string[] =>
  [...Object.keys(require(manifest).dependencies ?? {}), 'electron'].filter((name) => name !== '@alpha/core')

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: 'packages/main/src/index.ts' },
        external: externalFor('./packages/main/package.json'),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: 'packages/preload/src/index.ts' },
        external: ['electron'],
        // CommonJS, because Electron only loads an ESM preload when the sandbox is off.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'packages/renderer',
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: 'src/routes',
        generatedRouteTree: 'src/routeTree.gen.ts',
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        input: { index: 'packages/renderer/index.html' },
      },
    },
  },
})
