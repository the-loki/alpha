import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import solid from 'vite-plugin-solid'

/**
 * `electron` is the only import left unresolved; everything else is inlined.
 *
 * That is deliberate. The alternative — leaving the runtime's dependencies external so Node
 * resolves them at load time — does not work in this layout: the bundle is emitted to `out/` at
 * the repository root, while pnpm installs a workspace package's dependencies under that
 * package's own `node_modules`, so an import from `out/main/index.js` fails with
 * ERR_MODULE_NOT_FOUND. Bundling makes `out/` self-contained in dev, in CI and in a packaged
 * build alike.
 */
const MAIN_EXTERNALS = ['electron']

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: 'packages/main/src/index.ts' },
        external: MAIN_EXTERNALS,
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
    // Solid compiles JSX to DOM operations, so the renderer needs no framework runtime and no
    // virtual-DOM diffing: what the window draws is what the runtime events changed (ADR-0021).
    plugins: [solid(), tailwindcss()],
    build: {
      rollupOptions: {
        input: { index: 'packages/renderer/index.html' },
      },
    },
  },
})
