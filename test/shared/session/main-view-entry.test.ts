// `mainViewEntries` の記録ごとの結果の持ち回しと、失敗・脇の話の扱い。
import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { finalReportBody } from "../../../src/shared/session/main-view-report-body.ts"
import { type MainViewEntry, turnAsides } from "../../../src/shared/session/main-view-shape.ts"
import { mainViewTurns } from "../../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import {
  bodyMarkdownOf,
  detail,
  question,
  reportOf,
  request,
  SETTLED,
} from "../../fixture/main-view-entry.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

describe("mainViewEntries（記録ごとの結果の持ち回し）", () => {
  type Timed = readonly [SessionEvent, number]
  const foldTimed = (events: readonly Timed[], from: SessionState = INITIAL_SESSION_STATE) =>
    events.reduce((current, [event, at]) => applySessionEvent(current, event, at), from)
  const ask = requestEvent()
  const plan = (current: number, phaseSummary = ""): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: ["架空の段A", "架空の段B"],
    current,
    finishedInGroup: [],
    phaseSummary,
  })
  const bashStarted = (id: string, command: string): SessionEvent => ({
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command },
    parentToolUseId: undefined,
  })
  const bashFinished = (id: string): SessionEvent => ({
    kind: "tool-finished",
    toolUseId: id,
    content: "ok",
    isError: false,
  })
  const report = (id: string, command = ""): SessionEvent =>
    reportEvent({
      toolUseId: id,
      conclusion: `架空の結論 ${id}`,
      checks:
        command === ""
          ? []
          : [
              {
                status: "ok",
                label: "架空の検査",
                figure: "",
                command,
                detail: "",
                howToVerify: "",
              },
            ],
    })
  const reportMarkdowns = (entries: readonly MainViewEntry[]) =>
    entries.flatMap((entry) => (entry.kind === "report" ? [bodyMarkdownOf(entry.regions)] : []))
  const finalMarkdowns = (entries: readonly MainViewEntry[]) =>
    entries.flatMap((entry) =>
      entry.kind === "report" ? [bodyMarkdownOf(finalReportBody(entry.regions))] : [],
    )

  it("記録を足しても、前からある記録の結果は同じ参照のまま返る", () => {
    const before: readonly Timed[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査"), 1_000],
      [bashFinished("toolu_b1"), 2_000],
      [plan(0), 3_000],
      [plan(1, "架空のまとめ。"), 4_000],
      [report("toolu_r1", "架空の検査"), 5_000],
    ]
    const stateBefore = foldTimed(before)
    const entriesBefore = mainViewEntries(stateBefore)
    const entriesAfter = mainViewEntries(
      foldTimed(
        [
          [plan(1), 6_000],
          [report("toolu_r2"), 7_000],
        ],
        stateBefore,
      ),
    )

    expect(entriesBefore.length).toBeGreaterThan(3)
    expect(entriesAfter.length).toBeGreaterThan(entriesBefore.length)
    entriesBefore.forEach((entry, index) => {
      expect(entriesAfter[index]).toBe(entry)
    })
  })

  it("report が引く Bash の記録が変わった report だけが作り直され、所要時間が新しくなる", () => {
    const before: readonly Timed[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査A"), 1_000],
      [bashFinished("toolu_b1"), 2_000],
      [bashStarted("toolu_b2", "架空の検査B"), 3_000],
      [report("toolu_r1", "架空の検査A"), 4_000],
      [report("toolu_r2", "架空の検査B"), 5_000],
    ]
    const stateBefore = foldTimed(before)
    const entriesBefore = mainViewEntries(stateBefore)
    const entriesAfter = mainViewEntries(
      foldTimed([[bashFinished("toolu_b2"), 8_000]], stateBefore),
    )
    const reportsBefore = entriesBefore.filter((entry) => entry.kind === "report")
    const reportsAfter = entriesAfter.filter((entry) => entry.kind === "report")

    expect(reportsAfter[0]).toBe(reportsBefore[0])
    expect(reportsAfter[1]).not.toBe(reportsBefore[1])
    expect(reportMarkdowns(entriesBefore)[1]).not.toContain("5秒")
    expect(reportMarkdowns(entriesAfter)[1]).toContain('<span class="check-time">5秒</span>')
  })

  it("ワークプランのある依頼の report の最終レポートの本文には、検証の表の下に段ごとの所要時間の帯と一覧が出る", () => {
    const markdown = finalMarkdowns(
      mainViewEntries(
        foldTimed([
          [ask, 0],
          [plan(0), 1_000],
          [bashStarted("toolu_b1", "架空の検査"), 2_000],
          [bashFinished("toolu_b1"), 3_000],
          [plan(1, "架空のまとめ。"), 11_000],
          [report("toolu_r1", "架空の検査"), 15_000],
        ]),
      ),
    )[0]

    expect(markdown).toContain("計 14秒")
    expect(markdown).toMatch(
      /1\/2<\/span>架空の段A<\/span>.*?<span class="phase-time-value">10秒<\/span><span class="phase-time-ratio">71%<\/span>/,
    )
    expect(markdown).toMatch(
      /2\/2<\/span>架空の段B<\/span>.*?<span class="phase-time-value">4秒<\/span><span class="phase-time-ratio">29%<\/span>/,
    )
    expect(markdown?.indexOf('class="phase-times"')).toBeGreaterThan(
      markdown?.indexOf('class="verdict"') ?? Infinity,
    )
  })

  it("ワークプランの無い依頼の report には、段ごとの所要時間の帯と一覧を出さない", () => {
    const markdown = finalMarkdowns(
      mainViewEntries(
        foldTimed([
          [ask, 0],
          [report("toolu_r1"), 1_000],
        ]),
      ),
    )[0]

    expect(markdown).not.toContain("phase-times")
  })
})

describe("mainViewTurns（失敗で終わったターン）", () => {
  it("失敗の記録はメインビューのステップに入らず、やり取りの failure に移る", () => {
    const events: readonly SessionEvent[] = [
      requestEvent(),
      { kind: "utterance", text: "架空の本文" },
      { kind: "api-error", error: "overloaded" },
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "api-error" } } },
    ]
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )
    const [turn] = mainViewTurns(mainViewEntries(state), SETTLED, true)

    expect(turn?.failure).toEqual({
      kind: "failed",
      failure: { kind: "api-error", error: "overloaded" },
    })
    expect(turn?.steps).toHaveLength(1)
  })
})

describe("mainViewTurns（脇の話）", () => {
  const plan = (current: number, phaseSummary: string): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: ["架空の段A", "架空の段B", "架空の段C"],
    current,
    finishedInGroup: [],
    phaseSummary,
  })
  const delegating: readonly SessionEvent[] = [
    requestEvent(),
    plan(0, ""),
    plan(1, "架空のまとめ。"),
    {
      kind: "background-tasks-changed",
      tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
    },
    { kind: "turn-finished", outcome: { kind: "completed" } },
  ]
  const turnsOf = (events: readonly SessionEvent[]) =>
    mainViewTurns(
      mainViewEntries(
        events.reduce(
          (current, event) => applySessionEvent(current, event, 0),
          INITIAL_SESSION_STATE,
        ),
      ),
      SETTLED,
      false,
    )

  it("バックグラウンドタスクのあいだの脇の話は札を増やさず、親のやり取りに答えと対で吊るされる", () => {
    const turns = turnsOf([
      ...delegating,
      { kind: "aside", text: "架空の問い", images: [] },
      { kind: "speech", text: "架空の答え。", expression: "default" },
      { kind: "speech", text: "架空の続き。", expression: "default" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "aside", text: "架空の頼み", images: [] },
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.request?.text).toBe("架空の依頼")
    expect(turns[0] === undefined ? [] : turnAsides(turns[0])).toEqual([
      { text: "架空の問い", answer: { kind: "answered", text: "架空の答え。 架空の続き。" } },
      { text: "架空の頼み", answer: { kind: "waiting" } },
    ])
    expect(turns[0]?.steps.map(reportOf)).toEqual(["架空のまとめ。"])
  })

  it("脇の話のターンが終わったあとのセリフは答えにならない", () => {
    const turns = turnsOf([
      ...delegating,
      { kind: "aside", text: "架空の問い", images: [] },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "turn-resumed" },
      { kind: "speech", text: "架空の返却の知らせ。", expression: "default" },
    ])

    expect(turns[0] === undefined ? [] : turnAsides(turns[0])).toEqual([
      { text: "架空の問い", answer: { kind: "waiting" } },
    ])
  })

  it("中間レポートのあとに送った脇の話はそのステップの後ろに入り、次の中間レポートはさらにその後ろに並ぶ", () => {
    const turns = turnsOf([
      ...delegating.slice(0, 2),
      plan(1, "架空の1段目のまとめ。"),
      { kind: "aside", text: "架空の問い", images: [] },
      { kind: "speech", text: "架空の答え。", expression: "default" },
      plan(2, "架空の2段目のまとめ。"),
      { kind: "aside", text: "架空の頼み", images: [] },
    ])

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.asides.map((aside) => aside.text))).toEqual([
      ["架空の問い"],
      ["架空の頼み"],
    ])
    expect(steps.map(reportOf)).toEqual(["架空の1段目のまとめ。", "架空の2段目のまとめ。"])
  })

  it("何も出ていない依頼の直後の脇の話は、本文なしのステップに入る", () => {
    const turns = turnsOf([requestEvent(), { kind: "aside", text: "架空の問い", images: [] }])

    expect(turns[0]?.steps).toHaveLength(1)
    expect(turns[0]?.steps[0]?.body).toEqual({ kind: "none" })
    expect(turns[0]?.steps[0]?.asides.map((aside) => aside.text)).toEqual(["架空の問い"])
  })

  it("脇の話のあとに質問が来ると、質問は脇の話より後ろの別のステップに並ぶ", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("本文"),
        { kind: "aside", text: "架空の問い" },
        question("どれにする？"),
      ],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => [step.asides.length, step.actions.length])).toEqual([
      [1, 0],
      [0, 1],
    ])
  })

  it("次のステップが始まったあとに届いた答えも、最後の脇の話につながる", () => {
    const turns = turnsOf([
      requestEvent(),
      { kind: "aside", text: "架空の問い", images: [] },
      plan(1, "架空のまとめ。"),
      { kind: "speech", text: "架空の答え。", expression: "default" },
    ])

    expect(turns[0] === undefined ? [] : turnAsides(turns[0])).toEqual([
      { text: "架空の問い", answer: { kind: "answered", text: "架空の答え。" } },
    ])
  })
})
