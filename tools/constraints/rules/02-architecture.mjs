/**
 * The architecture rules that read one file: the process split, what a library may reach, what a package may name, where capabilities are registered, the size budgets.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import {
  AGENT_LINKING_PACKAGES,
  appProcessOf,
  countCodeLines,
  functionBlocks,
  ignoredFor,
  importSpecifiers,
  isCheckerSource,
  isComment,
  isDeclaration,
  isGenerated,
  isLibrarySource,
  isMainSource,
  isNodeBuiltin,
  isPluginAssembly,
  isSource,
  isTest,
  isTs,
  LIBRARY_DEPENDENCIES,
  libraryOf,
  PLUGIN_FACTORY_CALL,
  PLUGIN_FACTORY_DECLARATION,
  PURE_PACKAGES,
  relativeTarget,
  stripStrings,
} from '../lib.mjs'

export const ARCHITECTURE_RULES = [
  {
    id: '02-architecture:pure-packages-have-no-io',
    constraint: '02-architecture.md',
    description: 'the dictionary, the rules and the contract import neither Electron nor Node',
    check({ path, text }) {
      if (!PURE_PACKAGES.some((prefix) => path.startsWith(prefix))) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier === 'electron' || isNodeBuiltin(specifier)) {
            found.push({
              line: index + 1,
              message: `a pure package must not import ${specifier}; move the I/O to an adapter in main`,
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:no-electron-in-libraries',
    constraint: '02-architecture.md',
    description: 'no library holds a window',
    check({ path, text }) {
      if (!isLibrarySource(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier === 'electron') {
            found.push({
              line: index + 1,
              message: 'Electron belongs to the app: a library that holds a window cannot be tested alone',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:libraries-point-one-way',
    constraint: '02-architecture.md',
    description: 'a library imports only what sits under it',
    check({ path, text }) {
      const mine = libraryOf(path)
      if (mine === '') return []
      const allowed = LIBRARY_DEPENDENCIES[mine] ?? []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@alpha/')) {
            if (allowed.includes(specifier)) continue
            found.push({
              line: index + 1,
              message: `${specifier} is not below this library: C2.1 says which way the arrows point`,
              text: line.trim(),
            })
            continue
          }
          const target = relativeTarget(path, specifier)
          if (target !== '' && !target.startsWith(mine)) {
            found.push({
              line: index + 1,
              message: 'a library reaches another through its package, and the app not at all',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:capabilities-are-plugins',
    constraint: '02-architecture.md',
    description: 'a capability is registered in the assembly, not wired where it is used',
    check({ path, text }) {
      if (!isMainSource(path) || isTest(path) || isPluginAssembly(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        // Strings are stripped first: a factory named inside one is not a call to it.
        if (!PLUGIN_FACTORY_CALL.test(stripStrings(line)) || PLUGIN_FACTORY_DECLARATION.test(line)) return
        if (ignoredFor(line, { id: '02-architecture:capabilities-are-plugins', constraint: '02-architecture.md' })) {
          return
        }
        found.push({
          line: index + 1,
          message: 'a capability is registered in the assembly (assemble-runtime.ts), and nowhere else',
          text: line.trim(),
        })
      })
      return found
    },
  },

  {
    id: '02-architecture:renderer-has-no-model-client',
    constraint: '02-architecture.md',
    description: 'the renderer holds no model client',
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@earendil-works/')) {
            found.push({
              line: index + 1,
              message: 'the renderer must reach the agent through the IPC contract, not directly',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:processes-stay-apart',
    constraint: '02-architecture.md',
    description: 'a process reaches another over the contract, never through its files',
    check({ path, text }) {
      const mine = appProcessOf(path)
      if (mine === '') return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          const theirs = appProcessOf(relativeTarget(path, specifier))
          if (theirs === '' || theirs === mine) continue
          found.push({
            line: index + 1,
            message: `${mine} may not import ${theirs}: the processes talk over the contract`,
            text: line.trim(),
          })
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:renderer-is-solid',
    constraint: '02-architecture.md',
    description: 'the window is drawn by Solid, and React does not come back',
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/') || !/\.(ts|tsx)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          const react = specifier === 'react' || specifier === 'react-dom' || specifier === 'zustand'
          if (react || specifier.startsWith('@tanstack/') || /^react-(dom|markdown)/.test(specifier)) {
            found.push({
              line: index + 1,
              message: 'the window is Solid: a React package here means the migration grew back',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:no-agent-dependency',
    constraint: '02-architecture.md',
    description: 'the agent library links into main and the packages that attach to it, nowhere else',
    check({ path, text }) {
      if (!isSource(path) || !path.includes('/src/')) return []
      // The runtime is where the agent lives (ADR-0025); everywhere else the contract is the door,
      // except in the package that carries a capability whose face is pi's own shape (C2.8).
      if (path.startsWith('apps/desktop/src/main/')) return []
      if (AGENT_LINKING_PACKAGES.some((mine) => path.startsWith(mine))) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line) || line.includes('npm install')) return
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@earendil-works/') || /^pi-(agent-core|ai)$/.test(specifier)) {
            found.push({
              line: index + 1,
              message: 'the agent library links into main and its capability packages: C2.0 names them',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:max-file-lines',
    constraint: '02-architecture.md',
    description: 'a file fits in a head',
    check({ path, text }) {
      if (!isSource(path) || isTest(path) || isCheckerSource(path) || isDeclaration(path) || isGenerated(path)) {
        return []
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(path)) return []
      const count = countCodeLines(text.split('\n'))
      if (count <= 300) return []
      return [{ line: 1, message: `file has ${count} code lines; the limit is 300 — split it`, text: '' }]
    },
  },

  {
    id: '02-architecture:max-function-lines',
    constraint: '02-architecture.md',
    description: 'a function fits on a screen',
    check({ path, text }) {
      if (!isSource(path) || isTest(path) || isDeclaration(path) || !isTs(path)) return []
      const limit = path.startsWith('apps/desktop/src/renderer/') && path.endsWith('.tsx') ? 120 : 60
      return functionBlocks(text.split('\n'))
        .filter((block) => block.length > limit)
        .map((block) => ({
          line: block.start,
          message: `function runs ${block.length} lines; the limit is ${limit}`,
          text: '',
        }))
    },
  },
]
