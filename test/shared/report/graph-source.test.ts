import { describe, expect, it } from "vitest"

import { readGraphSource } from "../../../src/shared/report/graph-source.ts"

describe("readGraphSource", () => {
  it("包みで節点の形を決め、辺とラベルを読む", () => {
    expect(
      readGraphSource(
        "(架空の始点) -> 架空の処理: 渡す\n架空の処理 -> {架空の分岐?}\n{架空の分岐?} -> (架空の終点): yes",
      ),
    ).toEqual({
      nodes: [
        { name: "架空の始点", shape: "round" },
        { name: "架空の処理", shape: "box" },
        { name: "架空の分岐?", shape: "decision" },
        { name: "架空の終点", shape: "round" },
      ],
      edges: [
        { from: 0, to: 1, label: "渡す" },
        { from: 1, to: 2, label: "" },
        { from: 2, to: 3, label: "yes" },
      ],
      brokenLines: [],
    })
  })

  it("同じ名前は同じ節点で、形は最初に包みで出た行のものを採る", () => {
    const { nodes, edges } = readGraphSource("A -> {B}\nB -> C\n(C) -> A\nC -> {A}")

    expect(nodes).toEqual([
      { name: "A", shape: "decision" },
      { name: "B", shape: "decision" },
      { name: "C", shape: "round" },
    ])
    expect(edges.map(({ from, to }) => [from, to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 0],
    ])
  })

  it("矢印の無い行は節点だけの宣言で、空行と前後の空白は無視する", () => {
    const { nodes, edges, brokenLines } = readGraphSource("\n  (孤立)  \n\n   \n  A  ->  B  ")

    expect(nodes.map(({ name }) => name)).toEqual(["孤立", "A", "B"])
    expect(edges).toEqual([{ from: 1, to: 2, label: "" }])
    expect(brokenLines).toEqual([])
  })

  it("読めない行は行番号（空行も数える）を返し、その行の節点は足さない", () => {
    const reading = readGraphSource(
      "A -> B\n\nA - B\nX -> Y -> Z\n -> C\nD -> E: 語: 語\nF: 語\n()",
    )

    expect(reading.brokenLines).toEqual([3, 4, 5, 6, 7, 8])
    expect(reading.nodes.map(({ name }) => name)).toEqual(["A", "B"])
    expect(reading.edges).toEqual([{ from: 0, to: 1, label: "" }])
  })

  it("節点が1つも無い source は節点を持たない", () => {
    expect(readGraphSource("").nodes).toEqual([])
    expect(readGraphSource("\n \n").nodes).toEqual([])
  })
})
