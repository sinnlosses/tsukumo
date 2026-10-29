// `report` ツールのレポート本文の組み方（合図の行・所要時間・task・ツールの外の本文の扱い）。
import { describe, expect, it } from "vitest"

import { orderedReportRegions } from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import { mainViewTurns } from "../../../../src/browser/domain/main-view/main-view.ts"
import type { ReportCheck } from "../../../../src/shared/report/report-check.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type {
  MainViewReportRegions,
  MainViewReportSection,
} from "../../../../src/shared/session/main-view-shape.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import {
  firstLineOf,
  lead,
  materialReport,
  SETTLED,
  WRITING,
} from "../../../fixture/main-view-entry.ts"
import {
  ask,
  finished,
  fold,
  report,
  shownReports,
  toolRun,
  turnOf,
  utteranceEvent,
} from "../../../fixture/main-view-report.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

/** 段ごとの所要時間も振り返りもお願いも無い `report` の欄（頭と最終のときの頭が同じ）。 */
const regionsOf = (
  head: string,
  sections: readonly MainViewReportSection[],
): MainViewReportRegions => ({
  kind: "regions",
  head,
  finalHead: head,
  sections,
  retrospective: "",
  favor: { id: "favor-toolu_r1", markdown: "" },
  a2ui: { kind: "none" },
})

describe("mainViewTurns（report ツールで受け取ったレポート）", () => {
  it("checks は結論のすぐ下の合図の行に組み、総括行の印が末尾のお願いの塊を指す。お願いの本文は末尾のまま", () => {
    const checks: readonly ReportCheck[] = [
      {
        status: "ok",
        label: "架空の検査",
        figure: "12 / 3",
        command: "",
        detail: "架空の件数",
        howToVerify: "",
      },
      {
        status: "unobserved",
        label: "架空の目視",
        figure: "",
        command: "",
        detail: "",
        howToVerify: "架空の窓を開いて見る",
      },
    ]
    const turn = turnOf(
      [ask, report("架空の結論。", "架空の根拠。", "架空のお願い", checks), finished],
      SETTLED,
      true,
    )

    const [shown = "", ...rest] = shownReports(turn)

    expect(rest).toEqual([])
    expect(
      shown.startsWith(
        `${lead("架空の結論。")}\n\n<div class="status">\n\n` +
          '<div class="verdict" role="group" aria-label="検証結果"><div class="checks">',
      ),
    ).toBe(true)
    expect(shown).toContain('<span class="checks-summary-favor"><a href="#favor-toolu_r1">')
    const body = turn?.steps[0]?.body
    expect((body?.kind === "text" ? orderedReportRegions(body.report) : []).at(-1)).toEqual({
      kind: "favor",
      id: "favor-toolu_r1",
      markdown: '<div class="note note-favor">\n\n架空のお願い\n\n</div>',
    })
    expect(
      shown.endsWith(
        "</div>\n\n</div>\n\n" +
          '架空の根拠。\n\n<div class="note note-favor">\n\n架空のお願い\n\n</div>',
      ),
    ).toBe(true)
    expect(shown.split('<div class="status">')).toHaveLength(2)
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("command と完全一致した同じやり取りの最後の Bash の所要時間を、行に添える", () => {
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
    const timed: readonly (readonly [SessionEvent, number])[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査"), 1_000],
      [bashFinished("toolu_b1"), 5_000],
      [bashStarted("toolu_b2", "架空の検査"), 6_000],
      [bashFinished("toolu_b2"), 68_000],
      [bashStarted("toolu_b3", "架空の検査 --別"), 69_000],
      [bashFinished("toolu_b3"), 70_000],
      [
        report("架空の結論。", "", "", [
          {
            status: "ok",
            label: "一致する",
            figure: "",
            command: "架空の検査",
            detail: "",
            howToVerify: "",
          },
          {
            status: "ok",
            label: "一致しない",
            figure: "",
            command: "架空の検",
            detail: "",
            howToVerify: "",
          },
        ]),
        71_000,
      ],
      [finished, 72_000],
    ]
    const state = timed.reduce(
      (current, [event, at]) => applySessionEvent(current, event, at),
      INITIAL_SESSION_STATE,
    )
    const [shown] = shownReports(mainViewTurns(mainViewEntries(state), SETTLED, true).at(-1))

    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">一致する</span><span class="check-figure"></span><span class="check-time">1分02秒</span>',
    )
    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">一致しない</span><span class="check-figure"></span><span class="check-time"></span>',
    )
  })

  it("run_in_background の Bash は完了の知らせまでの時間を添え、知らせが届かなければ空にする", () => {
    const backgroundStarted = (id: string, command: string): SessionEvent => ({
      kind: "tool-started",
      toolUseId: id,
      name: "Bash",
      input: { command, run_in_background: true },
      parentToolUseId: undefined,
    })
    const accepted = (id: string): SessionEvent => ({
      kind: "tool-finished",
      toolUseId: id,
      content: "架空の受付",
      isError: false,
    })
    const timed: readonly (readonly [SessionEvent, number])[] = [
      [ask, 0],
      [backgroundStarted("toolu_b1", "架空の検査"), 1_000],
      [accepted("toolu_b1"), 1_300],
      [backgroundStarted("toolu_b2", "架空の別の検査"), 2_000],
      [accepted("toolu_b2"), 2_300],
      [{ kind: "background-tool-finished", toolUseId: "toolu_b1" }, 63_000],
      [
        report("架空の結論。", "", "", [
          {
            status: "ok",
            label: "知らせが届いた",
            figure: "",
            command: "架空の検査",
            detail: "",
            howToVerify: "",
          },
          {
            status: "ok",
            label: "知らせが届かない",
            figure: "",
            command: "架空の別の検査",
            detail: "",
            howToVerify: "",
          },
        ]),
        64_000,
      ],
      [finished, 65_000],
    ]
    const state = timed.reduce(
      (current, [event, at]) => applySessionEvent(current, event, at),
      INITIAL_SESSION_STATE,
    )
    const [shown] = shownReports(mainViewTurns(mainViewEntries(state), SETTLED, true).at(-1))

    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">知らせが届いた</span><span class="check-figure"></span><span class="check-time">1分02秒</span>',
    )
    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">知らせが届かない</span><span class="check-figure"></span><span class="check-time"></span>',
    )
  })

  it("ワークプランを渡したやり取りでは、中間レポートはまとめだけで、最終レポートは結論の下に段ごとの所要時間の帯と一覧を置く", () => {
    const plan = (current: number, phaseSummary: string): SessionEvent => ({
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases: ["架空の段A", "架空の段B"],
      current,
      finishedInGroup: [],
      phaseSummary,
    })
    const turn = turnOf(
      [
        ask,
        plan(0, ""),
        plan(1, "架空のまとめ。"),
        report("架空の結論。", "架空の根拠。"),
        finished,
      ],
      SETTLED,
      true,
    )

    const [summary, final] = shownReports(turn)

    expect(summary).toBe("架空のまとめ。")
    expect(
      final?.startsWith(
        `${lead("架空の結論。")}\n\n<div class="status">\n\n<div class="phase-times">`,
      ),
    ).toBe(true)
    expect(final).toContain(
      '<span class="phase-time-label"><span class="phase-time-num">2/2</span>架空の段B</span>',
    )
    expect(final?.endsWith("</div>\n\n架空の根拠。")).toBe(true)
  })

  it("段ごとの所要時間は最終のときの頭にだけ入り、最終レポートの印が立つと本文の頭がそれに替わる", () => {
    const plan = (current: number, phaseSummary: string): SessionEvent => ({
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases: ["架空の段A", "架空の段B"],
      current,
      finishedInGroup: [],
      phaseSummary,
    })
    const events = [
      ask,
      plan(0, ""),
      plan(1, "架空のまとめ。"),
      report("架空の結論。", "架空の根拠。"),
      finished,
    ]
    const entry = mainViewEntries(fold(events)).find((each) => each.kind === "report")
    const regions = entry?.kind === "report" ? entry.regions : undefined
    const [summary, final] = (turnOf(events, SETTLED, true)?.steps ?? []).flatMap((step) =>
      step.body.kind === "text" ? [step.body.report] : [],
    )

    expect(regions?.head).toBe(lead("架空の結論。"))
    expect(regions?.finalHead).toMatch(
      new RegExp(`^${lead("架空の結論。")}\n\n<div class="status">\n\n<div class="phase-times">`),
    )
    expect(summary).toEqual({ kind: "markdown", markdown: "架空のまとめ。" })
    const surface = regions?.a2ui.kind === "surface" ? regions.a2ui : undefined
    expect(surface?.head.status).toEqual({
      phaseTimes: { kind: "none" },
      changedFiles: { kind: "none" },
    })
    expect(surface?.head.finalStatus.phaseTimes).toMatchObject({ kind: "times" })
    expect(final).toMatchObject({ head: regions?.finalHead })
    expect(
      final?.kind === "regions" && final.a2ui.kind === "surface" && final.a2ui.head.status,
    ).toEqual(surface?.head.finalStatus)
  })

  it("workPlanClosing が stopped の最終レポートでは、呼ばなかった段が「未着手」と出て、none なら「不明」と出る", () => {
    const plan: SessionEvent = {
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases: ["架空の段A", "架空の段B"],
      current: 0,
      finishedInGroup: [],
      phaseSummary: "",
    }
    const finalOf = (workPlanClosing: "stopped" | "none") =>
      shownReports(
        turnOf(
          [
            ask,
            plan,
            reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。", workPlanClosing }),
            finished,
          ],
          SETTLED,
          true,
        ),
      ).at(-1)

    expect(finalOf("stopped")).toContain('<span class="phase-time-value">未着手</span>')
    expect(finalOf("none")).toContain('<span class="phase-time-value">不明</span>')
  })

  it("やり取りが閉じていないあいだの report には、段ごとの所要時間の帯と一覧を出さない", () => {
    const plan = (current: number, phaseSummary: string): SessionEvent => ({
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases: ["架空の段A", "架空の段B"],
      current,
      finishedInGroup: [],
      phaseSummary,
    })
    const turn = turnOf(
      [
        ask,
        plan(0, ""),
        plan(1, "架空のまとめ。"),
        report("架空の結論。", "架空の根拠。"),
        finished,
      ],
      SETTLED,
      false,
    )

    const [, last] = shownReports(turn)

    expect(last).toBe(`${lead("架空の結論。")}\n\n架空の根拠。`)
  })

  it("task のあるレポートは、結論を一文の印で包み、task を本文に組まずに運ぶ（畳んだときの先頭行は結論）", () => {
    const task = {
      kind: "task",
      id: "X-7",
      name: "架空の作業",
      outcome: "stopped",
      genre: "work",
    } as const
    const turn = turnOf(
      [ask, report("架空の結論。", "架空の根拠。", "", [], task), finished],
      SETTLED,
      true,
    )

    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: {
        ...regionsOf(`<div class="conclusion">\n\n架空の結論。\n\n</div>`, [
          { id: 0, heading: "", markdown: "架空の根拠。" },
        ]),
        a2ui: expect.objectContaining({ kind: "surface" }),
      },
      firstLine: "架空の結論。",
      task,
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    })
  })

  it("task のあるレポートの結論が空なら、畳んだときの先頭行は作業の名前", () => {
    const task = {
      kind: "task",
      id: "X-7",
      name: "架空の作業",
      outcome: "stopped",
      genre: "work",
    } as const
    const turn = turnOf([ask, report("", "架空の根拠。", "", [], task), finished], SETTLED, true)

    expect(firstLineOf(turn?.steps.find((step) => step.final))).toBe("架空の作業")
  })

  it("結論の無いレポートは節だけ、節の無いレポートは結論だけを出す", () => {
    const sectionsOnly = turnOf([ask, report("", "架空の根拠。"), finished], SETTLED, true)
    const conclusionOnly = turnOf([ask, report("架空の結論だけ。"), finished], SETTLED, true)

    expect(shownReports(sectionsOnly)).toEqual(["架空の根拠。"])
    expect(shownReports(conclusionOnly)).toEqual([lead("架空の結論だけ。")])
  })

  it("checks が無ければお願いだけでも合図の行を出さない（お願いの本文は末尾に出る）", () => {
    const turn = turnOf([ask, report("架空の結論。", "", "架空のお願い"), finished], SETTLED, true)

    expect(shownReports(turn)).toEqual([
      `${lead("架空の結論。")}\n\n<div class="note note-favor">\n\n架空のお願い\n\n</div>`,
    ])
  })

  it("report が呼ばれたターンではツールの外に書いた本文を出さない（資料も締めのテキストも）", () => {
    const turn = turnOf(
      [
        ask,
        utteranceEvent(materialReport("テキストで書いた資料")),
        ...toolRun("toolu_1"),
        report("架空の結論。"),
        { kind: "speech", text: "書けたよ", expression: "default" },
        utteranceEvent("完了"),
        finished,
      ],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([lead("架空の結論。")])
    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: regionsOf(lead("架空の結論。"), []),
      firstLine: "架空の結論。",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    })
  })

  it("最後の呼び出しが最終レポート、それより前は中間レポートになる", () => {
    const turn = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([lead("途中の結論。"), lead("最後の結論。")])
    expect(turn?.steps.flatMap((step) => firstLineOf(step) ?? [])).toEqual([
      "途中の結論。",
      "最後の結論。",
    ])
    const shown = (turn?.steps ?? []).filter((step) => step.body.kind === "text")
    expect(shown.map((step) => step.interim)).toEqual([true, false])
    expect(shown.map((step) => step.final)).toEqual([false, true])
    expect(turn?.hasInterimReport).toBe(true)
  })

  it("最後の report のあとに作業が続いて終わっても、それが最終レポートになる", () => {
    const turn = turnOf(
      [ask, report("唯一の結論。"), ...toolRun("toolu_1"), finished],
      SETTLED,
      true,
    )

    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: regionsOf(lead("唯一の結論。"), []),
      firstLine: "唯一の結論。",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    })
  })

  it("動いているあいだは、いちばん新しい report を出さず、それより前は中間レポートとして出す", () => {
    const running = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。")],
      WRITING,
      false,
    )

    expect(shownReports(running)).toEqual([lead("途中の結論。")])
    expect(running?.steps.find((step) => step.body.kind === "text")?.interim).toBe(true)
  })

  it("report が呼ばれなかったターンは、同じセッションでも最後の本文を出す", () => {
    const turns = mainViewTurns(
      mainViewEntries(
        fold([
          ask,
          report("前のターンの結論。"),
          finished,
          requestEvent("次の架空の依頼"),
          utteranceEvent("テキストで書いた答え"),
          finished,
        ]),
      ),
      SETTLED,
      true,
    )

    expect(turns.map((turn) => shownReports(turn))).toEqual([
      [lead("前のターンの結論。")],
      ["テキストで書いた答え"],
    ])
  })
})

describe("orderedReportRegions", () => {
  it("report の本文は頭 → 節 → 振り返り → お願いの順に並べ、お願いは記法の塊で包んで飛ぶ先の id を欄に持たせる", () => {
    expect(
      orderedReportRegions({
        kind: "regions",
        head: "架空の頭",
        finalHead: "架空の最終の頭",
        sections: [
          { id: 0, heading: "架空の節", markdown: "## 架空の節\n\n架空の一。" },
          { id: 2, heading: "", markdown: "架空の二。" },
        ],
        retrospective: "架空の振り返り",
        favor: { id: "favor-toolu_fictional", markdown: "架空のお願い" },
        a2ui: { kind: "none" },
      }),
    ).toEqual([
      { kind: "head", markdown: "架空の頭" },
      { kind: "section", id: 0, markdown: "## 架空の節\n\n架空の一。" },
      { kind: "section", id: 2, markdown: "架空の二。" },
      { kind: "retrospective", markdown: "架空の振り返り" },
      {
        kind: "favor",
        id: "favor-toolu_fictional",
        markdown: '<div class="note note-favor">\n\n架空のお願い\n\n</div>',
      },
    ])
  })

  it("空白だけの欄は置かない", () => {
    expect(
      orderedReportRegions({
        kind: "regions",
        head: " ",
        finalHead: "",
        sections: [{ id: 0, heading: "", markdown: "架空の一。" }],
        retrospective: "",
        favor: { id: "favor-toolu_fictional", markdown: "\n" },
        a2ui: { kind: "none" },
      }),
    ).toEqual([{ kind: "section", id: 0, markdown: "架空の一。" }])
  })

  it("Markdown 1本の本文は、空でなければ markdown の欄1つ", () => {
    expect(orderedReportRegions({ kind: "markdown", markdown: "架空の本文" })).toEqual([
      { kind: "markdown", markdown: "架空の本文" },
    ])
    expect(orderedReportRegions({ kind: "markdown", markdown: "  " })).toEqual([])
  })
})
