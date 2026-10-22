import { describe, expect, it } from "vitest"

import { diffWordRanges } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/diff-pair.ts"

describe("diffWordRanges の行の対", () => {
  it.each([
    ["1行ずつ", ["-a", "+b"], [0, 1]],
    ["2行ずつは同じ順", ["-a", "-b", "+c", "+d"], [0, 1, 2, 3]],
    ["数が違う塊は対にしない", ["-a", "-b", "+c"], []],
    ["- だけ", ["-a", " x"], []],
    ["+ だけ", ["+a", " x"], []],
    ["離れた2塊", ["-a", "+b", " x", "-c", "+d"], [0, 1, 3, 4]],
    ["ファイルの頭の行は対にしない", ["--- a/x", "+++ b/x", "-a", "+b"], [2, 3]],
  ] as const)("%s", (_name, lines, expected) => {
    expect([...diffWordRanges(lines.join("\n")).keys()].toSorted((a, b) => a - b)).toEqual(expected)
  })

  it("2行ずつは、前から n 番目の - が前から n 番目の + と対になる", () => {
    const result = diffWordRanges(["-aaa x", "-bbb y", "+aaa z", "+bbb w"].join("\n"))
    expect(result.get(0)).toEqual({ side: "removed", ranges: [{ start: 5, end: 6 }] })
    expect(result.get(1)).toEqual({ side: "removed", ranges: [{ start: 5, end: 6 }] })
    expect(result.get(2)).toEqual({ side: "added", ranges: [{ start: 5, end: 6 }] })
    expect(result.get(3)).toEqual({ side: "added", ranges: [{ start: 5, end: 6 }] })
  })
})
