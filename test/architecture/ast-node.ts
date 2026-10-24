// 規約のテストだけが使う構文木の読み取り。欄の読みは `scripts/shared/ast-node.ts` が持つ。

import type { AstNode } from "../../scripts/shared/ast-node.ts"

export function astNumber(node: AstNode, key: string): number | undefined {
  const value: unknown = Reflect.get(node, key)
  return typeof value === "number" ? value : undefined
}

export function astAllChildren(node: AstNode): readonly AstNode[] {
  return Object.values(node).flatMap((value: unknown) => {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is AstNode => typeof item === "object" && item !== null && "type" in item,
      )
    }
    return typeof value === "object" && value !== null && "type" in value ? [value] : []
  })
}
