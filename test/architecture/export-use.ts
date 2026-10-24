// 規約のテストが共有する、`src/`・`scripts/` の export がどの読み手から import されるかの読み取り。

import { readFileSync } from "node:fs"
import { posix } from "node:path"
import { fileURLToPath } from "node:url"

import { astChildren, astDescendants, astObject, astString, type AstNode } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram } from "./source-file.ts"

export const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

export const CONFIG_FILES = ["vite.config.ts", "vitest.config.ts", "vitest.e2e.config.ts"] as const

const EXPORTER_DIRECTORIES = ["src/", "scripts/"] as const

export type ExportUse = {
  /** `isUse` を満たす読み手から import されず、その読まれる export の型注釈からもたどれない export を `<パス>#<名前>` で返す。 */
  readonly unreadBy: (isUse: (reader: string) => boolean) => readonly string[]
  /** どこかの読み手から import される export の `<パス>#<名前>`。 */
  readonly imported: ReadonlySet<string>
}

/** `sources` は読み手のパス（リポジトリの根からの相対）から本文への対応。 */
export function readExportUse(sources: ReadonlyMap<string, string>): ExportUse {
  const programs = new Map([...sources].map(([path, source]) => [path, parseSourceProgram(source)]))
  const exportsOf = new Map(
    [...programs]
      .filter(([path]) => isExporter(path))
      .map(([path, program]) => [path, exportedSymbols(program)]),
  )
  const edges = [...programs].flatMap(([reader, program]) =>
    importUses(reader, program).flatMap((use) => {
      const symbols = exportsOf.get(use.target)
      if (symbols === undefined) {
        return []
      }
      const names = use.names === "all" ? symbols.map(({ name }) => name) : use.names
      return names.map((name) => ({ reader, key: `${use.target}#${name}` }))
    }),
  )
  const unreadBy = (isUse: (reader: string) => boolean): readonly string[] => {
    const read = new Set(edges.filter(({ reader }) => isUse(reader)).map(({ key }) => key))
    return [...exportsOf].flatMap(([path, symbols]) => {
      const signatureTypes = typesNamedFrom(
        programs.get(path) ?? {},
        symbols.filter(({ name }) => read.has(`${path}#${name}`)).map(({ local }) => local),
      )
      return symbols
        .filter(({ name, local }) => !read.has(`${path}#${name}`) && !signatureTypes.has(local))
        .map(({ name }) => `${path}#${name}`)
    })
  }
  return { unreadBy, imported: new Set(edges.map(({ key }) => key)) }
}

export function readRepositorySources(): ReadonlyMap<string, string> {
  const paths = [
    ...listSourceFiles(`${REPOSITORY_ROOT}/scripts`, `${REPOSITORY_ROOT}/scripts`, [".ts"]).map(
      (path) => `scripts/${path}`,
    ),
    ...listSourceFiles(`${REPOSITORY_ROOT}/src`).map((path) => `src/${path}`),
    ...listSourceFiles(`${REPOSITORY_ROOT}/test`).map((path) => `test/${path}`),
    ...CONFIG_FILES,
  ]
  return new Map(paths.map((path) => [path, readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8")]))
}

/**
 * 許可リストに置けない項目を返す。置けるのは、`<部品>Props` の名前の型（`type`・`interface`）の export だけ。
 * `sources` から項目のファイルの宣言を読む。
 */
export function nonPropsTypeExports(
  keys: readonly string[],
  sources: ReadonlyMap<string, string>,
): readonly string[] {
  return keys.filter((key) => !isPropsTypeExport(key, sources))
}

function isPropsTypeExport(key: string, sources: ReadonlyMap<string, string>): boolean {
  const [path = "", name = ""] = key.split("#")
  const source = sources.get(path)
  if (source === undefined || !PROPS_TYPE_NAME.test(name)) {
    return false
  }
  return astChildren(parseSourceProgram(source), "body").some((statement) => {
    const declaration = astObject(statement, "declaration")
    return (
      astString(statement, "type") === "ExportNamedDeclaration" &&
      TYPE_DECLARATIONS.has(astString(declaration, "type") ?? "") &&
      declaredNames(declaration).includes(name)
    )
  })
}

const PROPS_TYPE_NAME = /^[A-Z]\w*Props$/

const TYPE_DECLARATIONS: ReadonlySet<string> = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
])

function isExporter(path: string): boolean {
  return EXPORTER_DIRECTORIES.some((directory) => path.startsWith(directory))
}

type ImportUse = { readonly target: string; readonly names: readonly string[] | "all" }

type ExportedSymbol = { readonly name: string; readonly local: string }

function exportedSymbols(program: AstNode): readonly ExportedSymbol[] {
  return astChildren(program, "body").flatMap((statement): readonly ExportedSymbol[] => {
    switch (astString(statement, "type")) {
      case "ExportDefaultDeclaration":
        return [{ name: "default", local: "default" }]
      case "ExportNamedDeclaration": {
        const declared = declaredNames(astObject(statement, "declaration")).map((name) => ({
          name,
          local: name,
        }))
        const specified = astChildren(statement, "specifiers").map((specifier) => ({
          name: symbolName(astObject(specifier, "exported")),
          local: symbolName(astObject(specifier, "local")),
        }))
        return [...declared, ...specified]
      }
      default:
        return []
    }
  })
}

function declaredNames(declaration: AstNode | undefined): readonly string[] {
  if (astString(declaration, "type") === "VariableDeclaration") {
    return astChildren(declaration, "declarations").flatMap(
      (declarator) => astString(astObject(declarator, "id"), "name") ?? [],
    )
  }
  return [astString(astObject(declaration, "id"), "name") ?? []].flat()
}

function symbolName(node: AstNode | undefined): string {
  return astString(node, "name") ?? astString(node, "value") ?? ""
}

function importUses(reader: string, program: AstNode): readonly ImportUse[] {
  return astDescendants(program).flatMap((node): readonly ImportUse[] => {
    const specifier = astString(astObject(node, "source"), "value")
    if (specifier === undefined || !specifier.startsWith(".")) {
      return []
    }
    const target = posix.normalize(posix.join(posix.dirname(reader), specifier))
    switch (astString(node, "type")) {
      case "ImportDeclaration":
        return [{ target, names: importedNames(node) }]
      case "ExportNamedDeclaration":
        return [
          {
            target,
            names: astChildren(node, "specifiers").map((s) => symbolName(astObject(s, "local"))),
          },
        ]
      case "ExportAllDeclaration":
      case "ImportExpression":
        return [{ target, names: "all" }]
      default:
        return []
    }
  })
}

function importedNames(declaration: AstNode): readonly string[] | "all" {
  const specifiers = astChildren(declaration, "specifiers")
  if (specifiers.some((s) => astString(s, "type") === "ImportNamespaceSpecifier")) {
    return "all"
  }
  return specifiers.map((specifier) =>
    astString(specifier, "type") === "ImportDefaultSpecifier"
      ? "default"
      : symbolName(astObject(specifier, "imported")),
  )
}

// 読まれる宣言の型注釈から、同じファイルの宣言をたどって名指される型の名前。
function typesNamedFrom(program: AstNode, roots: readonly string[]): ReadonlySet<string> {
  const declarations = topLevelDeclarations(program)
  const reached = new Set<string>()
  const pending = [...roots]
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const referenced = (declarations.get(name) ?? [])
      .flatMap(astDescendants)
      .filter((node) => astString(node, "type") === "TSTypeReference")
      .flatMap((node) => astString(astObject(node, "typeName"), "name") ?? [])
    for (const typeName of referenced) {
      if (!reached.has(typeName)) {
        reached.add(typeName)
        pending.push(typeName)
      }
    }
  }
  return reached
}

function topLevelDeclarations(program: AstNode): ReadonlyMap<string, readonly AstNode[]> {
  const declarations = new Map<string, AstNode[]>()
  for (const statement of astChildren(program, "body")) {
    const type = astString(statement, "type")
    const declaration =
      type === "ExportNamedDeclaration" || type === "ExportDefaultDeclaration"
        ? astObject(statement, "declaration")
        : statement
    const names = type === "ExportDefaultDeclaration" ? ["default"] : declaredNames(declaration)
    for (const name of names) {
      declarations.set(name, [...(declarations.get(name) ?? []), declaration ?? statement])
    }
  }
  return declarations
}
