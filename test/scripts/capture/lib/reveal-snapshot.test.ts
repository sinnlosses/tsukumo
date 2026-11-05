// 演出の途中の data-reveal / opacity を表にする整形が、まだ出していない節と印の無い opacity を読み分けることを見る。

import { describe, expect, test } from "vitest"

import {
  formatRevealSnapshot,
  type RevealRow,
} from "../../../../scripts/capture/lib/reveal-snapshot.ts"

const pending: RevealRow = {
  index: 0,
  tag: "p",
  name: "paragraph",
  reveal: "pending",
  opacity: "0",
}
const faded: RevealRow = { index: 1, tag: "div", name: "chart", reveal: "", opacity: "0.4" }

describe("formatRevealSnapshot", () => {
  test("先頭の行に指定の時刻と実測の経過、要素の件数を出す", () => {
    const [header] = formatRevealSnapshot(1500, { nowMs: 4300, seenAtMs: 2800, rows: [pending] })
    expect(header).toBe(
      "reveal-at 1500ms（演出の開始から 1500ms）。印か opacity を持つ要素 1件（出し終えた要素は含まない）",
    )
  })

  test("開始を見つけていなければ経過の代わりにそう書く", () => {
    const [header] = formatRevealSnapshot(500, { nowMs: 100, seenAtMs: undefined, rows: [] })
    expect(header).toContain("開始時刻は控えられていない")
  })

  test("まだ出していない節と、印の無い opacity を1行ずつ出す", () => {
    const lines = formatRevealSnapshot(1000, {
      nowMs: 3000,
      seenAtMs: 2000,
      rows: [pending, faded],
    })
    expect(lines.slice(1)).toEqual([
      "  0 p paragraph: data-reveal pending / opacity 0",
      "  1 div chart: data-reveal なし / opacity 0.4",
    ])
  })
})
