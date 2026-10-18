import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import type { StampedEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent", () => {
  it("書きかけの本文をつなぎ、完成した本文が来たら置き換える（二重に積まない）", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "partial-utterance", text: "ダミ" },
      { kind: "partial-utterance", text: "ーの本文" },
    )

    expect(streaming.partialUtterance).toBe("ダミーの本文")
    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーの本文" },
    ])

    const settled = applySessionEvent(
      streaming,
      { kind: "utterance", text: "ダミーの本文です。" },
      0,
    )

    expect(settled.partialUtterance).toBe("")
    expect(mainViewEntries(settled)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーの本文です。" },
    ])
  })

  it("書きかけのまま終わったターンの本文を捨てない", () => {
    const view = apply(
      { kind: "partial-utterance", text: "途中まで" },
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([{ kind: "detail", markdown: "途中まで" }])
  })

  it("見えない文字だけの本文は積まず、その前の本文を締めの本文から外さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "utterance", text: "ダミーのレポート" },
      { kind: "speech", text: "できたよ！", expression: "proud" },
      { kind: "partial-utterance", text: "​" },
      { kind: "utterance", text: "​" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    )

    expect(view.partialUtterance).toBe("")
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
  })

  it("書きかけの本文が見えない文字だけのあいだは、メインビューに出さない", () => {
    const streaming = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "partial-utterance", text: "​" },
    )

    expect(mainViewEntries(streaming)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
    ])
  })

  it("speech イベントの時刻（at）が state.speeches の要素にも載る", () => {
    const state = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      1234,
    )

    expect(state.speeches).toEqual([
      { text: "いくよ！", expression: "proud", time: { kind: "stamped", at: 1234 } },
    ])
  })

  it("セリフは記録にも積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "utterance", text: "ダミーのレポート" },
    )

    // 記録には残す（過去のターンの吹き出しを引き直すため。`turnSpeeches`）。
    expect(view.records).toEqual([
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      {
        kind: "speech",
        text: "いくよ！",
        expression: "proud",
        time: { kind: "stamped", at: 0 },
        answersAside: false,
      },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // メインビューにはセリフを出さない（吹き出しだけ。docs/architecture/display.md「表示」）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "detail", markdown: "ダミーのレポート" },
    ])
    // `MainViewEntry` には `speech` の種類そのものが無い（型の側でも混ざらない）。
  })

  it("圧縮の区切り（compact-boundary）は記録に積むが、レポート（mainViewEntries）には出さない", () => {
    const view = apply(
      { kind: "request", text: "ダミーの依頼", images: [] },
      { kind: "speech", text: "いくよ！", expression: "proud" },
      { kind: "compact-boundary" },
      { kind: "request", text: "2つめの依頼", images: [] },
    )

    // 記録には積む（雑談のログ側 `chatLogRows` が読む）。
    expect(view.records).toEqual([
      {
        kind: "request",
        turnId: 0,
        text: "ダミーの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
      {
        kind: "speech",
        text: "いくよ！",
        expression: "proud",
        time: { kind: "stamped", at: 0 },
        answersAside: false,
      },
      { kind: "compact-boundary" },
      {
        kind: "request",
        turnId: 1,
        text: "2つめの依頼",
        images: [],
        time: { kind: "stamped", at: 0 },
      },
    ])
    // 仕事のメインビューには出さない（docs/architecture/chat-mode.md「雑談モード」）。
    expect(mainViewEntries(view)).toEqual([
      { kind: "request", turnId: 0, text: "ダミーの依頼", images: [] },
      { kind: "request", turnId: 1, text: "2つめの依頼", images: [] },
    ])
  })

  it("依頼とセリフの記録は、そのイベントに打たれた時刻を持つ", () => {
    const events: readonly StampedEvent[] = [
      { at: 1_000, event: { kind: "request", text: "架空の依頼", images: [] } },
      { at: 2_000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
    ]
    const view = events.reduce(
      (state, stamped) => applySessionEvent(state, stamped.event, stamped.at),
      INITIAL_SESSION_STATE,
    )

    expect(view.records.map((record) => ("time" in record ? record.time : undefined))).toEqual([
      { kind: "stamped", at: 1_000 },
      { kind: "stamped", at: 2_000 },
    ])
  })

  it("新しいターンの request の直後は吹き出しを空にして表情を既定に戻し、次の speak でそのターンのものだけになる", () => {
    const firstTurn = apply(
      { kind: "request", text: "1つめの依頼", images: [] },
      { kind: "speech", text: "1つめのセリフ", expression: "default" },
      { kind: "speech", text: "1つめの2つめのセリフ", expression: "proud" },
    )

    const secondTurnStarted = applySessionEvent(
      firstTurn,
      { kind: "request", text: "2つめの依頼", images: [] },
      0,
    )
    // 送信した時点で前のターンの一言は残さず空にする（次のターンに移ったことが画面から
    // 分かるように）。
    expect(secondTurnStarted.speeches).toEqual([])
    expect(secondTurnStarted.speechExpression).toBe("default")

    const secondTurnSpoken = applySessionEvent(
      secondTurnStarted,
      { kind: "speech", text: "2つめのセリフ", expression: "default" },
      0,
    )
    // 次の speak が来た時点で、そのターンのものだけになる。
    expect(secondTurnSpoken.speeches).toEqual([
      { text: "2つめのセリフ", expression: "default", time: { kind: "stamped", at: 0 } },
    ])
  })

  it("ツールが動いていても表情は直前の speak のまま変わらない（自動の上書きは 2026-09-17 に撤去）", () => {
    // 表情の源は `speak` の1つだけ（docs/requirements.md「状態連動」）。ツールの開始・終了・
    // 時間の経過では表情が動かないことを固定する（以前はここで `working` へ自動で
    // 切り替えていた。吹き出しと表情が食い違う唯一の経路だったのでやめた）。
    const spoken = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const running = applySessionEvent(
      spoken,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      0,
    )

    expect(running.speechExpression).toBe("proud")

    const finished = applySessionEvent(
      running,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
      60_000,
    )

    // どれだけ時間が経っても（ツールが長く走っても、終わったあとも）表情は変わらない。
    expect(finished.speechExpression).toBe("proud")
  })
})
