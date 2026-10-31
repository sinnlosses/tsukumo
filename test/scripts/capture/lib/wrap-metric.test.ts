// 前後の測りの差から、折れた要素と省略された要素だけを出すことを見る。

import { describe, expect, test } from "vitest"

import {
  diffWrapRows,
  formatWrapDiff,
  type WrapRow,
} from "../../../../scripts/capture/lib/wrap-metric.ts"

const row = (key: string, lines: number, ellipsed = false): WrapRow => ({ key, lines, ellipsed })

describe("diffWrapRows", () => {
  test("行数が増えた要素だけを返し、減った要素は返さない", () => {
    const diff = diffWrapRows([row("a", 1), row("b", 3)], [row("a", 2), row("b", 2)])
    expect(diff.grown).toEqual([{ key: "a", before: 1, after: 2 }])
    expect(diff.newlyEllipsed).toEqual([])
  })

  test("新しく省略された要素を返し、前から省略されていた要素は返さない", () => {
    const diff = diffWrapRows(
      [row("a", 1), row("b", 1, true)],
      [row("a", 1, true), row("b", 1, true)],
    )
    expect(diff.newlyEllipsed).toEqual(["a"])
    expect(diff.grown).toEqual([])
  })

  test("変わらなければ何も返さない", () => {
    const rows = [row("a", 2), row("b", 1, true)]
    expect(diffWrapRows(rows, rows)).toEqual({
      grown: [],
      newlyEllipsed: [],
      onlyBefore: 0,
      onlyAfter: 0,
    })
  })

  test("片側にしか無い要素は件数だけ数える", () => {
    const diff = diffWrapRows([row("a", 1), row("b", 1)], [row("a", 1), row("c", 5, true)])
    expect(diff).toEqual({ grown: [], newlyEllipsed: [], onlyBefore: 1, onlyAfter: 1 })
  })
})

describe("formatWrapDiff", () => {
  test("増えた要素と省略を1行ずつ出す", () => {
    const text = formatWrapDiff("360x900", {
      grown: [{ key: "p:nth-of-type(1)", before: 1, after: 2 }],
      newlyEllipsed: ["span:nth-of-type(1)"],
      onlyBefore: 0,
      onlyAfter: 0,
    })
    expect(text).toBe("窓 360x900\np:nth-of-type(1): 行数 1→2\n省略が出た: span:nth-of-type(1)\n")
  })

  test("増えたものが無ければその旨を1行出す", () => {
    expect(
      formatWrapDiff("360x900", { grown: [], newlyEllipsed: [], onlyBefore: 0, onlyAfter: 0 }),
    ).toBe("窓 360x900\n折れの増加なし\n")
  })
})
