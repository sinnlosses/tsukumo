import { describe, expect, it } from "vitest"

import {
  createReportGate,
  REPORT_FIGURE_DESCRIPTION,
  REPORT_GATE_REASON,
  REPORT_TOOL_DESCRIPTION,
} from "../../../../src/server/report/core/report-tool.ts"
import {
  REPORT_FIGURE_NONE_REASONS,
  reportFigureSchema,
} from "../../../../src/shared/report/report-block.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

describe("REPORT_TOOL_DESCRIPTION", () => {
  it("MCP ツールの説明文の既定の上限（2048字）に収まり、記法は規約の節を指すだけ", () => {
    expect(REPORT_TOOL_DESCRIPTION.length).toBeLessThan(2048)
    expect(REPORT_TOOL_DESCRIPTION).toContain("「レポートの記法（tsukumo）」の節")
  })
})

describe("REPORT_FIGURE_DESCRIPTION", () => {
  it("figure に置ける図の塊の種類と、none の理由をすべて名指す", () => {
    const blockKinds = reportFigureSchema.options
      .map((option) => option.shape.kind.value)
      .filter((kind) => kind !== "none")

    for (const name of [...blockKinds, ...REPORT_FIGURE_NONE_REASONS]) {
      expect(REPORT_FIGURE_DESCRIPTION).toContain(name)
    }
  })
})

const INIT: SessionEvent = {
  kind: "session-info",
  sessionId: "fake-session",
  model: "opus",
  permissionMode: "auto",
  slashCommands: [],
  terminalSlashCommands: [],
  skillNames: [],
  agentNames: [],
}
const REPORT: SessionEvent = reportEvent({
  toolUseId: "toolu_r1",
  closing: { kind: "speech", text: "架空の締め", expression: "default" },
})
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const utterance = (text: string): SessionEvent => ({ kind: "utterance", text })
const LONG_BODY = utterance("架空の本文の1行目\n架空の本文の2行目\n架空の本文の3行目")
const ONE_LINE = utterance("完了")

/** 関所に `events` を順に見せて、止まろうとしたときの判定を返す。 */
function verdictOf(
  events: readonly SessionEvent[],
  stopHookActive = false,
  nothingNewRejected: () => boolean = () => false,
  backgroundRunning: () => boolean = () => false,
) {
  const gate = createReportGate(nothingNewRejected, backgroundRunning)
  for (const event of events) {
    gate.observe(event)
  }
  return gate.verdict(stopHookActive)
}

/** 関所に `events` を順に見せて、止まろうとしたときに差し戻すかを返す。 */
function blocks(
  events: readonly SessionEvent[],
  stopHookActive = false,
  nothingNewRejected: () => boolean = () => false,
  backgroundRunning: () => boolean = () => false,
): boolean {
  return verdictOf(events, stopHookActive, nothingNewRejected, backgroundRunning).kind === "block"
}

describe("createReportGate（Stop の関所）", () => {
  it("背景の仕事が無ければ、report の無い本文は短い1行でも差し戻す", () => {
    expect(blocks([INIT, LONG_BODY])).toBe(true)
    expect(blocks([INIT, ONE_LINE])).toBe(true)
  })

  it("背景の仕事が走っていれば、report の無い本文（委譲を待つ一言も長い本文も）を通す", () => {
    expect(
      blocks(
        [INIT, utterance("架空の委譲を待つ一言")],
        false,
        () => false,
        () => true,
      ),
    ).toBe(false)
    expect(
      blocks(
        [INIT, LONG_BODY],
        false,
        () => false,
        () => true,
      ),
    ).toBe(false)
  })

  it("本文が無い・空白と改行だけのターンは通す", () => {
    expect(blocks([INIT])).toBe(false)
    expect(blocks([INIT, utterance(" \n\n ")])).toBe(false)
  })

  it("report の前に書いた本文は数えない（通った report でターンが閉じる）", () => {
    expect(blocks([INIT, LONG_BODY, REPORT])).toBe(false)
  })

  it("stop_hook_active（差し戻したあとの続き）なら、背景の仕事が無くても通す", () => {
    expect(blocks([INIT, LONG_BODY], true)).toBe(false)
    expect(blocks([INIT, ONE_LINE], true)).toBe(false)
  })

  it("report で渡し直させる理由で差し戻す（前のターンの report は持ち越さない）", () => {
    expect(verdictOf([INIT, REPORT, FINISHED, INIT, LONG_BODY])).toEqual({
      kind: "block",
      reason: REPORT_GATE_REASON,
    })
  })

  it("ターンの頭（init）と終わり（turn-finished）で前のターンの本文を持ち越さない", () => {
    expect(blocks([INIT, LONG_BODY, INIT])).toBe(false)
    expect(blocks([INIT, LONG_BODY, FINISHED])).toBe(false)
  })

  it("新しい事実が無い差し戻しがあったターンでは、背景の仕事が無くても通す", () => {
    expect(blocks([INIT, LONG_BODY], false, () => true)).toBe(false)
    expect(blocks([INIT, ONE_LINE], false, () => true)).toBe(false)
  })
})
