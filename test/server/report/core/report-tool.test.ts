import { describe, expect, it } from "bun:test"

import {
  createReportGate,
  REPORT_GATE_AFTER_REPORT_REASON,
  REPORT_GATE_REASON,
  REPORT_TOOL_DESCRIPTION,
} from "../../../../src/server/report/core/report-tool.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"

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
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const utterance = (text: string): SessionEvent => ({ kind: "utterance", text })
const LONG_BODY = utterance("架空の本文の1行目\n架空の本文の2行目\n架空の本文の3行目")
const ONE_LINE = utterance("完了")

/** 関所に `events` を順に見せて、止まろうとしたときの判定を返す。 */
function verdictOf(events: readonly SessionEvent[], stopHookActive = false) {
  const gate = createReportGate()
  for (const event of events) {
    gate.observe(event)
  }
  return gate.verdict(stopHookActive)
}

/** 関所に `events` を順に見せて、止まろうとしたときに差し戻すかを返す。 */
function blocks(events: readonly SessionEvent[], stopHookActive = false): boolean {
  return verdictOf(events, stopHookActive).kind === "block"
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

  it("report の済んでいないターンは、report で渡し直させる理由で差し戻す", () => {
    expect(verdictOf([INIT, LONG_BODY])).toEqual({ kind: "block", reason: REPORT_GATE_REASON })
  })

  it("report の済んだターンは、もう画面に出ていると伝える理由で差し戻す（渡し直させない）", () => {
    expect(verdictOf([INIT, REPORT, SPEECH, LONG_BODY])).toEqual({
      kind: "block",
      reason: REPORT_GATE_AFTER_REPORT_REASON,
    })
  })

  it("前のターンの report を次のターンに持ち越さない", () => {
    expect(verdictOf([INIT, REPORT, FINISHED, INIT, LONG_BODY])).toEqual({
      kind: "block",
      reason: REPORT_GATE_REASON,
    })
  })

  it("ターンの頭（init）と終わり（turn-finished）で前のターンの本文を持ち越さない", () => {
    expect(blocks([INIT, LONG_BODY, INIT, ONE_LINE])).toBe(false)
    expect(blocks([INIT, LONG_BODY, FINISHED])).toBe(false)
  })
})

describe("REPORT_GATE_REASON", () => {
  it("report で渡し直すことと、report のあとは締めの speak だけであることを言う", () => {
    expect(REPORT_GATE_REASON).toContain("`report` ツール")
    expect(REPORT_GATE_REASON).toContain("渡し直す")
    expect(REPORT_GATE_REASON).toContain("締めの `speak` だけ")
    expect(REPORT_GATE_REASON).not.toContain("「完了」")
  })

  it("前の report を同じ引数で送り直さないことを言う", () => {
    expect(REPORT_GATE_REASON).toContain("同じ引数で送り直さない")
  })
})

describe("REPORT_GATE_AFTER_REPORT_REASON", () => {
  it("レポートはもう画面に出ていて、言い直しなら何も呼ばずに終えることを言う", () => {
    expect(REPORT_GATE_AFTER_REPORT_REASON).toContain("もう画面に出ている")
    expect(REPORT_GATE_AFTER_REPORT_REASON).toContain("`report` も `speak` も呼ばず")
    expect(REPORT_GATE_AFTER_REPORT_REASON).not.toContain("渡し直す")
  })
})

describe("差し戻しの理由文（両方）", () => {
  it("差し戻しに触れないことを言う（利用者の画面には出ない）", () => {
    for (const reason of [REPORT_GATE_REASON, REPORT_GATE_AFTER_REPORT_REASON]) {
      expect(reason).toContain("セリフでもレポートでも触れない")
    }
  })
})
