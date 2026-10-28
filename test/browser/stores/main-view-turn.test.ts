// 導出（`mainViewTurns`）を姿1つにつき1回だけ畳んでいること。`useSession` の
// セレクタはここを通るので、同じ姿から毎回違う配列が返ると描き直しが止まらなくなる。
//

import { describe, expect, it } from "vitest"

import { mainViewTurnsOf } from "../../../src/browser/stores/main-view-turn.ts"
import { createCallReview } from "../../../src/server/session-driver/core/call-review.ts"
import { reportEvents } from "../../../src/server/session-driver/core/sdk-report-message.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { reportDraftingOf } from "../../../src/shared/session/turn-progress.ts"
import { STAGED_PARTS } from "../../fixture/a2ui-component.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

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
      report: { kind: "markdown", markdown: "架空のレポート" },
      firstLine: "架空のレポート",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
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

// サブエージェントの `SendMessage` やバックグラウンドタスクの通知で、claude は同じやり取りの続きを自分で
// 始める（`turn-resumed`）。そのたびに前の SDK ターンで出た `report` まで伏せていたので、
// 合図が届くたびに中間レポートが消え、ターンが終わると同じものが出直していた。
describe("mainViewTurnsOf（claude が自分で始めた続きのターン）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const ask = requestEvent()
  const report = (conclusion: string): SessionEvent =>
    reportEvent({ toolUseId: "toolu_r1", conclusion })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const resumed: SessionEvent = { kind: "turn-resumed" }
  /** 出ている本文を、畳んだときの先頭行で並べる（`report` の本文は結論を包んだ HTML なので）。 */
  const shownBodies = (state: SessionState) =>
    (mainViewTurnsOf(state).at(-1)?.steps ?? []).flatMap((step) =>
      step.body.kind === "text" ? [step.body.firstLine] : [],
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

  it("report の無いやり取りの本文は、バックグラウンドタスクが残っているあいだ出さない", () => {
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

  it("report の無いやり取りは、ターンが止まりバックグラウンドタスクも無ければ最後の本文を出す", () => {
    const state = fold([ask, { kind: "utterance", text: "架空の答え" }, finished])

    expect(shownBodies(state)).toEqual(["架空の答え"])
  })
})

// バックグラウンドタスクを待つあいだに `turn-finished` が届くと、前の SDK ターンの `report` は本文として
// 出したまま——それは変えない（決まっていること）。変えたのは、その本文に最終レポートの札
// （`final`）を立ててよいタイミングだけ。バックグラウンドタスクが残っている・続きのターンが動いている
// あいだは、次の `report` でいま最後の本文が中間レポートへ回るかもしれないので札を立てない。
describe("mainViewTurnsOf（最終レポートの札は、やり取りが閉じてから）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const ask = requestEvent()
  const report = (toolUseId: string, conclusion: string): SessionEvent =>
    reportEvent({ toolUseId, conclusion })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const resumed: SessionEvent = { kind: "turn-resumed" }
  const finalStep = (state: SessionState) =>
    mainViewTurnsOf(state)
      .at(-1)
      ?.steps.find((step) => step.body.kind === "text" && step.final)

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

// docs/architecture/display/main-view.md「一度出した本文は二度と消えない」を、続きのターンを2回以上含む現実の並びで
// 1件ずつ畳みながら確かめる。合図（turn-resumed）が届くたびに出ていたレポートが伏せられないことと、
// 続きのターンが吹き出しを空に戻さないことの両方を、途中の姿で見る。
describe("mainViewTurnsOf（続きのターンを2回以上含む並びを1件ずつ畳む）", () => {
  const request = requestEvent()
  const interimReport: SessionEvent = reportEvent({
    toolUseId: "toolu_r1",
    conclusion: "架空の中間レポート",
  })
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
  const finalReport: SessionEvent = reportEvent({
    toolUseId: "toolu_r2",
    conclusion: "架空の最終レポート",
  })

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

  /** 出ている本文を、畳んだときの先頭行で並べる（`report` の本文は結論を包んだ HTML なので）。 */
  const shownBodies = (state: SessionState) =>
    (mainViewTurnsOf(state).at(-1)?.steps ?? []).flatMap((step) =>
      step.body.kind === "text" ? [step.body.firstLine] : [],
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

      if (state.speeches.some((speech) => speech.text === "架空のいちど目の続き")) {
        sawFirstSpeech = true
      }
      if (sawFirstSpeech) {
        expect(state.speeches.length).toBeGreaterThan(0)
      }
    }

    // 畳み終えたところで、中間・最終の両方のレポートが出ていて、吹き出しは2回ぶんとも残る。
    expect(shownBodies(state)).toEqual(["架空の中間レポート", "架空の最終レポート"])
    expect(state.speeches.map((speech) => speech.text)).toEqual([
      "架空のいちど目の続き",
      "架空のにど目の続き",
    ])
  })
})

// 部品の一覧の `report` は、書いている途中から草稿として描く。
// `report` は `tool-finished` まで預かられ、届いたあとも確定するまでステップに出ないので、そのあいだも草稿が残る。
describe("mainViewTurnsOf（report の草稿）", () => {
  const drafting = (toolUseId: string): SessionEvent => ({ kind: "report-drafting", toolUseId })
  const part = (toolUseId: string, index: number): SessionEvent => {
    const component = STAGED_PARTS[index]
    if (component === undefined) {
      throw new Error(`架空の部品の ${String(index)} 番目が無い`)
    }
    return { kind: "report-draft-component", toolUseId, component }
  }
  const report = (toolUseId: string): readonly SessionEvent[] =>
    reportEvents(toolUseId, { components: STAGED_PARTS }, [])
  const toolFinished = (toolUseId: string, isError: boolean): SessionEvent => ({
    kind: "tool-finished",
    toolUseId,
    content: "",
    isError,
  })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  /** 駆動と同じく `CallReview` を通して畳み、1件ごとの姿を返す。 */
  const foldEach = (events: readonly SessionEvent[]): readonly SessionState[] => {
    const review = createCallReview()
    return events
      .flatMap((event) => review.pass(event))
      .reduce<readonly SessionState[]>(
        (states, event) => [
          ...states,
          applySessionEvent(states.at(-1) ?? INITIAL_SESSION_STATE, event, 0),
        ],
        [],
      )
  }
  const draftsOf = (state: SessionState | undefined) =>
    state === undefined
      ? []
      : (mainViewTurnsOf(state)
          .at(-1)
          ?.drafts.map((draft) => [draft.toolUseId, draft.components.length]) ?? [])
  const shownReportIds = (state: SessionState | undefined) =>
    state === undefined
      ? []
      : (mainViewTurnsOf(state)
          .at(-1)
          ?.steps.flatMap((step) =>
            step.body.kind === "text" && step.origin.kind === "tool-report"
              ? [step.origin.toolUseId]
              : [],
          ) ?? [])

  it("部品が届くたびに、根から辿れる部品が草稿に載る", () => {
    const states = foldEach([requestEvent(), drafting("toolu_d1"), part("toolu_d1", 0)])
    const withLeaf = foldEach([
      requestEvent(),
      drafting("toolu_d1"),
      part("toolu_d1", 0),
      part("toolu_d1", 1),
      part("toolu_d1", 2),
    ])

    expect(draftsOf(states.at(-1))).toEqual([["toolu_d1", 1]])
    expect(draftsOf(withLeaf.at(-1))).toEqual([["toolu_d1", 3]])
  })

  it("届いた report が確定するまでは、記録の部品で同じ草稿を描き続け、確定してステップに出ると外れる", () => {
    const states = foldEach([
      requestEvent(),
      drafting("toolu_d1"),
      ...STAGED_PARTS.map((_, index) => part("toolu_d1", index)),
      ...report("toolu_d1"),
      toolFinished("toolu_d1", false),
    ])
    const held = states.at(-1)
    const settled = held === undefined ? undefined : applySessionEvent(held, finished, 0)

    expect(held !== undefined && reportDraftingOf(held.sdkTurn).kind).toBe("idle")
    expect(draftsOf(held)).toEqual([["toolu_d1", STAGED_PARTS.length]])
    expect(shownReportIds(held)).toEqual([])
    expect(draftsOf(settled)).toEqual([])
    expect(shownReportIds(settled)).toEqual(["toolu_d1"])
  })

  it("差し戻された report の草稿は消え、ステップにも出ない", () => {
    const states = foldEach([
      requestEvent(),
      drafting("toolu_d1"),
      ...STAGED_PARTS.map((_, index) => part("toolu_d1", index)),
      ...report("toolu_d1"),
      toolFinished("toolu_d1", true),
    ])

    expect(draftsOf(states.at(-1))).toEqual([])
    expect(shownReportIds(states.at(-1))).toEqual([])
  })

  it("次の report を書いているあいだは、伏せた前の report と次の草稿が並び、次が届くと前はステップに出る", () => {
    const first = [
      requestEvent(),
      drafting("toolu_d1"),
      ...STAGED_PARTS.map((_, index) => part("toolu_d1", index)),
      ...report("toolu_d1"),
      toolFinished("toolu_d1", false),
    ]
    const writingNext = foldEach([...first, drafting("toolu_d2"), part("toolu_d2", 0)]).at(-1)
    const nextArrived = foldEach([
      ...first,
      drafting("toolu_d2"),
      part("toolu_d2", 0),
      ...report("toolu_d2"),
      toolFinished("toolu_d2", false),
    ]).at(-1)

    expect(draftsOf(writingNext)).toEqual([
      ["toolu_d1", STAGED_PARTS.length],
      ["toolu_d2", 1],
    ])
    expect(draftsOf(nextArrived)).toEqual([["toolu_d2", STAGED_PARTS.length]])
    expect(shownReportIds(nextArrived)).toEqual(["toolu_d1"])
  })
})

describe("mainViewTurnsOf（変わらないターンとステップの参照）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const ask = requestEvent()
  const report: SessionEvent = reportEvent({ toolUseId: "toolu_r1" })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const reported = fold([ask, report, finished])

  it("出ているレポートに関わらない記録を1件足しても、前と同じものを返す", () => {
    const before = mainViewTurnsOf(reported)
    const after = mainViewTurnsOf(
      applySessionEvent(
        reported,
        { kind: "speech", text: "架空のセリフ", expression: "default" },
        0,
      ),
    )

    expect(after).toBe(before)
  })

  it("記録を1件足したターンだけを作り直し、前のターンは同じものを返す", () => {
    const asked = applySessionEvent(reported, ask, 0)
    const before = mainViewTurnsOf(asked)
    const after = mainViewTurnsOf(
      applySessionEvent(
        asked,
        {
          kind: "tool-started",
          toolUseId: "toolu_t1",
          name: "Read",
          input: { file_path: "/tmp/dummy.ts" },
          parentToolUseId: undefined,
        },
        0,
      ),
    )

    expect(after[0]).toBe(before[0])
    expect(after[0]?.steps[0]).toBe(before[0]?.steps[0])
    expect(after[1]).not.toBe(before[1])
  })
})
