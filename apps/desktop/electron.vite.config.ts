import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import solid from 'vite-plugin-solid'

/**
 * `electron` is the only import left unresolved; everything else is inlined into `out/`.
 *
 * That is deliberate. The alternative — leaving the runtime's dependencies external so Node
 * resolves them at load time — would work in this tree and stop working in a packaged build:
 * electron-builder ships `out/**` and the app's `package.json`, not its `node_modules`, so an
 * import Node has to resolve is an import a packaged Alpha does not have. Bundling makes `out/`
 * self-contained in dev, in CI and in the installer alike.
 */
const MAIN_EXTERNALS = ['electron']

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: 'src/main/index.ts' },
        external: MAIN_EXTERNALS,
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: 'src/preload/index.ts' },
        external: ['electron'],
        // CommonJS, because Electron only loads an ESM preload when the sandbox is off.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    // Solid compiles JSX to DOM operations, so the renderer needs no framework runtime and no
    // virtual-DOM diffing: what the window draws is what the runtime events changed (ADR-0021).
    plugins: [solid(), tailwindcss()],
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'src/renderer/index.html') },
      },
    },
  },
})
