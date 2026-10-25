// 構文木から、ファイルが export する名前（公開名と、ファイル内での宣言の名前）を読む。

import { arrayField, type AstNode, objectField, stringField } from "./ast-node.ts"

type ExportedSymbol = { readonly name: string; readonly local: string }

export function exportedSymbols(program: AstNode): readonly ExportedSymbol[] {
  return arrayField(program, "body").flatMap((statement): readonly ExportedSymbol[] => {
    switch (stringField(statement, "type")) {
      case "ExportDefaultDeclaration":
        return [{ name: "default", local: "default" }]
      case "ExportNamedDeclaration": {
        const declared = declaredNames(objectField(statement, "declaration")).map((name) => ({
          name,
          local: name,
        }))
        const specified = arrayField(statement, "specifiers").map((specifier) => ({
          name: symbolName(objectField(specifier, "exported")),
          local: symbolName(objectField(specifier, "local")),
        }))
        return [...declared, ...specified]
      }
      default:
        return []
    }
  })
}

function declaredNames(declaration: AstNode | undefined): readonly string[] {
  if (stringField(declaration, "type") === "VariableDeclaration") {
    return arrayField(declaration, "declarations").flatMap(
      (declarator) => stringField(objectField(declarator, "id"), "name") ?? [],
    )
  }
  return [stringField(objectField(declaration, "id"), "name") ?? []].flat()
}

function symbolName(node: AstNode | undefined): string {
  return stringField(node, "name") ?? stringField(node, "value") ?? ""
}
