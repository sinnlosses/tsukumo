import { describe, expect, it } from "vitest"

import {
  collectExpressionReferences,
  parseExpression,
  type ExprNode,
} from "../../../src/shared/report/report-expression-parse.ts"

const parsed = (source: string): ExprNode => {
  const result = parseExpression(source)
  if (result.kind === "invalid") throw new Error(`読めるはずの式が読めない: ${source}`)
  return result.node
}

const shape = (node: ExprNode): unknown => {
  switch (node.kind) {
    case "literal":
      return node.value
    case "name":
      return node.name
    case "list":
      return ["list", ...node.items.map(shape)]
    case "unary":
      return [node.op, shape(node.operand)]
    case "binary":
      return [node.op, shape(node.left), shape(node.right)]
    case "conditional":
      return ["?:", shape(node.cond), shape(node.whenTrue), shape(node.whenFalse)]
    case "call":
      return [`${node.name}()`, ...node.args.map(shape)]
  }
}

describe("parseExpression の優先順位", () => {
  it.each([
    ["1 + 2 * 3", ["+", 1, ["*", 2, 3]]],
    ["(1 + 2) * 3", ["*", ["+", 1, 2], 3]],
    ["10 - 3 - 2", ["-", ["-", 10, 3], 2]],
    ["a || b && c", ["||", "a", ["&&", "b", "c"]]],
    ["a == 1 && b < 2", ["&&", ["==", "a", 1], ["<", "b", 2]]],
    ["a < b == c", ["==", ["<", "a", "b"], "c"]],
    ["-a * 2", ["*", ["-", "a"], 2]],
    ["!a && b", ["&&", ["!", "a"], "b"]],
    ["a ? 1 : b ? 2 : 3", ["?:", "a", 1, ["?:", "b", 2, 3]]],
    ["a || b ? 1 : 2", ["?:", ["||", "a", "b"], 1, 2]],
    ["a % 2 != 0", ["!=", ["%", "a", 2], 0]],
  ])("%s", (source, expected) => {
    expect(shape(parsed(source))).toEqual(expected)
  })
})

describe("parseExpression の要素", () => {
  it("数・文字・真偽・並び・呼び出しを読む", () => {
    expect(shape(parsed('[1, 2.5, "a\\"b", true, false]'))).toEqual([
      "list",
      1,
      2.5,
      'a"b',
      true,
      false,
    ])
    expect(shape(parsed("round(x, 1)"))).toEqual(["round()", "x", 1])
    expect(shape(parsed("f()"))).toEqual(["f()"])
    expect(shape(parsed("[]"))).toEqual(["list"])
  })
})

describe("parseExpression の誤り", () => {
  it.each([
    ["1 + #", "unreadable-char", 4],
    ['"a\\x"', "unreadable-char", 0],
    ["(1 + 2", "unexpected-end", 6],
    ["1 +", "unexpected-end", 3],
    ["", "unexpected-end", 0],
    ["f(1, 2", "unexpected-end", 6],
    ["1 2", "trailing", 2],
    ["1 + 2)", "trailing", 5],
    ["a ? 1", "unexpected-end", 5],
    ["* 2", "unexpected-token", 0],
    ["[1 2]", "unexpected-token", 3],
  ])("%s は %s（位置 %i）", (source, kind, at) => {
    const result = parseExpression(source)
    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(result.error.kind).toBe(kind)
      expect(result.error.at).toBe(at)
      expect(result.error.reason).not.toBe("")
    }
  })

  it("200 字を超える式は読まない", () => {
    expect(parseExpression("1".repeat(200)).kind).toBe("ok")
    const result = parseExpression("1".repeat(201))
    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") expect(result.error.kind).toBe("too-long")
  })
})

describe("collectExpressionReferences", () => {
  it("使う名前と関数を重ならず出てきた順に返す", () => {
    const refs = collectExpressionReferences(
      parsed("round(a / b, 1) + max(a, c) + (e ? sum(xs) : 0)"),
    )
    expect(refs.names).toEqual(["a", "b", "c", "e", "xs"])
    expect(refs.functions).toEqual(["round", "max", "sum"])
  })
})
