// 構文木から、ファイルが読む先の指定（import・`export … from`・動的 `import()`・`require()`・`new URL(…, import.meta.url)`）を拾う。

import {
  arrayField,
  type AstNode,
  descendants,
  literalString,
  objectField,
  stringField,
} from "./ast-node.ts"

/** 指定が静的に決まらない読み方を、指定の列の中で表す印（実在しうる指定と衝突しない文字列）。 */
export const DYNAMIC = "\0dynamic"

/**
 * 文字列の指定（相対かどうかを問わない）、または決められない読み方を表す `DYNAMIC`。
 * `"imports"` は `new URL(…, import.meta.url)` を除き、モジュールとして読むものだけを返す。
 */
export function readReferences(
  program: AstNode,
  scope: "all" | "imports" = "all",
): readonly string[] {
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
        return scope === "all" ? readNewUrl(node) : []
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
