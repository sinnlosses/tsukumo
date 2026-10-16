// ファイルどうしの import のつながり（どのファイルがどのファイルを読むか）と、根から届くファイルの集合。
// パスはどれもリポジトリ直下からの相対パス（区切りは `/`）。
// 本文は構文木で読む。辿れない読み方をするファイルは「開いたファイル」とし、届いた先を全件に倒す。

import path from "node:path"

import {
  arrayField,
  type AstNode,
  descendants,
  literalString,
  objectField,
  parseProgram,
  stringField,
} from "./ast-node.ts"

/** ファイル → そのファイルが相対指定で読む、実在するファイルの列。 */
export type ModuleGraph = ReadonlyMap<string, readonly string[]>

/** 1ファイルの読み方。`open` は、指定を静的に決められない・解決できない読み方がある印。 */
export type ModuleImports = {
  readonly paths: readonly string[]
  readonly open: boolean
}

/** 指定が静的に決まらない読み方を、指定の列の中で表す印（実在しうる指定と衝突しない文字列）。 */
const DYNAMIC = "\0dynamic"

/**
 * `fromPath` の本文 `source` が相対指定で読むファイルのうち、`knownPaths` に在るものと、辿れない読み方の有無。
 * 静的 import・`export … from`・動的 `import("…")`・`require("…")`・`new URL("…", import.meta.url)` の
 * 相対指定を、実在するパスへ解決する。`?raw` などのクエリは落として解決し、解決できなければ `open`。
 * 式を含む `import()`・`require()`・`new URL()`、`import.meta.glob`、構文エラーも `open`。
 */
export function analyzeImports(
  fromPath: string,
  source: string,
  knownPaths: ReadonlySet<string>,
): ModuleImports {
  const program = parseProgram(fromPath, source)
  if (program === undefined) {
    return { paths: [], open: true }
  }
  const directory = path.posix.dirname(fromPath)
  const paths = new Set<string>()
  let open = false
  for (const reference of readReferences(program)) {
    if (reference === DYNAMIC) {
      open = true
      continue
    }
    if (!reference.startsWith("./") && !reference.startsWith("../")) {
      continue
    }
    const queryAt = reference.search(/[?#]/)
    const bare = queryAt === -1 ? reference : reference.slice(0, queryAt)
    const resolved = path.posix.normalize(path.posix.join(directory, bare))
    if (knownPaths.has(resolved)) {
      paths.add(resolved)
    } else if (queryAt !== -1) {
      open = true
    }
  }
  return { paths: [...paths], open }
}

/** `roots` 自身と、そこから import を辿って届くファイルの集合。`open` のファイルに届いたら `allPaths` 全部に届くとみなす。 */
export function reachableFrom(
  graph: ModuleGraph,
  roots: readonly string[],
  openFiles: ReadonlySet<string> = new Set(),
  allPaths: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  const reached = new Set<string>()
  const pending = [...roots]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (reached.has(next)) {
      continue
    }
    reached.add(next)
    if (openFiles.has(next)) {
      pending.push(...allPaths)
    }
    pending.push(...(graph.get(next) ?? []))
  }
  return reached
}

/** 文字列の指定、または決められない読み方を表す `DYNAMIC`。 */
function readReferences(program: AstNode): readonly string[] {
  return descendants(program).flatMap((node): readonly string[] => {
    switch (stringField(node, "type")) {
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration":
        return [stringField(objectField(node, "source"), "value")].filter(isString)
      case "ImportExpression":
        return [literalString(objectField(node, "source")) ?? DYNAMIC]
      case "CallExpression":
        return readCall(node)
      case "NewExpression":
        return readNewUrl(node)
      default:
        return []
    }
  })
}

function readCall(node: AstNode): readonly string[] {
  const callee = objectField(node, "callee")
  if (stringField(callee, "type") === "Identifier" && stringField(callee, "name") === "require") {
    const [argument] = arrayField(node, "arguments")
    return [literalString(argument) ?? DYNAMIC]
  }
  return isImportMetaGlob(callee) ? [DYNAMIC] : []
}

function readNewUrl(node: AstNode): readonly string[] {
  const callee = objectField(node, "callee")
  const [target, base] = arrayField(node, "arguments")
  if (stringField(callee, "type") !== "Identifier" || stringField(callee, "name") !== "URL") {
    return []
  }
  if (base === undefined || !isImportMetaUrl(base)) {
    return []
  }
  return [literalString(target) ?? DYNAMIC]
}

function isImportMeta(node: AstNode | undefined): boolean {
  return (
    stringField(node, "type") === "MetaProperty" &&
    stringField(objectField(node, "meta"), "name") === "import"
  )
}

function isImportMetaUrl(node: AstNode): boolean {
  return (
    stringField(node, "type") === "MemberExpression" &&
    isImportMeta(objectField(node, "object")) &&
    stringField(objectField(node, "property"), "name") === "url"
  )
}

function isImportMetaGlob(callee: AstNode | undefined): boolean {
  if (
    stringField(callee, "type") !== "MemberExpression" ||
    !isImportMeta(objectField(callee, "object"))
  ) {
    return false
  }
  const name = stringField(objectField(callee, "property"), "name")
  return name === "glob" || name === "globEager"
}

function isString(value: string | undefined): value is string {
  return value !== undefined
}
