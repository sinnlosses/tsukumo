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
