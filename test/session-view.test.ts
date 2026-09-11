import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../src/session-event.ts"
import {
  applySessionEvent,
  currentExpression,
  INITIAL_SESSION_VIEW,
  mainViewEntries,
  recentToolNames,
  type SessionView,
} from "../src/session-view.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。
function apply(...events: readonly SessionEvent[]): SessionView {
  return events.reduce(applySessionEvent, INITIAL_SESSION_VIEW)
}

describe("applySessionEvent", () => {
  it("書きかけの本文をつなぎ、完成した本文が来たら置き換える（二重に積まない）", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "partial-utterance", text: "ダミ" },
      { kind: "partial-utterance", text: "ーの本文" },
    )

    expect(streaming.partialUtterance).toBe("ダミーの本文")
    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "ダミーの本文" },
    ])

    const settled = applySessionEvent(streaming, {
      kind: "utterance",
      text: "ダミーの本文です。",
    })

    expect(settled.partialUtterance).toBe("")
    expect(mainViewEntries(settled)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "ダミーの本文です。" },
    ])
  })

  it("書きかけのまま終わったターンの本文を捨てない", () => {
    const view = apply(
      { kind: "partial-utterance", text: "途中まで" },
      { kind: "turn-finished", status: "error" },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([{ kind: "detail", markdown: "途中まで" }])
  })

  it("セリフと表情を持ち、セリフが来ないターンでも消さない", () => {
    const spoken = apply({ kind: "speech", text: "いくよ！", expression: "proud" })

    expect(spoken.speech).toBe("いくよ！")
    expect(currentExpression(spoken)).toBe("proud")

    const nextTurn = applySessionEvent(spoken, { kind: "request", text: "ダミーの依頼" })

    expect(nextTurn.speech).toBe("いくよ！")
  })

  it("ツールの実行中は表情が作業中になり、終わると直前のセリフの表情に戻る", () => {
    const running = apply(
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "tool-started", toolUseId: "toolu_1", name: "Read", input: {} },
    )

    expect(currentExpression(running)).toBe("working")
    expect(recentToolNames(running)).toEqual(["Read"])

    const finished = applySessionEvent(running, {
      kind: "tool-finished",
      toolUseId: "toolu_1",
      content: "ダミーの結果",
      isError: false,
    })

    expect(currentExpression(finished)).toBe("proud")
    expect(recentToolNames(finished)).toEqual(["Read"])
  })

  it("ツールの結果を、対応する tool_use の記録に合わせる", () => {
    const view = apply(
      { kind: "tool-started", toolUseId: "toolu_1", name: "Read", input: { path: "/tmp/a" } },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: true },
    )

    expect(mainViewEntries(view)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: { path: "/tmp/a" },
        result: { content: "ダミーの結果", isError: true },
      },
    ])
  })

  it("対応する tool_use が無い結果は記録に足さない", () => {
    const view = apply({
      kind: "tool-finished",
      toolUseId: "toolu_unknown",
      content: "ダミーの結果",
      isError: false,
    })

    expect(mainViewEntries(view)).toEqual([])
  })

  it("init のたびにセッション情報を上書きする", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
      },
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "default",
        slashCommands: ["clear", "model"],
      },
    )

    expect(view.permissionMode).toBe("default")
    expect(view.slashCommands).toEqual(["clear", "model"])
  })

  it("セッションが終わると理由を持ち、実行中のツールを空にする", () => {
    const view = apply(
      { kind: "tool-started", toolUseId: "toolu_1", name: "Read", input: {} },
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(view.endedReason).toBe("セッションが終了した")
    expect(view.runningToolNames).toEqual([])
  })

  it("答え待ちの列をそのまま持つ", () => {
    const view = apply({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })

    expect(view.pending.map((ask) => ask.id)).toEqual(["toolu_1"])
  })
})
