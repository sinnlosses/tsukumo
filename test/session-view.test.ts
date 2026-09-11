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

    expect(spoken.speeches).toEqual(["いくよ！"])
    expect(currentExpression(spoken)).toBe("proud")

    const nextTurn = applySessionEvent(spoken, { kind: "request", text: "ダミーの依頼" })

    expect(nextTurn.speeches).toEqual(["いくよ！"])
  })

  it("同じターン内のセリフは直近3件までを古い→新しいの順に並べる", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "1つめ", expression: "default" },
      { kind: "speech", text: "2つめ", expression: "default" },
      { kind: "speech", text: "3つめ", expression: "default" },
      { kind: "speech", text: "4つめ", expression: "proud" },
    )

    expect(view.speeches).toEqual(["2つめ", "3つめ", "4つめ"])
  })

  it("新しいターンで最初の speech が来た時点で、前のターンのセリフと混ざらず置き換わる", () => {
    const firstTurn = apply(
      { kind: "request", text: "1つめの依頼" },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
      { kind: "speech", text: "1つめの2つめのセリフ", expression: "default" },
    )

    const secondTurnStarted = applySessionEvent(firstTurn, {
      kind: "request",
      text: "2つめの依頼",
    })
    // 次の speak が来るまでは、前のターンのセリフを保つ（キャラクターが消えたように見せない）。
    expect(secondTurnStarted.speeches).toEqual(["1つめのセリフ", "1つめの2つめのセリフ"])

    const secondTurnSpoken = applySessionEvent(secondTurnStarted, {
      kind: "speech",
      text: "2つめのセリフ",
      expression: "default",
    })
    // 次の speak が来た時点で、そのターンのものだけになる。
    expect(secondTurnSpoken.speeches).toEqual(["2つめのセリフ"])
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

  it("ツールの結果を、対応する tool_use の記録に合わせる（メインビューにはツール系を渡さない）", () => {
    const view = apply(
      { kind: "tool-started", toolUseId: "toolu_1", name: "Read", input: { path: "/tmp/a" } },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: true },
    )

    // ツールの記録そのものは持ち続ける（サイドバー用途。docs/requirements.md 4.2）が、
    // メインビューはレポートだけを出すので `mainViewEntries` には渡さない。
    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        result: { content: "ダミーの結果", isError: true },
      },
    ])
    expect(mainViewEntries(view)).toEqual([])
  })

  it("mainViewEntries はツール系の entry を含まない（依頼とレポートの間に挟まっていても除く）", () => {
    const view = apply(
      { kind: "request", text: "依頼" },
      { kind: "tool-started", toolUseId: "toolu_1", name: "Read", input: {} },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "結果", isError: false },
      { kind: "utterance", text: "レポート本文" },
    )

    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "依頼" },
      { kind: "detail", markdown: "レポート本文" },
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

  it("request でターンが進行中になり、turn-finished で止まる（入力欄の送信/中断の切り替えに使う）", () => {
    expect(INITIAL_SESSION_VIEW.turnInProgress).toBe(false)

    const started = apply({ kind: "request", text: "ダミーの依頼" })
    expect(started.turnInProgress).toBe(true)

    const finished = applySessionEvent(started, { kind: "turn-finished", status: "success" })
    expect(finished.turnInProgress).toBe(false)
  })

  it("session-ended でも進行中を止める（中断・異常終了のどちらでも入力欄を送信可能に戻す）", () => {
    const started = apply({ kind: "request", text: "ダミーの依頼" })

    const ended = applySessionEvent(started, {
      kind: "session-ended",
      reason: "セッションが終了した",
    })

    expect(ended.turnInProgress).toBe(false)
  })

  it("答え待ちの列をそのまま持つ", () => {
    const view = apply({
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "toolu_1", toolName: "Bash", input: {} }],
    })

    expect(view.pending.map((ask) => ask.id)).toEqual(["toolu_1"])
  })

  it("speak が1回も呼ばれなかったターンでは、行頭マーカーの補助で吹き出しを埋め、本文からマーカー行を除く", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "utterance", text: "アスナ: 補助で拾ったセリフ\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["補助で拾ったセリフ"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "本文はこちら" },
    ])
  })

  it("speak が呼ばれたターンでは、マーカー行があっても本文をそのまま出す", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼" },
      { kind: "speech", text: "本物のセリフ", expression: "proud" },
      { kind: "utterance", text: "アスナ: マーカー行\n本文はこちら" },
    )

    expect(view.speeches).toEqual(["本物のセリフ"])
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", text: "ダミーの依頼" },
      { kind: "detail", markdown: "アスナ: マーカー行\n本文はこちら" },
    ])
  })

  it("記録はターン数の窓（直近20ターン）だけを残し、古いターンは落とす", () => {
    const events: SessionEvent[] = []
    for (let turn = 0; turn < 25; turn += 1) {
      events.push({ kind: "request", text: `依頼${String(turn)}` })
      events.push({ kind: "utterance", text: `レポート${String(turn)}` })
    }

    const view = apply(...events)
    const requestTexts = mainViewEntries(view)
      .filter((entry): entry is { kind: "request"; text: string } => entry.kind === "request")
      .map((entry) => entry.text)

    expect(requestTexts).toHaveLength(20)
    expect(requestTexts[0]).toBe("依頼5")
    expect(requestTexts.at(-1)).toBe("依頼24")
  })
})
