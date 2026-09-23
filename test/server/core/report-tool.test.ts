import { describe, expect, it } from "bun:test"

import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"
import {
  createReportGate,
  REPORT_GATE_REASON,
  REPORT_TOOL_DESCRIPTION,
  REPORT_TOOL_NOTATION_PROMPT,
  REPORT_TOOL_SPEECH_CADENCE_PROMPT,
  unmatchedReportToolClauses,
} from "../../../src/server/core/report-tool.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../src/server/core/speech-cadence.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

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

// イベントはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const INIT: SessionEvent = {
  kind: "session-info",
  sessionId: "fake-session",
  model: "opus",
  permissionMode: "auto",
  slashCommands: [],
  terminalSlashCommands: [],
}
const REPORT: SessionEvent = {
  kind: "report",
  toolUseId: "toolu_r1",
  conclusion: "架空の結論",
  body: "",
  favor: "",
}
const SPEECH: SessionEvent = { kind: "speech", text: "架空の締め", expression: "default" }
const FINISHED: SessionEvent = { kind: "turn-finished", status: "success" }
const utterance = (text: string): SessionEvent => ({ kind: "utterance", text })
const LONG_BODY = utterance("架空の本文の1行目\n架空の本文の2行目\n架空の本文の3行目")
const ONE_LINE = utterance("完了")

/** 関所に `events` を順に見せて、止まろうとしたときに差し戻すかを返す。 */
function blocks(events: readonly SessionEvent[], stopHookActive = false): boolean {
  const gate = createReportGate()
  for (const event of events) {
    gate.observe(event)
  }
  return gate.shouldBlock(stopHookActive)
}

describe("createReportGate（Stop の関所）", () => {
  it("report の無いターンで1行を超える本文を書いて止まろうとしたら差し戻す", () => {
    expect(blocks([INIT, LONG_BODY])).toBe(true)
  })

  it("report → 締めの speak → 1行は通す", () => {
    expect(blocks([INIT, REPORT, SPEECH, ONE_LINE])).toBe(false)
  })

  it("report の無いターンでも1行以内（背景の委譲を待つ一言）なら通す", () => {
    expect(blocks([INIT, utterance("架空の委譲を待つ一言")])).toBe(false)
    expect(blocks([INIT])).toBe(false)
  })

  it("report のあとに1行を超える本文を書いたら差し戻す（前の report では済まない）", () => {
    expect(blocks([INIT, REPORT, SPEECH, LONG_BODY])).toBe(true)
  })

  it("report の前に書いた本文は数えない", () => {
    expect(blocks([INIT, LONG_BODY, REPORT, SPEECH, ONE_LINE])).toBe(false)
  })

  it("1行ずつでも本文が2つあれば2行と数える", () => {
    expect(blocks([INIT, REPORT, utterance("架空の1行"), SPEECH, ONE_LINE])).toBe(true)
  })

  it("改行が無くても 100 字を超えたら1行と見なさない", () => {
    expect(blocks([INIT, utterance("あ".repeat(100))])).toBe(false)
    expect(blocks([INIT, utterance("あ".repeat(101))])).toBe(true)
  })

  it("本文の前後の改行・空白は行に数えない", () => {
    expect(blocks([INIT, utterance("\n完了\n")])).toBe(false)
  })

  it("stop_hook_active（差し戻したあとの続き）なら、長い本文でも通す", () => {
    expect(blocks([INIT, LONG_BODY], true)).toBe(false)
  })

  it("ターンの頭（init）と終わり（turn-finished）で前のターンの本文を持ち越さない", () => {
    expect(blocks([INIT, LONG_BODY, INIT, ONE_LINE])).toBe(false)
    expect(blocks([INIT, LONG_BODY, FINISHED])).toBe(false)
  })
})

describe("REPORT_GATE_REASON", () => {
  it("report で渡し直すことと、report のあとは締めの speak と1行だけであることを言う", () => {
    expect(REPORT_GATE_REASON).toContain("`report` ツール")
    expect(REPORT_GATE_REASON).toContain("渡し直す")
    expect(REPORT_GATE_REASON).toContain("締めの `speak` と1行")
  })
})
