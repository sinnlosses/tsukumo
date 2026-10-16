// 規約のテストが共有する、`vite` の `parseSync` が返す構文木の読み取り。

import { parseSync } from "vite"

export type AstNode = object

/** 構文エラーがあれば throw する。 */
export function parseProgram(fileName: string, source: string): AstNode {
  const parsed = parseSync(fileName, source)
  if (parsed.errors.length > 0) {
    throw new Error(`${fileName} を読めない: ${parsed.errors.map((e) => e.message).join(", ")}`)
  }
  return parsed.program
}

export function astObject(node: AstNode | undefined, key: string): AstNode | undefined {
  if (node === undefined) {
    return undefined
  }
  const value: unknown = Reflect.get(node, key)
  return typeof value === "object" && value !== null ? value : undefined
}

export function astString(node: AstNode | undefined, key: string): string | undefined {
  const value: unknown = node === undefined ? undefined : Reflect.get(node, key)
  return typeof value === "string" ? value : undefined
}

export function astNumber(node: AstNode, key: string): number | undefined {
  const value: unknown = Reflect.get(node, key)
  return typeof value === "number" ? value : undefined
}

export function astChildren(node: AstNode | undefined, key: string): readonly AstNode[] {
  if (node === undefined) {
    return []
  }
  const value: unknown = Reflect.get(node, key)
  return Array.isArray(value)
    ? value.filter((item): item is AstNode => typeof item === "object" && item !== null)
    : []
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

/** `root` とその子孫のノードを、順不同ですべて返す。 */
export function astDescendants(root: AstNode): readonly AstNode[] {
  const nodes: AstNode[] = []
  const pending: AstNode[] = [root]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    nodes.push(next)
    pending.push(...astAllChildren(next))
  }
  return nodes
}
