// 演出の途中の clip-path / opacity を表にする整形が、隠れている・途中・図の opacity を読み分けることを見る。

import { describe, expect, test } from "vitest"

import {
  formatRevealSnapshot,
  type RevealRow,
} from "../../../scripts/capture/lib/reveal-snapshot.ts"

const hidden: RevealRow = {
  index: 0,
  tag: "p",
  name: "paragraph",
  clipPath: "inset(0px 0px 100%)",
  opacity: "",
}
const partial: RevealRow = {
  index: 1,
  tag: "h2",
  name: "heading",
  clipPath: "polygon(0px 0px, 588px 0px, 588px 4px, 91px 4px, 91px 26px, 0px 26px)",
  opacity: "",
}
const figure: RevealRow = { index: 2, tag: "div", name: "chart", clipPath: "", opacity: "0.4" }

describe("formatRevealSnapshot", () => {
  test("先頭の行に指定の時刻と実測の経過、要素の件数を出す", () => {
    const [header] = formatRevealSnapshot(1500, { nowMs: 4300, seenAtMs: 2800, rows: [hidden] })
    expect(header).toBe(
      "reveal-at 1500ms（演出の開始から 1500ms）。書いている要素 1件（書き終えた要素は含まない）",
    )
  })

  test("開始を見つけていなければ経過の代わりにそう書く", () => {
    const [header] = formatRevealSnapshot(500, { nowMs: 100, seenAtMs: undefined, rows: [] })
    expect(header).toContain("開始時刻は控えられていない")
  })

  test("隠れている要素・途中の polygon・図の opacity を1行ずつ出す", () => {
    const lines = formatRevealSnapshot(1000, {
      nowMs: 3000,
      seenAtMs: 2000,
      rows: [hidden, partial, figure],
    })
    expect(lines.slice(1)).toEqual([
      "  0 p paragraph: 隠れている",
      `  1 h2 heading: ${partial.clipPath}`,
      "  2 div chart: clip-path なし / opacity 0.4",
    ])
  })
})
