import { describe, expect, it } from "vitest"

import { pairDiffLines } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/diff-pair.ts"

describe("pairDiffLines", () => {
  it.each([
    ["1行ずつ", ["-a", "+b"], [[0, 1]]],
    [
      "2行ずつは同じ順",
      ["-a", "-b", "+c", "+d"],
      [
        [0, 2],
        [1, 3],
      ],
    ],
    ["数が違う塊は対にしない", ["-a", "-b", "+c"], []],
    ["- だけ", ["-a", " x"], []],
    ["+ だけ", ["+a", " x"], []],
    [
      "離れた2塊",
      ["-a", "+b", " x", "-c", "+d"],
      [
        [0, 1],
        [3, 4],
      ],
    ],
    ["ファイルの頭の行は対にしない", ["--- a/x", "+++ b/x", "-a", "+b"], [[2, 3]]],
  ] as const)("%s", (_name, lines, expected) => {
    expect([...pairDiffLines(lines)]).toEqual(expected)
  })
})
