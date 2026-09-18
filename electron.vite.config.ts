import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

/**
 * `electron` is the only import left unresolved in the main bundle; everything else is inlined.
 *
 * That is deliberate. The alternative — leaving the runtime's dependencies external so Node
 * resolves them at load time — does not work in this layout: the bundle is emitted to `out/` at
 * the repository root, while pnpm installs a workspace package's dependencies under that
 * package's own `node_modules`, so `import "@earendil-works/pi-ai"` from `out/main/index.js`
 * fails with ERR_MODULE_NOT_FOUND. Bundling makes `out/` self-contained in dev, in CI and in a
 * packaged build alike.
 *
 * The provider SDKs that `pi-ai` only reaches for lazily (Bedrock, Google, OAuth) stay external:
 * Alpha supports neither today, and dragging them into the bundle would multiply its size for
 * code paths nothing calls.
 */
const MAIN_EXTERNALS = [
  'electron',
  /^@aws-sdk\//,
  /^@google\//,
  /^@anthropic-ai\//,
  /^@openai\//,
  /^undici$/,
  /^@mariozechner\//,
]

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
