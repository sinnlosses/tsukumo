import { describe, expect, it } from "bun:test"

import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"
import {
  REPORT_TOOL_DESCRIPTION,
  REPORT_TOOL_NOTATION_PROMPT,
  REPORT_TOOL_SPEECH_CADENCE_PROMPT,
  unmatchedReportToolClauses,
} from "../../../src/server/core/report-tool.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../src/server/core/speech-cadence.ts"

// 差し替える条が元の文面に実在すること（{@link unmatchedReportToolClauses}）と、差し替えた条が
// **実際に入っていること**を見る。元の文面の側で文言が変わると差分が当たらなくなるので、
// ここが落ちて知らせる（`report-tool.ts` 冒頭）。

/** `## ` / `### ` の見出しの並び。差し替えで節の組み立てが崩れていないかを見る。 */
const headings = (prompt: string) => prompt.split("\n").filter((line) => /^#{2,3} /.test(line))

describe("unmatchedReportToolClauses", () => {
  it("差し替える条の文言は、どれも元の文面にちょうど1回ずつ実在する", () => {
    expect(unmatchedReportToolClauses()).toEqual([])
  })
})

describe("REPORT_TOOL_NOTATION_PROMPT", () => {
  it("終わり方の条が report → 締めの speak → 1行のテキストに差し替わる", () => {
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("`report` ツールで渡す本文")
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain(
      "レポートは `report` ツール（`mcp__tsukumo__report`）で渡す",
    )
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain(
      "ターンは `report` → 締めの `speak` → 1行のテキストの順で終える",
    )
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("（締めの一言は `report` のあとに言う）")
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("- `report` のあとに続けようとしているもの")
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain(
      "（言いたいなら `report` のあとの締めの `speak` で言う）",
    )
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("`conclusion` の冒頭の1文だけで")
    expect(REPORT_TOOL_NOTATION_PROMPT).not.toContain(
      "ターンは締めの `speak` → レポートの順で終える",
    )
    expect(REPORT_TOOL_NOTATION_PROMPT).not.toContain("レポートの前に言う")
  })

  it("人格の締めの例（予告の形）を、書き終えたことの一言に言い換えさせる", () => {
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("締めの `speak` は書き終えたことを")
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("キャラクターの人格に締めの例があれば")
  })

  it("お願いの条が favor 引数に差し替わる（本文の最後に書かせない）", () => {
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("（お願いは本文に書かず `favor` に入れる）")
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("`report` の `favor`（1つだけ")
    expect(REPORT_TOOL_NOTATION_PROMPT).not.toContain("（**いちばん最後**に1つ）")
    expect(REPORT_TOOL_NOTATION_PROMPT).not.toContain("末尾の「お願い」1つだけ")
  })

  it("差し替えるのは条の文言だけで、節の並びも記法の表も元のまま", () => {
    expect(headings(REPORT_TOOL_NOTATION_PROMPT)).toEqual(headings(REPORT_NOTATION_PROMPT))
    expect(REPORT_TOOL_NOTATION_PROMPT).toContain("| 内容 | 使う印 | 使う目安 |")
  })
})

describe("REPORT_TOOL_SPEECH_CADENCE_PROMPT", () => {
  it("締めの speak の位置が report の直後に差し替わる", () => {
    expect(REPORT_TOOL_SPEECH_CADENCE_PROMPT).toContain("締め（`report` を呼んだ\n直後）の2回")
    expect(REPORT_TOOL_SPEECH_CADENCE_PROMPT).toContain("`report` を呼んだ直後に締めの1回")
    expect(REPORT_TOOL_SPEECH_CADENCE_PROMPT).not.toContain("書く直前")
  })

  it("委譲中の合図を speak で言い直す流れは変えない", () => {
    const delegation = (prompt: string) =>
      prompt.split("**サブエージェントへ委譲している間も").at(1)
    expect(delegation(REPORT_TOOL_SPEECH_CADENCE_PROMPT)).toBe(delegation(SPEECH_CADENCE_PROMPT))
  })
})

describe("REPORT_TOOL_DESCRIPTION", () => {
  it("MCP ツールの説明文の既定の上限（2048字）に収まり、記法は規約の節を指すだけ", () => {
    expect(REPORT_TOOL_DESCRIPTION.length).toBeLessThan(2048)
    expect(REPORT_TOOL_DESCRIPTION).toContain("「レポートの記法（tsukumo）」の節")
  })
})
