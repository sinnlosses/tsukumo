// 段が移った `work_plan` から作る中間レポート（段のまとめ）。
import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { mainViewTurns } from "../../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import type { TurnBodies } from "../../../src/shared/session/turn-progress.ts"
import { lead, reportOf, SETTLED, WRITING } from "../../fixture/main-view-entry.ts"
import { reportEvent } from "../../fixture/report-event.ts"

describe("mainViewTurns（段が移ったときの中間レポート）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies, closed: boolean) =>
    mainViewTurns(mainViewEntries(fold(events)), unsettled, closed).at(-1)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const phases = ["架空の段A", "架空の段B"]
  const plan = (current: number, phaseSummary = "", names = phases): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: names,
    current,
    finishedInGroup: [],
    phaseSummary,
  })
  const report: SessionEvent = reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

  it("段を進めると、ターンが動いているあいだも終えた段の中間レポートを出す", () => {
    const turn = turnOf([ask, plan(0), plan(1, "架空のまとめ。")], WRITING, false)
    const step = turn?.steps.at(-1)

    expect(step?.interim).toBe(true)
    expect(step?.superseded).toBe(false)
    expect(step?.body).toEqual({
      kind: "text",
      headings: [],
      report: "架空のまとめ。",
      finalReport: "架空のまとめ。",
      firstLine: "1/2 架空の段A",
      task: { kind: "none" },
      finishedPhase: {
        kind: "phase",
        label: "1/2 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
        skipped: false,
      },
      changeSummary: { kind: "none" },
    })
  })

  it("中間レポートには終えた段の所要を記録の時刻から測って載せ、測れなければ不明にする", () => {
    const foldAt = (events: readonly SessionEvent[]) =>
      events.reduce(
        (current, event, index) => applySessionEvent(current, event, index * 7000),
        INITIAL_SESSION_STATE,
      )
    const finishedPhaseOf = (events: readonly SessionEvent[]) => {
      const body = mainViewTurns(mainViewEntries(foldAt(events)), WRITING, false)
        .at(-1)
        ?.steps.at(-1)?.body
      return body?.kind === "text" ? body.finishedPhase : undefined
    }
    const three = ["架空の段A", "架空の段B", "架空の段C"]

    expect(finishedPhaseOf([ask, plan(0), plan(1, "架空のまとめ。")])).toEqual({
      kind: "phase",
      label: "1/2 架空の段A",
      duration: { kind: "known", milliseconds: 7000 },
      skipped: false,
    })
    expect(
      finishedPhaseOf([ask, plan(1, "架空のまとめ。", three), plan(2, "架空のまとめ。", three)]),
    ).toEqual({
      kind: "phase",
      label: "2/3 架空の段B",
      duration: { kind: "unknown" },
      skipped: false,
    })
  })

  it("最終レポートが出ると段のまとめは畳まれ、最終レポートのラベルの条件（中間レポートがある）が立つ", () => {
    const turn = turnOf(
      [ask, plan(0), plan(1, "架空のまとめ。"), plan(2), report, finished],
      SETTLED,
      true,
    )
    const [summary, final] = (turn?.steps ?? []).filter((step) => step.body.kind === "text")

    expect(summary?.interim && summary.superseded).toBe(true)
    expect(final?.final).toBe(true)
    expect(reportOf(final)?.startsWith(lead("架空の結論。"))).toBe(true)
    expect(turn?.hasInterimReport).toBe(true)
  })

  it("report の無いターンでも、段のまとめは最終レポートにならない", () => {
    const turn = turnOf(
      [
        ask,
        plan(0),
        plan(1, "架空のまとめ。"),
        { kind: "utterance", text: "架空の答え" },
        finished,
      ],
      SETTLED,
      true,
    )

    expect(turn?.steps.filter((step) => step.interim).map(reportOf)).toEqual(["架空のまとめ。"])
    expect(reportOf(turn?.steps.find((step) => step.final))).toBe("架空の答え")
  })

  it("段が戻っても、終えた段のまとめが無ければ何も出ない", () => {
    const turn = turnOf([ask, plan(0), plan(1, "架空のまとめ。"), plan(0)], WRITING, false)

    expect(turn?.steps.length).toBe(1)
    expect(turn?.steps.at(-1)?.body).toEqual({
      kind: "text",
      headings: [],
      report: "架空のまとめ。",
      finalReport: "架空のまとめ。",
      firstLine: "1/2 架空の段A",
      task: { kind: "none" },
      finishedPhase: {
        kind: "phase",
        label: "1/2 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
        skipped: false,
      },
      changeSummary: { kind: "none" },
    })
  })

  it("1段だけのワークプランでは、中間レポートも出ない", () => {
    const single = ["架空の段A"]
    const turn = turnOf(
      [ask, plan(0, "", single), plan(1, "", single), report, finished],
      SETTLED,
      true,
    )

    const shown = turn?.steps.filter((step) => step.body.kind === "text") ?? []

    expect(shown.map((step) => step.final)).toEqual([true])
    expect(turn?.hasInterimReport).toBe(false)
  })

  it("段のまとめも、1つのやり取りで画面に出す記録の上限に数える", () => {
    const many = Array.from({ length: 45 }, (_, index) => `架空の段${String(index)}`)
    const turn = turnOf(
      [
        ask,
        plan(0, "", many),
        ...many.slice(1).map((_, index) => plan(index + 1, "架空のまとめ。", many)),
      ],
      SETTLED,
      true,
    )

    // 44 の段の移り（まとめのみ）= 44 件のうち、上限の 40 件を残す。
    expect(turn?.droppedCount).toBe(4)
  })
})
