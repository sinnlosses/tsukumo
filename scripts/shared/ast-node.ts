// `vite` の `parseSync`（oxc）が返す構文木の読み取り。

import { parseSync } from "vite"

export type AstNode = object

/** 読めなければ `undefined`。JSX を含む読み方で読めなければ、型アサーション `<T>x` を含む読み方で読み直す。 */
export function parseProgram(fromPath: string, source: string): AstNode | undefined {
  for (const name of [fromPath, "source.tsx", "source.ts"]) {
    const parsed = parseSync(name, source)
    if (parsed.errors.length === 0) {
      return parsed.program
    }
  }
  return undefined
}

/** 文字列リテラル、または式を含まないテンプレートリテラルの値。それ以外は `undefined`。 */
export function literalString(node: AstNode | undefined): string | undefined {
  if (stringField(node, "type") === "Literal") {
    return stringField(node, "value")
  }
  if (
    stringField(node, "type") === "TemplateLiteral" &&
    arrayField(node, "expressions").length === 0
  ) {
    const [quasi] = arrayField(node, "quasis")
    return stringField(objectField(quasi, "value"), "cooked")
  }
  return undefined
}

export function objectField(node: AstNode | undefined, key: string): AstNode | undefined {
  const value: unknown = node === undefined ? undefined : Reflect.get(node, key)
  return typeof value === "object" && value !== null ? value : undefined
}

export function stringField(node: AstNode | undefined, key: string): string | undefined {
  const value: unknown = node === undefined ? undefined : Reflect.get(node, key)
  return typeof value === "string" ? value : undefined
}

export function arrayField(node: AstNode | undefined, key: string): readonly AstNode[] {
  const value: unknown = node === undefined ? undefined : Reflect.get(node, key)
  return Array.isArray(value)
    ? value.filter((item): item is AstNode => typeof item === "object" && item !== null)
    : []
}

/** `root` とその子孫のノードを、順不同ですべて返す。 */
export function descendants(root: AstNode): readonly AstNode[] {
  const nodes: AstNode[] = []
  const pending: AstNode[] = [root]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    nodes.push(next)
    for (const value of Object.values(next) as unknown[]) {
      const items: unknown[] = Array.isArray(value) ? value : [value]
      for (const item of items) {
        if (typeof item === "object" && item !== null && "type" in item) {
          pending.push(item)
        }
      }
    }
  }
  return nodes
}
