import { describe, expect, it } from "vitest"

import {
  createExpressionEvaluator,
  staticExpressionError,
  templateExpressions,
  type ExprValue,
} from "../../../src/shared/report/report-expression-evaluate.ts"
import { parseExpression } from "../../../src/shared/report/report-expression-parse.ts"

const evaluator = (
  params: Readonly<Record<string, number | boolean>> = {},
  defs: Readonly<Record<string, string>> = {},
) => createExpressionEvaluator({ params, defs })

const valueOf = (source: string, params = {}, defs = {}): ExprValue => {
  const result = evaluator(params, defs).evaluate(source)
  if (!result.ok) throw new Error(`評価できるはずの式が誤り: ${source}: ${result.error.reason}`)
  return result.value
}

const errorKindOf = (source: string, params = {}, defs = {}): string | undefined => {
  const result = evaluator(params, defs).evaluate(source)
  return result.ok ? undefined : result.error.kind
}

describe("評価器の演算", () => {
  it.each([
    ["1 + 2 * 3", 7],
    ["10 % 4", 2],
    ["-3 + 5", 2],
    ["1 < 2 && 2 <= 2", true],
    ["!(1 == 2)", true],
    ['"a" == "a"', true],
    ['"a" + 1.25', "a1.3"],
    ["true ? 1 : 2", 1],
    ["1 == 1 ? 5 : 6", 5],
  ])("%s", (source, expected) => {
    expect(valueOf(source)).toEqual(expected)
  })

  it("並びには要素ごとに掛かり、数は並びの長さに広げる", () => {
    expect(valueOf("[1, 2, 3] * 2")).toEqual([2, 4, 6])
    expect(valueOf("[1, 2, 3] + [10, 20, 30]")).toEqual([11, 22, 33])
    expect(valueOf("-[1, 2]")).toEqual([-1, -2])
    expect(valueOf("[true, false] ? 1 : [10, 20]")).toEqual([1, 20])
  })

  it.each([
    ["[1, 2] + [1, 2, 3]", "length-mismatch"],
    ["1 / 0", "not-finite"],
    ['1 - "a"', "type"],
    ["1 && true", "type"],
    ["1 < true", "type"],
    ["[[1]]", "type"],
    ["missing + 1", "unknown-name"],
    ["nope(1)", "unknown-function"],
    ["min(1)", "arity"],
    ["1 +", "unexpected-end"],
  ])("%s は %s の誤り", (source, kind) => {
    expect(errorKindOf(source)).toBe(kind)
  })

  it("つまみの値が defs に先立って名前を解決する", () => {
    expect(valueOf("a", { a: 3 }, { a: "99" })).toBe(3)
    expect(valueOf("b + 1", { a: 3 }, { b: "a * 2" })).toBe(7)
  })
})

describe("評価器の関数", () => {
  it.each([
    ["range(2, 5)", [2, 3, 4, 5]],
    ["min(3, [1, 5])", [1, 3]],
    ["max(3, [1, 5])", [3, 5]],
    ["round(2.567, 2)", 2.57],
    ["round(2.5)", 3],
    ["round([1.26, 2.74], 1)", [1.3, 2.7]],
    ["fixed(2, 2)", "2.00"],
    ["fixed(1.005, 1)", "1.0"],
    ["sum([1, 2, 3.5])", 6.5],
    ["len([4, 5])", 2],
    ["minOf([3, 1, 2])", 1],
    ["maxOf([3, 1, 2])", 3],
    ["argmin([3, 1, 1])", 1],
    ["argmax([3, 5, 5])", 1],
    ['at(["a", "b"], 1)', "b"],
    ['text([1, 2.25, 3.04], "本")', ["1本", "2.3本", "3本"]],
    ["text([1, 2])", ["1", "2"]],
  ])("%s", (source, expected) => {
    expect(valueOf(source)).toEqual(expected)
  })

  it.each([
    ["at([1], 1)", "out-of-range"],
    ["at([1], -1)", "out-of-range"],
    ["at([1], 0.5)", "type"],
    ["minOf([])", "out-of-range"],
    ["range(5, 1)", "out-of-range"],
    ["sum(3)", "type"],
    ["fixed(1, 21)", "out-of-range"],
    ["zip([1], [2])", "unknown-function"],
  ])("%s は %s の誤り", (source, kind) => {
    expect(errorKindOf(source)).toBe(kind)
  })

  it("range と並びの長さは 101 個まで", () => {
    expect(valueOf("len(range(1, 101))")).toBe(101)
    expect(errorKindOf("range(1, 102)")).toBe("too-many-items")
    const literal = `[${Array.from({ length: 102 }, () => "1").join(",")}]`
    expect(errorKindOf(literal.length > 200 ? "range(0, 200)" : literal)).toBe("too-many-items")
  })
})

describe("defs の評価", () => {
  it("循環はどの名前の輪かを返す", () => {
    const result = evaluator({}, { a: "b + 1", b: "c", c: "a" }).evaluate("a")
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === "cycle") {
      expect(result.error.names).toEqual(["a", "b", "c", "a"])
    } else {
      throw new Error("循環の誤りが返るはず")
    }
  })

  it("defs の中の誤りは、誤りの出た def を origin に持つ", () => {
    const result = evaluator({}, { a: "1 / 0" }).evaluate("a + 1")
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "not-finite", origin: { where: "def", name: "a" } },
    })
  })

  it("defs の式が読めなければ、その def の構文の誤りになる", () => {
    expect(evaluator({}, { a: "1 +" }).evaluate("a")).toMatchObject({
      ok: false,
      error: { kind: "unexpected-end", origin: { where: "def", name: "a" } },
    })
  })
})

describe("format", () => {
  it("${…} を式の結果で埋め、数は丸めの決まりで文字にする", () => {
    const result = evaluator({ w: 3 }).format("w=${w}、割合 ${w / 7}、列 ${[1, 2.25]}")
    expect(result).toEqual({ ok: true, value: "w=3、割合 0.4、列 1, 2.3" })
  })

  it("式に誤りがあれば誤りを返す", () => {
    expect(evaluator().format("a ${nothing}")).toMatchObject({
      ok: false,
      error: { kind: "unknown-name" },
    })
  })

  it("テンプレートの ${…} の位置を取り出す", () => {
    expect(templateExpressions("ab ${x} cd ${y + 1}")).toEqual([
      { source: "x", at: 5 },
      { source: "y + 1", at: 13 },
    ])
  })
})

describe("試作 report-v2.js の defs", () => {
  const defs = {
    ws: "range(1, 8)",
    base: "240 + (e2e ? 120 : 0)",
    times: "base / ws + 6 * ws",
    cur: "base / w + 6 * w",
    diff: "cur - at(times, 0)",
    best: "argmin(times)",
    bestW: "at(ws, best)",
    bestT: "minOf(times)",
  }
  const initial = evaluator({ w: 4, e2e: false }, defs)
  const shown = (source: string): string => {
    const result = initial.format(`\${${source}}`)
    if (!result.ok) throw new Error(result.error.reason)
    return result.value
  }

  it("初期値（w = 4・e2e = false）の右の欄の値と一致する", () => {
    expect(shown("cur")).toBe("84")
    expect(shown("diff")).toBe("-162")
    expect(shown("base")).toBe("240")
    expect(shown("bestW")).toBe("6")
    expect(shown("bestT")).toBe("76")
    expect(shown("at(times, 0) - bestT")).toBe("170")
    expect(shown("cur - bestT")).toBe("8")
    expect(initial.evaluate("best")).toEqual({ ok: true, value: 5 })
    expect(initial.evaluate('text(ws, "本")')).toEqual({
      ok: true,
      value: ["1本", "2本", "3本", "4本", "5本", "6本", "7本", "8本"],
    })
  })

  it("グラフの値（times）は丸めずに数のまま渡る", () => {
    const result = initial.evaluate("times")
    expect(result.ok && Array.isArray(result.value) && result.value[6]).toBeCloseTo(76.2857, 3)
  })

  it("E2E を含めると直列の秒数が 360 になる", () => {
    const withE2e = evaluator({ w: 4, e2e: true }, defs)
    expect(withE2e.evaluate("base")).toEqual({ ok: true, value: 360 })
  })
})

describe("staticExpressionError", () => {
  const check = (source: string): string | undefined => {
    const parsed = parseExpression(source)
    if (!parsed.ok) throw new Error("読めるはずの式")
    return staticExpressionError(parsed.node, new Set(["a"]))?.kind
  }

  it.each([
    ["a + 1", undefined],
    ["b + 1", "unknown-name"],
    ["foo(a)", "unknown-function"],
    ["at(a)", "arity"],
    ["sum(range(1, 3, 5))", "arity"],
    ["a ? 1 : zz", "unknown-name"],
  ])("%s", (source, kind) => {
    expect(check(source)).toBe(kind)
  })
})
