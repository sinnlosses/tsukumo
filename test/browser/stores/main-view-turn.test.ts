// 導出（`mainViewTurns`）を**姿1つにつき1回だけ**畳んでいること。`useSyncExternalStore` の
// セレクタはここを通るので、同じ姿から毎回違う配列が返ると描き直しが止まらなくなる。
//
// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。

import { describe, expect, it } from "bun:test"

import { mainViewTurnsOf } from "../../../src/browser/stores/main-view-turn.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session-state.ts"

const FIXTURE_STATE: SessionState = {
  ...INITIAL_SESSION_STATE,
  records: [
    {
      kind: "request",
      turnId: 0,
      text: "架空の依頼",
      images: [],
      time: { kind: "stamped", at: 0 },
    },
    { kind: "detail", markdown: "架空のレポート" },
  ],
}

describe("mainViewTurnsOf", () => {
  it("同じ姿なら、覚えておいた同じものを返す", () => {
    expect(mainViewTurnsOf(FIXTURE_STATE)).toBe(mainViewTurnsOf(FIXTURE_STATE))
  })

  // 背景の仕事を待って黙ると `turn-finished` が届いてターンが `finished` に落ちる。通知で
  // 再開したぶんは新しい依頼ではないので二度と立たず、そこから伸びる本文が「確定済み」として
  // 1文字目から出ていた（書き上げる演出が数十文字ぶんで終わり、ミニ立ち絵が本文の途中に残った）。
  it("ターンが終わった印でも、書きかけがあるあいだは締めの本文を出さない", () => {
    const writing: SessionState = {
      ...FIXTURE_STATE,
      records: [
        {
          kind: "request",
          turnId: 0,
          text: "架空の依頼",
          images: [],
          time: { kind: "stamped", at: 0 },
        },
      ],
      turn: { kind: "finished", startedAt: 0, finishedAt: 100, ending: { kind: "ended" } },
      partialUtterance: "架空の書きかけ",
    }

    expect(mainViewTurnsOf(writing)[0]?.steps.at(-1)?.body).toEqual({ kind: "none" })
  })

  it("書きかけが片付けば締めの本文を出す", () => {
    expect(mainViewTurnsOf(FIXTURE_STATE)[0]?.steps.at(-1)?.body).toEqual({
      kind: "text",
      report: "架空のレポート",
      firstLine: "架空のレポート",
    })
  })

  it("姿が変われば畳み直す", () => {
    const next: SessionState = {
      ...FIXTURE_STATE,
      records: [...FIXTURE_STATE.records, { kind: "detail", markdown: "架空の続き" }],
    }

    expect(mainViewTurnsOf(next)).not.toBe(mainViewTurnsOf(FIXTURE_STATE))
    expect(mainViewTurnsOf(next)[0]?.steps.length).toBe(2)
  })
})

// サブエージェントの `SendMessage` や背景のタスクの通知で、claude は同じやり取りの続きを自分で
// 始める（`turn-resumed`）。そのたびに前の SDK ターンで出た `report` まで伏せていたので、
// 合図が届くたびに中間レポートが消え、ターンが終わると同じものが出直していた。
describe("mainViewTurnsOf（claude が自分で始めた続きのターン）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const report = (conclusion: string): SessionEvent => ({
    kind: "report",
    toolUseId: "toolu_r1",
    conclusion,
    body: "",
    favor: "",
    checks: [],
  })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const resumed: SessionEvent = { kind: "turn-resumed" }
  const shownBodies = (state: SessionState) =>
    (mainViewTurnsOf(state).at(-1)?.steps ?? []).flatMap((step) =>
      step.body.kind === "text" ? [step.body.report] : [],
    )

  it("前の SDK ターンで出た report は、続きのターンが動いていても出したまま", () => {
    const state = fold([
      ask,
      report("架空の途中の結論。"),
      finished,
      resumed,
      { kind: "utterance", text: "架空の一言" },
    ])

    expect(state.turn.kind).toBe("running")
    expect(shownBodies(state)).toEqual(["架空の途中の結論。"])
  })

  it("続きのターンで届いた report は、そのターンが終わるまで出さない", () => {
    const running = fold([
      ask,
      report("架空の途中の結論。"),
      finished,
      resumed,
      report("架空の結論。"),
    ])

    expect(shownBodies(running)).toEqual(["架空の途中の結論。"])
    expect(shownBodies(applySessionEvent(running, finished, 0))).toEqual([
      "架空の途中の結論。",
      "架空の結論。",
    ])
  })

  // report の外の本文は、report を呼ぶまでのつなぎの独り言のことが多い（英語のこともある）。
  // 背景の委譲を待つあいだに前の SDK ターンの本文として出て、report が来ると消えていた。
  it("report の無いやり取りの本文は、続きのターンが動いているあいだ出さない", () => {
    const state = fold([ask, { kind: "utterance", text: "架空の一言" }, finished, resumed])

    expect(shownBodies(state)).toEqual([])
  })

  it("report の無いやり取りの本文は、背景のタスクが残っているあいだ出さない", () => {
    const waiting = fold([
      ask,
      { kind: "utterance", text: "架空の一言" },
      {
        kind: "background-tasks-changed",
        tasks: [{ taskId: "task-1", kind: "agent", description: "架空の委譲" }],
      },
      finished,
    ])

    expect(waiting.turn.kind).toBe("finished")
    expect(shownBodies(waiting)).toEqual([])
    expect(
      shownBodies(applySessionEvent(waiting, { kind: "background-tasks-changed", tasks: [] }, 0)),
    ).toEqual(["架空の一言"])
  })

  it("report の無いやり取りは、ターンが止まり背景のタスクも無ければ最後の本文を出す", () => {
    const state = fold([ask, { kind: "utterance", text: "架空の答え" }, finished])

    expect(shownBodies(state)).toEqual(["架空の答え"])
  })
})

// 背景のタスクを待つあいだに `turn-finished` が届くと、前の SDK ターンの `report` は本文として
// 出したまま——それは変えない（決まっていること）。変えたのは、その本文に最終レポートの札
// （`final`）を立ててよいタイミングだけ。背景のタスクが残っている・続きのターンが動いている
// あいだは、次の `report` でいま最後の本文が中間レポートへ回るかもしれないので札を立てない。
describe("mainViewTurnsOf（最終レポートの札は、やり取りが閉じてから）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const report = (toolUseId: string, conclusion: string): SessionEvent => ({
    kind: "report",
    toolUseId,
    conclusion,
    body: "",
    favor: "",
    checks: [],
  })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const backgroundStarted: SessionEvent = {
    kind: "background-tasks-changed",
    tasks: [{ taskId: "task-1", kind: "shell", description: "架空の背景の待ち" }],
  }
  const backgroundEnded: SessionEvent = { kind: "background-tasks-changed", tasks: [] }
  const resumed: SessionEvent = { kind: "turn-resumed" }
  const finalStep = (state: SessionState) =>
    mainViewTurnsOf(state)
      .at(-1)
      ?.steps.find((step) => step.body.kind === "text" && step.final)

  it("背景のタスクが残っているあいだは、あとから来た report にも final を立てない", () => {
    const waiting = fold([
      ask,
      report("toolu_r1", "架空の途中の結論。"),
      report("toolu_r2", "架空のいまの結論。"),
      backgroundStarted,
      finished,
    ])

    expect(waiting.turn.kind).toBe("finished")
    expect(waiting.backgroundTasks.length).toBeGreaterThan(0)
    expect(finalStep(waiting)).toBeUndefined()
  })

  it("背景のタスクが片付き、続きのターンも終われば final が立つ", () => {
    const waiting = fold([
      ask,
      report("toolu_r1", "架空の途中の結論。"),
      report("toolu_r2", "架空のいまの結論。"),
      backgroundStarted,
      finished,
    ])
    const settled = [backgroundEnded, resumed, finished].reduce(
      (current, event) => applySessionEvent(current, event, 0),
      waiting,
    )

    expect(settled.backgroundTasks.length).toBe(0)
    expect(settled.turn.kind).not.toBe("running")
    expect(finalStep(settled)?.body).toEqual({
      kind: "text",
      report: "架空のいまの結論。",
      firstLine: "架空のいまの結論。",
    })
  })

  it("続きのターンが動いているあいだも final を立てない", () => {
    const running = fold([
      ask,
      report("toolu_r1", "架空の途中の結論。"),
      report("toolu_r2", "架空のいまの結論。"),
      finished,
      resumed,
    ])

    expect(running.turn.kind).toBe("running")
    expect(finalStep(running)).toBeUndefined()
  })
})

// docs/display.md 4.2「一度出した本文は二度と消えない」を、続きのターンを2回以上含む現実の並びで
// 1件ずつ畳みながら確かめる。合図（turn-resumed）が届くたびに出ていたレポートが伏せられないことと、
// 続きのターンが吹き出しを空に戻さないことの両方を、途中の姿で見る。
describe("mainViewTurnsOf（続きのターンを2回以上含む並びを1件ずつ畳む）", () => {
  const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const interimReport: SessionEvent = {
    kind: "report",
    toolUseId: "toolu_r1",
    conclusion: "架空の中間レポート",
    body: "",
    favor: "",
    checks: [],
  }
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const resumed: SessionEvent = { kind: "turn-resumed" }
  const speechAfterFirstSignal: SessionEvent = {
    kind: "speech",
    text: "架空のいちど目の続き",
    expression: "default",
  }
  const speechAfterSecondSignal: SessionEvent = {
    kind: "speech",
    text: "架空のにど目の続き",
    expression: "default",
  }
  const finalReport: SessionEvent = {
    kind: "report",
    toolUseId: "toolu_r2",
    conclusion: "架空の最終レポート",
    body: "",
    favor: "",
    checks: [],
  }

  // 依頼 → 中間 report → 合図（turn-resumed → speech → ターンの終わり）→ 合図（同じ形）→
  // 完了の返事（speech）→ 最終 report → ターンの終わり、という現実の並び。続きのターンを2回含む。
  const events: readonly SessionEvent[] = [
    request,
    interimReport,
    finished,
    resumed,
    speechAfterFirstSignal,
    finished,
    resumed,
    speechAfterSecondSignal,
    finalReport,
    finished,
  ]

  const shownBodies = (state: SessionState) =>
    (mainViewTurnsOf(state).at(-1)?.steps ?? []).flatMap((step) =>
      step.body.kind === "text" ? [step.body.report] : [],
    )

  it("1件畳むごとに、出ていた report の本文が消えず、吹き出しも空に戻らない", () => {
    let state: SessionState = INITIAL_SESSION_STATE
    let sawInterimReport = false
    let sawFirstSpeech = false

    for (const event of events) {
      state = applySessionEvent(state, event, 0)

      if (shownBodies(state).includes("架空の中間レポート")) {
        sawInterimReport = true
      }
      if (sawInterimReport) {
        expect(shownBodies(state)).toContain("架空の中間レポート")
      }

      if (state.speeches.includes("架空のいちど目の続き")) {
        sawFirstSpeech = true
      }
      if (sawFirstSpeech) {
        expect(state.speeches.length).toBeGreaterThan(0)
      }
    }

    // 畳み終えたところで、中間・最終の両方のレポートが出ていて、吹き出しは2回ぶんとも残る。
    expect(shownBodies(state)).toEqual(["架空の中間レポート", "架空の最終レポート"])
    expect(state.speeches).toEqual(["架空のいちど目の続き", "架空のにど目の続き"])
  })
})
