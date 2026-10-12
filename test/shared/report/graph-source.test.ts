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
        { name: "架空の始点", shape: "round", change: "unchanged" },
        { name: "架空の処理", shape: "box", change: "unchanged" },
        { name: "架空の分岐?", shape: "decision", change: "unchanged" },
        { name: "架空の終点", shape: "round", change: "unchanged" },
      ],
      edges: [
        { from: 0, to: 1, label: "渡す", change: "unchanged" },
        { from: 1, to: 2, label: "", change: "unchanged" },
        { from: 2, to: 3, label: "yes", change: "unchanged" },
      ],
      brokenLines: [],
    })
  })

  it("同じ名前は同じ節点で、形は最初に包みで出た行のものを採る", () => {
    const { nodes, edges } = readGraphSource("A -> {B}\nB -> C\n(C) -> A\nC -> {A}")

    expect(nodes).toEqual([
      { name: "A", shape: "decision", change: "unchanged" },
      { name: "B", shape: "decision", change: "unchanged" },
      { name: "C", shape: "round", change: "unchanged" },
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
    expect(edges).toEqual([{ from: 1, to: 2, label: "", change: "unchanged" }])
    expect(brokenLines).toEqual([])
  })

  it("読めない行は行番号（空行も数える）を返し、その行の節点は足さない", () => {
    const reading = readGraphSource(
      "A -> B\n\nA - B\nX -> Y -> Z\n -> C\nD -> E: 語: 語\nF: 語\n()",
    )

    expect(reading.brokenLines).toEqual([3, 4, 5, 6, 7, 8])
    expect(reading.nodes.map(({ name }) => name)).toEqual(["A", "B"])
    expect(reading.edges).toEqual([{ from: 0, to: 1, label: "", change: "unchanged" }])
  })

  it("行頭の + / - / ~ を辺と節点だけの行の印として読み、辺の印は端の節点に掛けない", () => {
    const { nodes, edges, brokenLines } = readGraphSource(
      "+ A -> B\n- B -> C: 語\n~ D\n+ D\n+ E\nF -> G",
    )

    expect(edges.map(({ change }) => change)).toEqual(["added", "removed", "unchanged"])
    expect(nodes.map(({ name, change }) => [name, change])).toEqual([
      ["A", "unchanged"],
      ["B", "unchanged"],
      ["C", "unchanged"],
      ["D", "changed"],
      ["E", "added"],
      ["F", "unchanged"],
      ["G", "unchanged"],
    ])
    expect(brokenLines).toEqual([4])
  })

  it("同じ節点に違う印を付けた行と、印だけの行は読めない行にする", () => {
    expect(readGraphSource("+ A\nB\n- A\n- \n+ B").brokenLines).toEqual([3, 4])
  })

  it("節点が1つも無い source は節点を持たない", () => {
    expect(readGraphSource("").nodes).toEqual([])
    expect(readGraphSource("\n \n").nodes).toEqual([])
  })
})
