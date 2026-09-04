/**
 * The conventions, as assertions.
 *
 * CONTRIBUTING.md says what the codebase agrees on. This says it again in a form
 * that fails, because a rule that lives only in prose is the rule that produced
 * a 104-of-190 memo split while the prose sat there being correct.
 *
 * Every rule asserts twice: that its population is not empty, and that the
 * population holds no violation. Without the first, a meter that reads no files
 * passes every rule it has.
 *
 * A violation prints the file and the symbol, never a line number, because the
 * line moves on the next edit above it and the symbol does not.
 */
import { describe, expect, it } from 'vitest'
import { globSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import ts from 'typescript'

const repoRoot = join(__dirname, '..', '..')
const rendererRoot = join(repoRoot, 'src/renderer/src')

const sourceFiles = (root: string, extensions = /\.tsx?$/): string[] => {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full)
      } else if (extensions.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        found.push(full)
      }
    }
  }
  walk(root)
  return found
}

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

const at = (file: string): string => relative(repoRoot, file)

const eachNode = (source: ts.SourceFile, visit: (node: ts.Node) => void): void => {
  const walk = (node: ts.Node): void => {
    visit(node)
    ts.forEachChild(node, walk)
  }
  walk(source)
}

/** The module specifier of an import, or null for anything that is not one. */
const importedFrom = (node: ts.Node): string | null =>
  ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : null

//
// ─── Every component is wrapped in meme ──────────────────────────────────────
//
// The rule the checkpoint settled: every component, props or not. A declaration
// counts as a component when it is rendered as JSX somewhere in the renderer or
// exported as its file's default, which is what makes the count reproducible.

describe('every component is wrapped in meme', () => {
  const files = sourceFiles(rendererRoot)
  const parsed = files.map((file) => ({ file, source: parse(file) }))

  const renderedAsJsx = new Set<string>()
  const defaultExported = new Set<string>()

  for (const { source } of parsed) {
    eachNode(source, (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        let name: ts.Node = node.tagName
        while (ts.isPropertyAccessExpression(name)) name = name.expression
        if (ts.isIdentifier(name)) renderedAsJsx.add(name.text)
      }
      if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
        defaultExported.add(node.expression.text)
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        defaultExported.add(node.name.text)
      }
    })
  }

  /** Peel the wrappers a component declaration can sit under. */
  const classify = (expression: ts.Expression): { isComponent: boolean; wrapped: boolean } => {
    let node: ts.Node = expression
    let wrapped = false
    for (;;) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const calleeName = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : null
        // Only meme, not React's memo. meme is memo with deepEqual, and a bare
        // memo gets the shallow comparator that a mutated row defeats.
        if (calleeName === 'meme') {
          wrapped = true
          if (!node.arguments[0]) return { isComponent: true, wrapped }
          node = node.arguments[0]
          continue
        }
        if (calleeName === 'memo') {
          if (!node.arguments[0]) return { isComponent: true, wrapped: false }
          node = node.arguments[0]
          continue
        }
        if (calleeName === 'forwardRef') {
          if (!node.arguments[0]) return { isComponent: true, wrapped }
          node = node.arguments[0]
          continue
        }
        // styled('svg')({}) is a component, but not one memo has anything to do
        // with: it renders exactly its props and holds no state.
        if (
          calleeName === 'styled' ||
          (ts.isCallExpression(callee) &&
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === 'styled')
        ) {
          return { isComponent: false, wrapped }
        }
        return { isComponent: wrapped, wrapped }
      }
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return { isComponent: true, wrapped }
      }
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
        node = node.expression
        continue
      }
      return { isComponent: wrapped, wrapped }
    }
  }

  const components: { name: string; file: string; wrapped: boolean }[] = []
  for (const { file, source } of parsed) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const name = declaration.name.text
        if (!/^[A-Z]/.test(name)) continue
        if (!renderedAsJsx.has(name) && !defaultExported.has(name)) continue
        const { isComponent, wrapped } = classify(declaration.initializer)
        if (isComponent) components.push({ name, file: at(file), wrapped })
      }
    }
  }

  it('finds components to check', () => {
    expect(components.length).toBeGreaterThan(150)
  })

  it('leaves none of them bare', () => {
    const bare = components.filter((c) => !c.wrapped).map((c) => `${c.file}\t${c.name}`)
    expect(bare).toEqual([])
  })
})

//
// ─── shared may not reach back into main ─────────────────────────────────────
//
// All three processes import shared. It is the one layer that may not reach
// back, and an import of main from shared pulls Electron into the renderer.

describe('shared does not import from main', () => {
  const files = sourceFiles(join(repoRoot, 'src/shared'))

  it('finds shared files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('has none of them importing main', () => {
    const reaching: string[] = []
    for (const file of files) {
      eachNode(parse(file), (node) => {
        const specifier = importedFrom(node)
        if (specifier === null) return
        if (specifier.startsWith('@main') || /(^|\/)\.\.\/main\//.test(specifier)) {
          reaching.push(`${at(file)}\t${specifier}`)
        }
      })
    }
    expect(reaching).toEqual([])
  })
})

//
// ─── One store selector per field ────────────────────────────────────────────
//
// A selector returning an object literal is a whole-store subscription wearing a
// selector's clothes: a fresh object every render, so every flush re-renders.
// This is why the grid draws two thousand rows without useShallow.

describe('one store selector per field', () => {
  const files = sourceFiles(rendererRoot)
  const selectorCalls: { file: string; text: string }[] = []
  const objectSelectors: string[] = []
  const shallowUses: string[] = []
  const wholeStore: string[] = []

  for (const file of files) {
    const source = parse(file)
    eachNode(source, (node) => {
      if (ts.isIdentifier(node) && node.text === 'useShallow') shallowUses.push(at(file))
      if (!ts.isCallExpression(node)) return
      const callee = node.expression
      if (!ts.isIdentifier(callee) || !/^use[A-Z].*Zustand$/.test(callee.text)) return
      const argument = node.arguments[0]
      // No selector at all subscribes to the whole store, and so does one that
      // hands the state straight back. Neither is an object literal, so the
      // check below would let both through.
      if (!argument) {
        if (!/\.(getState|setState|persist|subscribe)\b/.test(node.parent?.getText(source) ?? '')) {
          wholeStore.push(`${at(file)}\t${callee.text}()`)
        }
        return
      }
      if (!ts.isArrowFunction(argument)) return
      if (ts.isIdentifier(argument.body) && argument.parameters.length === 1) {
        const parameter = argument.parameters[0].name
        if (ts.isIdentifier(parameter) && parameter.text === argument.body.text) {
          wholeStore.push(`${at(file)}\t${callee.text}((z) => z)`)
        }
      }
      selectorCalls.push({ file: at(file), text: callee.text })
      const body = argument.body
      // ({ a, b }) is a parenthesized object literal; { return { a, b } } is a
      // block that ends in one. Both hand back a new reference every render.
      const returnsObject =
        (ts.isParenthesizedExpression(body) && ts.isObjectLiteralExpression(body.expression)) ||
        ts.isObjectLiteralExpression(body) ||
        (ts.isBlock(body) &&
          body.statements.some(
            (statement) =>
              ts.isReturnStatement(statement) &&
              statement.expression !== undefined &&
              ts.isObjectLiteralExpression(statement.expression)
          ))
      if (returnsObject) objectSelectors.push(`${at(file)}\t${callee.text}`)
    })
  }

  it('finds selectors to check', () => {
    expect(selectorCalls.length).toBeGreaterThan(100)
  })

  it('has none of them returning an object', () => {
    expect(objectSelectors).toEqual([])
  })

  it('has no useShallow anywhere', () => {
    expect(shallowUses).toEqual([])
  })

  it('has nothing subscribing to a whole store', () => {
    expect(wholeStore).toEqual([])
  })
})

//
// ─── An action is fetched where it runs ──────────────────────────────────────
//
// In a named `useCallback` whose dependency list holds only what the component
// itself owns: `const clientZustand = useClientZustand.getState()`, then
// `clientZustand.setAddress(value)`. Two ways to break it, and the rule catches
// both. A selector puts the action in the dependency list, and a list naming
// something the component does not own is a list that cannot be read. A
// `getState()` written into the JSX puts the call where the reader is looking
// at layout, and a handler with no name is a handler with nothing to read.

describe('an action is fetched where it runs', () => {
  const files = sourceFiles(rendererRoot)
  const parsed = files.map((file) => ({ file, source: parse(file) }))

  // A member is a function when it says so, or when its type alias does:
  // `setAddress: MaskSetFn` is as much an action as `clear: () => void`.
  const functionAliases = new Set<string>()
  for (const { source } of parsed) {
    eachNode(source, (node) => {
      if (ts.isTypeAliasDeclaration(node) && ts.isFunctionTypeNode(node.type)) {
        functionAliases.add(node.name.text)
      }
    })
  }
  const isFunctionType = (type: ts.TypeNode | undefined): boolean => {
    if (!type) return false
    if (ts.isFunctionTypeNode(type)) return true
    return (
      ts.isTypeReferenceNode(type) &&
      ts.isIdentifier(type.typeName) &&
      functionAliases.has(type.typeName.text)
    )
  }

  // <Name>Zustand, so useClientZustand is matched against ClientZustand and not
  // against every store's members at once.
  const storeFunctions = new Map<string, Set<string>>()
  for (const { source } of parsed) {
    eachNode(source, (node) => {
      if (!ts.isTypeAliasDeclaration(node) && !ts.isInterfaceDeclaration(node)) return
      if (!/Zustand$/.test(node.name.text)) return
      const members: ts.TypeElement[] = []
      const collect = (type: ts.TypeNode | undefined): void => {
        if (!type) return
        if (ts.isTypeLiteralNode(type)) members.push(...type.members)
        else if (ts.isIntersectionTypeNode(type)) type.types.forEach(collect)
      }
      if (ts.isTypeAliasDeclaration(node)) collect(node.type)
      else members.push(...node.members)
      const found = storeFunctions.get(node.name.text) ?? new Set<string>()
      for (const member of members) {
        if (!member.name || !ts.isIdentifier(member.name)) continue
        if (ts.isMethodSignature(member)) found.add(member.name.text)
        if (ts.isPropertySignature(member) && isFunctionType(member.type)) {
          found.add(member.name.text)
        }
      }
      storeFunctions.set(node.name.text, found)
    })
  }

  const functionSelectors: string[] = []
  for (const { file, source } of parsed) {
    eachNode(source, (node) => {
      if (!ts.isCallExpression(node)) return
      const callee = node.expression
      if (!ts.isIdentifier(callee)) return
      const store = /^use([A-Z].*Zustand)$/.exec(callee.text)?.[1]
      if (!store) return
      const argument = node.arguments[0]
      if (!argument || !ts.isArrowFunction(argument) || argument.parameters.length !== 1) return
      if (!ts.isPropertyAccessExpression(argument.body)) return
      const field = argument.body.name.text
      if (!storeFunctions.get(store)?.has(field)) return
      functionSelectors.push(`${at(file)}\t${callee.text}((z) => z.${field})`)
    })
  }

  it('finds stores with functions in them', () => {
    const withFunctions = [...storeFunctions.values()].filter((found) => found.size > 0)
    expect(withFunctions.length).toBeGreaterThan(5)
  })

  it('has no selector returning one of them', () => {
    expect(functionSelectors).toEqual([])
  })

  // The other half. A prop takes the handler's name, never the call.
  const storeReads: string[] = []
  const readsInJsx: string[] = []
  for (const { file, source } of parsed) {
    eachNode(source, (node) => {
      if (!ts.isCallExpression(node)) return
      const callee = node.expression
      if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'getState') return
      if (!ts.isIdentifier(callee.expression)) return
      if (!/^use[A-Z].*Zustand$/.test(callee.expression.text)) return
      storeReads.push(at(file))
      // The attribute is what names the offence, so walk out to it and stop at
      // the element: a getState inside a child element is that child's.
      let ancestor: ts.Node | undefined = node.parent
      while (ancestor) {
        if (ts.isJsxAttribute(ancestor)) {
          const attribute = ts.isIdentifier(ancestor.name)
            ? ancestor.name.text
            : ancestor.name.getText(source)
          readsInJsx.push(`${at(file)}\t${attribute}={${callee.expression.text}.getState()...}`)
          return
        }
        if (
          ts.isJsxElement(ancestor) ||
          ts.isJsxSelfClosingElement(ancestor) ||
          ts.isJsxFragment(ancestor)
        ) {
          return
        }
        ancestor = ancestor.parent
      }
    })
  }

  it('finds stores read through getState', () => {
    expect(storeReads.length).toBeGreaterThan(20)
  })

  it('has none of those reads inside a JSX attribute', () => {
    expect(readsInJsx).toEqual([])
  })
})

//
// ─── Stores are named after their component ──────────────────────────────────

describe('every store file is named <name>.zustand.ts', () => {
  const files = sourceFiles(join(repoRoot, 'src'))
  const storeFiles: string[] = []

  for (const file of files) {
    const source = parse(file)
    let createsStore = false
    let importsZustand = false
    eachNode(source, (node) => {
      if (importedFrom(node) === 'zustand') importsZustand = true
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'create'
      ) {
        createsStore = true
      }
    })
    if (createsStore && importsZustand) storeFiles.push(at(file))
  }

  it('finds stores to check', () => {
    expect(storeFiles.length).toBeGreaterThan(5)
  })

  it('has none of them off the name', () => {
    const misnamed = storeFiles.filter((file) => !file.endsWith('.zustand.ts'))
    expect(misnamed).toEqual([])
  })
})

//
// ─── MUI comes in deep ───────────────────────────────────────────────────────
//
// A barrel import pulls the package's whole index through the dev server on
// every cold start. Two hooks have no deep home: the exports map in
// @mui/x-data-grid/package.json declares thirteen subpaths besides the root and
// neither hook is exported by any of them, so the root is the only way to write
// them.

const rootOnlyGridHooks = ['useGridApiContext', 'useGridApiRef']

describe('MUI is imported deep', () => {
  const files = sourceFiles(join(repoRoot, 'src'))
  const muiImports: string[] = []
  const barrelImports: string[] = []

  for (const file of files) {
    const source = parse(file)
    for (const statement of source.statements) {
      const specifier = importedFrom(statement)
      if (specifier === null || !specifier.startsWith('@mui/')) continue
      muiImports.push(specifier)
      if (specifier.split('/').length !== 2) continue

      const bindings = statement.importClause?.namedBindings
      const names =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => element.name.text)
          : []
      const allowed = names.length > 0 && names.every((name) => rootOnlyGridHooks.includes(name))
      if (!allowed) barrelImports.push(`${at(file)}\t${specifier}\t${names.join(', ')}`)
    }
  }

  it('finds MUI imports to check', () => {
    expect(muiImports.length).toBeGreaterThan(100)
  })

  it('has no barrel import that could have been deep', () => {
    expect(barrelImports).toEqual([])
  })
})

//
// ─── Every interactive element carries a data-testid ─────────────────────────
//
// The e2e suite addresses the UI through them. Containers are excluded on
// purpose: ToggleButtonGroup and ButtonGroup are addressed through the buttons
// inside them, and a Select's options through getByRole('option').
//
// A picker hands attributes to its input through slotProps, so the attribute can
// sit nested rather than on the element. Reading only JSX attributes misses
// those, which is how the DateTimePicker showed up as missing one it had.

const interactiveLeaves = new Set([
  'Button',
  'IconButton',
  'TextField',
  'Slider',
  'Switch',
  'Checkbox',
  'Autocomplete',
  'Link',
  'DateTimePicker',
  'GridActionsCellItem',
  'ToggleButton',
  'Select'
])

describe('every interactive element carries a data-testid', () => {
  const files = sourceFiles(rendererRoot, /\.tsx$/)
  const elements: string[] = []
  const bare: string[] = []

  for (const file of files) {
    const source = parse(file)
    eachNode(source, (node) => {
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return
      const tag = node.tagName.getText(source)
      if (!interactiveLeaves.has(tag)) return
      elements.push(`${at(file)}\t${tag}`)

      const attributes = node.attributes.properties
      // A spread can carry anything, including the attribute, so it counts.
      if (attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute))) return
      // slotProps nests the attribute one or more levels down, so the whole
      // attribute list is searched rather than only its top level.
      const carries = attributes.some((attribute) =>
        attribute.getText(source).includes('data-testid')
      )
      if (!carries) bare.push(`${at(file)}\t${tag}`)
    })
  }

  it('finds interactive elements to check', () => {
    expect(elements.length).toBeGreaterThan(50)
  })

  it('leaves none of them without one', () => {
    expect(bare).toEqual([])
  })
})

//
// ─── Every alias resolves ────────────────────────────────────────────────────
//
// @main, @preload and @backend outlived their use, and @backend outlived its
// directory. An alias nobody imports through is a name a contributor will reach
// for and a reviewer will have to rule on.

describe('every configured path alias is used', () => {
  const configs = ['electron.vite.config.ts', 'vitest.config.mts']
  const declared = new Map<string, string[]>()

  for (const config of configs) {
    const source = parse(join(repoRoot, config))
    const names: string[] = []
    eachNode(source, (node) => {
      if (!ts.isPropertyAssignment(node)) return
      const key = ts.isStringLiteral(node.name)
        ? node.name.text
        : ts.isIdentifier(node.name)
          ? node.name.text
          : null
      if (key !== null && key.startsWith('@')) names.push(key)
    })
    declared.set(config, [...new Set(names)])
  }

  const imported = new Set<string>()
  for (const file of [
    ...sourceFiles(join(repoRoot, 'src')),
    ...sourceFiles(join(repoRoot, 'e2e'))
  ]) {
    eachNode(parse(file), (node) => {
      const specifier = importedFrom(node)
      if (specifier?.startsWith('@') === true) imported.add(specifier.split('/')[0])
    })
  }

  it('finds aliases to check', () => {
    expect([...declared.values()].flat().length).toBeGreaterThan(2)
  })

  it('has none that nothing imports through', () => {
    const unused: string[] = []
    for (const [config, names] of declared) {
      for (const name of names) if (!imported.has(name)) unused.push(`${config}\t${name}`)
    }
    expect(unused).toEqual([])
  })
})

//
// ─── Every channel carrying an object declares a schema ──────────────────────
//
// TypeScript covers the shape of a bare primitive, and sixteen channels take no
// argument at all. What is left is an object or a union, and that is where a
// hand-edited config file or anything reaching the boundary from outside the UI
// arrives. A channel added without a schema is the one that gets missed.

describe('every channel carrying an object declares a schema', () => {
  const spec = parse(join(repoRoot, 'src/shared/types/ipc.ts'))

  /** Channel to the argument it takes, for the ones taking more than a primitive. */
  const carriers = new Map<string, string>()
  eachNode(spec, (node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== 'IpcHandlerSpec') return
    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type))
        continue
      const args = member.type.members.find((m) => m.name?.getText(spec) === 'args')
      const argument = (args?.type?.getText(spec) ?? '[]').slice(1, -1).trim()
      if (argument === '' || ['string', 'number', 'boolean'].includes(argument)) continue
      carriers.set(member.name.getText(spec).replace(/[[\]']/g, ''), argument)
    }
  })

  /** Channel to whether its ipcHandle call was given a third argument. */
  const guarded = new Set<string>()
  eachNode(parse(join(repoRoot, 'src/main/ipc.ts')), (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return
    if (node.expression.text !== 'ipcHandle') return
    const channel = node.arguments[0]
    if (channel && ts.isStringLiteral(channel) && node.arguments.length >= 3)
      guarded.add(channel.text)
  })

  it('finds channels to check', () => {
    expect(carriers.size).toBeGreaterThan(10)
  })

  it('leaves none of them unguarded', () => {
    const unguarded = [...carriers]
      .filter(([channel]) => !guarded.has(channel))
      .map(([channel, argument]) => `${channel}\t${argument}`)
    expect(unguarded).toEqual([])
  })
})

//
// ─── Every channel has a caller ──────────────────────────────────────────────
//
// `window.api` is generated from IPC_CHANNELS, so a channel nobody calls still
// gets a method, a handler and a spec entry, and nothing says so.
// `get_connection_config` and `get_client_state` sat that way, with the app's
// only config repair branch inside one of them. A handler that reads as a guard
// and never runs is worse than no handler.
//
// The caller has to be in the renderer. A channel only the e2e suite drives is
// a channel the app itself does not use, and that is a decision to take rather
// than to let happen.

describe('every channel has a caller', () => {
  const spec = parse(join(repoRoot, 'src/shared/types/ipc.ts'))

  /** Each channel, and the camelCase method it becomes on `window.api`. */
  const methods = new Map<string, string>()
  eachNode(spec, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (node.name.getText(spec) !== 'IPC_CHANNELS') return
    eachNode(node as unknown as ts.SourceFile, (child) => {
      if (!ts.isStringLiteral(child)) return
      methods.set(
        child.text,
        child.text.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      )
    })
  })

  /** Every name called as `<something>.<name>(` in the renderer. */
  const called = new Set<string>()
  for (const file of sourceFiles(rendererRoot)) {
    eachNode(parse(file), (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
      called.add(node.expression.name.text)
    })
  }

  it('finds channels to check', () => {
    expect(methods.size).toBeGreaterThan(30)
  })

  it('finds calls to check', () => {
    expect(called.size).toBeGreaterThan(30)
  })

  it('leaves none of them uncalled', () => {
    const dead = [...methods]
      .filter(([, method]) => !called.has(method))
      .map(([channel, method]) => `${channel}\t${method}`)
    expect(dead).toEqual([])
  })
})

//
// ─── Every configured path is somewhere ──────────────────────────────────────
//
// @backend pointed at a directory that had been deleted, and the alias outlived
// it in three configs. A tsconfig include does the same thing more quietly: it
// names a glob, finds nothing, and says nothing.

describe('every configured include points at something', () => {
  const configs = ['tsconfig.node.json', 'tsconfig.web.json', 'tsconfig.e2e.json']
  const globs: { config: string; glob: string }[] = []

  for (const config of configs) {
    // A tsconfig is jsonc: comments and trailing commas, which JSON.parse
    // refuses and the compiler's own reader does not.
    const { config: parsed } = ts.parseConfigFileTextToJson(
      config,
      readFileSync(join(repoRoot, config), 'utf8')
    )
    for (const glob of (parsed as { include?: string[] })?.include ?? [])
      globs.push({ config, glob })
  }

  it('finds includes to check', () => {
    expect(globs.length).toBeGreaterThan(5)
  })

  it('has none of them pointing at nothing', () => {
    // Expanded rather than approximated. Reading the directory part off the
    // glob was tried first and got electron.vite.config.* wrong twice, once in
    // each direction.
    const empty = globs.filter(({ glob }) => globSync(glob, { cwd: repoRoot }).length === 0)
    expect(empty.map(({ config, glob }) => `${config}\t${glob}`)).toEqual([])
  })
})
