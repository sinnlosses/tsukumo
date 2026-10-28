import { describe, expect, it } from "vitest"

import {
  summarizeFragments,
  type FragmentRow,
} from "../../../scripts/runtime/a2ui-fragment-summary.ts"

const delta = (atMs: number, chars: number): FragmentRow => ({
  atMs,
  eventType: "content_block_delta",
  deltaType: "input_json_delta",
  blockType: "",
  chars,
})

describe("断片の要約の表", () => {
  it("種類ごとに数・最初と最後の時刻・字数の合計を出す", () => {
    const table = summarizeFragments([
      {
        atMs: 10,
        eventType: "content_block_start",
        deltaType: "",
        blockType: "tool_use",
        chars: 0,
      },
      delta(20, 5),
      delta(35, 7),
    ])
    const line = table
      .split("\n")
      .find((row) => row.startsWith("content_block_delta:input_json_delta"))
    expect(line?.split(/\s+/)).toEqual([
      "content_block_delta:input_json_delta",
      "2",
      "20",
      "35",
      "12",
    ])
    expect(table).toContain("content_block_start:tool_use")
  })

  it("空の列は見出しだけの表になる", () => {
    expect(summarizeFragments([]).split("\n")).toHaveLength(1)
  })

  it("本文を持たない型なので、表に断片の中身は出ない", () => {
    expect(summarizeFragments([delta(1, 3)])).not.toMatch(/partial_json|\{/)
  })
})
