import { arrayField, type AstNode, objectField, stringField } from "../scripts/shared/ast-node.ts"
import { astNumber } from "./architecture/ast-node.ts"
import { parseSourceProgram } from "./architecture/source-file.ts"

type TopLevelFunction = {
  readonly name: string
  readonly exported: boolean
  readonly line: number
}

const FUNCTION_EXPRESSIONS = new Set(["FunctionExpression", "ArrowFunctionExpression"])

/**
 * export する関数が、export しない関数より後ろにあるものを、メッセージにして返す。
 * 数えるのはトップレベルの関数宣言と、`const` に入れた関数式・アロー関数。
 * `export { a }`（`from` なし）は指す宣言を export 扱いにする。
 */
export function functionOrderViolations(file: string, source: string): ReadonlyArray<string> {
  const functions = topLevelFunctions(file, source)
  return functions.flatMap((fn, index) => {
    const earlierInternal = functions.slice(0, index).find((other) => !other.exported)
    return fn.exported && earlierInternal !== undefined
      ? [
          `${file}: export の ${fn.name}（${fn.line} 行目）が export しない ${earlierInternal.name}（${earlierInternal.line} 行目）より後ろ`,
        ]
      : []
  })
}

function topLevelFunctions(file: string, source: string): ReadonlyArray<TopLevelFunction> {
  const body = arrayField(parseSourceProgram(source, file), "body")
  const listed = new Set(body.flatMap(listedNames))
  const lineOf = (node: AstNode): number =>
    source.slice(0, astNumber(node, "start") ?? 0).split("\n").length
  return body.flatMap((statement) => {
    const exported = isExport(statement)
    const declaration = exported ? objectField(statement, "declaration") : statement
    return functionsIn(declaration).map((name) => ({
      name,
      exported: exported || listed.has(name),
      line: lineOf(statement),
    }))
  })
}

function isExport(statement: AstNode): boolean {
  const type = stringField(statement, "type")
  return type === "ExportNamedDeclaration" || type === "ExportDefaultDeclaration"
}

function functionsIn(declaration: AstNode | undefined): readonly string[] {
  switch (stringField(declaration, "type")) {
    case "FunctionDeclaration":
      return [stringField(objectField(declaration, "id"), "name") ?? "default"]
    case "VariableDeclaration":
      return stringField(declaration, "kind") === "const"
        ? arrayField(declaration, "declarations").flatMap((declarator) =>
            FUNCTION_EXPRESSIONS.has(stringField(objectField(declarator, "init"), "type") ?? "")
              ? (stringField(objectField(declarator, "id"), "name") ?? [])
              : [],
          )
        : []
    default:
      return []
  }
}

function listedNames(statement: AstNode): readonly string[] {
  if (
    stringField(statement, "type") !== "ExportNamedDeclaration" ||
    objectField(statement, "source") !== undefined
  ) {
    return []
  }
  return arrayField(statement, "specifiers").flatMap(
    (specifier) => stringField(objectField(specifier, "local"), "name") ?? [],
  )
}
