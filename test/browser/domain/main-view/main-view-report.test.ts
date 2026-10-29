// `report` ツールのレポートの組み立て（結論・節・変更の札・図）と、締めの speak で終える並び。
import { describe, expect, it } from "vitest"

import { reportHeadedSections } from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import { mainViewTurns } from "../../../../src/browser/domain/main-view/main-view.ts"
import type { RecordedReportFigure } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ChangedFile } from "../../../../src/shared/report/changed-file.ts"
import type { ReportBlockSection } from "../../../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../../../src/shared/report/report-task.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type { MainViewStep } from "../../../../src/shared/session/main-view-shape.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import {
  firstLineOf,
  headOf,
  materialReport,
  reportOf,
  SETTLED,
} from "../../../fixture/main-view-entry.ts"
import {
  ask,
  finished,
  fold,
  report,
  shownReports,
  turnOf,
  utteranceEvent,
} from "../../../fixture/main-view-report.ts"
import { reportOfDrawn } from "../../../fixture/report-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

describe("mainViewTurns（締めの speak → レポートで終える並び）", () => {
  // 締めの `speak` のあとに本文で終える並びを、SDK から届くイベントの形で流す。締めの `speak` は
  // `speech` になって本文の記録にならないので、そのあとの本文が最後の本文のまま残る。
  const speech = (line: string): SessionEvent => ({
    kind: "speech",
    text: line,
    expression: "default",
  })
  const utterance = (line: string): SessionEvent => ({ kind: "utterance", text: line })
  const editRun = (toolUseId: string): readonly SessionEvent[] => [
    {
      kind: "tool-started",
      toolUseId,
      name: "Edit",
      input: { file_path: "src/a.ts" },
      parentToolUseId: undefined,
    },
    { kind: "tool-finished", toolUseId, content: "ok", isError: false },
  ]

  /** 架空のやり取りを1ターン流し終えたときのメインビュー（確定したやり取りとして描く）。 */
  function settledSteps(events: readonly SessionEvent[]): readonly MainViewStep[] {
    const state = [
      requestEvent(),
      ...events,
      { kind: "turn-finished", outcome: { kind: "completed" } } satisfies SessionEvent,
    ].reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
    return mainViewTurns(mainViewEntries(state), SETTLED, true)[0]?.steps ?? []
  }

  it("作業のあとに締めの speak を挟んで書いたレポートが最終レポートになる", () => {
    const steps = settledSteps([
      speech("見てくるぞ！"),
      utterance("まず `src/a.ts` を読むね"),
      ...editRun("toolu_1"),
      utterance("テストも通った"),
      speech("片付いたぞ！まとめを書いておくね"),
      utterance(materialReport("砂時計の目盛りを直した")),
    ])

    expect(steps.map((step) => reportOf(step))).toEqual([
      undefined,
      undefined,
      materialReport("砂時計の目盛りを直した"),
    ])
    expect(steps.map((step) => step.final)).toEqual([false, false, true])
    expect(steps.map((step) => step.interim)).toEqual([false, false, false])
  })

  it("手前の資料は出さず、締めの speak のあとのレポートだけが最終レポートになる", () => {
    const steps = settledSteps([
      utterance(materialReport("調べた結果")),
      ...editRun("toolu_1"),
      speech("ひとつ頼みたいことがあるんだ。まとめの最後に書いておく"),
      utterance(materialReport("直した結果")),
    ])

    expect(steps.map((step) => reportOf(step))).toEqual([undefined, materialReport("直した結果")])
    expect(steps.map((step) => step.interim)).toEqual([false, false])
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("レポートの無いターンでも、締めの speak のあとの短い答えが最終レポートになる", () => {
    const steps = settledSteps([
      ...editRun("toolu_1"),
      speech("直しておいたぞ！ひとことだけ書いておくね"),
      utterance("`src/a.ts` の1行を直した。"),
    ])

    expect(reportOf(steps.at(-1))).toBe("`src/a.ts` の1行を直した。")
    expect(steps.at(-1)?.final).toBe(true)
  })
})

const BASIS_BLOCK = { kind: "markdown", markdown: "架空の根拠。", fold: "", aside: "" } as const

describe("mainViewTurns（report ツールで受け取ったレポート）", () => {
  it("conclusion → body → favor（お願いの塊）の順に1つの本文へ組み、最終レポートにする", () => {
    const turn = turnOf(
      [ask, report("架空の結論。", "| 列 |\n| --- |\n| 値 |", "架空のお願い"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual(["架空の結論。\n\n| 列 |\n| --- |\n| 値 |\n\n架空のお願い"])
    expect(turn?.steps.map((step) => step.final)).toEqual([true])
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("振り返りは sections とは別の欄の値で持ち、本文の字は結論 → 節 → お願いの順", () => {
    const turn = turnOf(
      [
        ask,
        reportOfDrawn({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [{ heading: "", blocks: [BASIS_BLOCK] }],
          retrospective: { kind: "recorded", summary: "架空の結果。", drafts: [], blocks: [] },
          favor: "架空のお願い",
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const body = turn?.steps[0]?.body
    const a2ui =
      body?.kind === "text" && body.report.kind === "regions" ? body.report.a2ui : undefined
    expect(shownReports(turn)).toEqual(["架空の結論。\n\n架空の根拠。\n\n架空のお願い"])
    expect(a2ui?.kind === "surface" ? a2ui.retrospective.kind : undefined).toBe("leaves")
  })

  it("振り返りの塊は見出し「振り返り」の下の欄に、結果のあとに続けて描く", () => {
    const turn = turnOf(
      [
        ask,
        reportOfDrawn({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [{ heading: "", blocks: [BASIS_BLOCK] }],
          retrospective: {
            kind: "recorded",
            summary: "架空の結果。",
            drafts: [],
            blocks: [{ kind: "text", text: "架空の補足。", fold: "", aside: "" }],
          },
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const body = turn?.steps[0]?.body
    const regions = body?.kind === "text" ? body.report : undefined
    const surface = regions?.kind === "regions" ? regions.a2ui : undefined
    expect(surface?.kind === "surface" ? surface.retrospective : undefined).toMatchObject({
      kind: "leaves",
      heading: "## 振り返り",
      headingText: "振り返り",
      entries: [
        { kind: "text", markdown: "架空の結果。" },
        { kind: "leaf", id: expect.any(String) },
      ],
    })
  })

  it("節は並びの位置を ID に、見出しの字を前後の空白なしで持ち、お願いは面の値に載る", () => {
    const turn = turnOf(
      [
        ask,
        reportOfDrawn({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [
            {
              heading: " 架空の節A ",
              blocks: [{ kind: "text", text: "架空の本文A。", fold: "", aside: "" }],
            },
            {
              heading: "",
              blocks: [{ kind: "text", text: "架空の本文B。", fold: "", aside: "" }],
            },
          ],
          retrospective: { kind: "recorded", summary: "架空の結果。", drafts: [], blocks: [] },
          favor: "架空のお願い",
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const body = turn?.steps[0]?.body
    const regions = body?.kind === "text" ? body.report : undefined
    expect(regions).toEqual({
      kind: "regions",
      sections: [
        { id: 0, heading: "架空の節A" },
        { id: 1, heading: "" },
      ],
      a2ui: expect.objectContaining({
        kind: "surface",
        favor: { id: "favor-toolu_r1", text: "架空のお願い" },
      }),
    })
  })

  it("body は整形してから組む（落とせる行は描かず、残りと favor はそのまま）", () => {
    const turn = turnOf(
      [
        ask,
        report(
          "架空の結論。",
          "架空の結論。\n\n架空の根拠。\n\n## 架空の空の節\n\n以上です。",
          "架空のお願い",
        ),
        finished,
      ],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual(["架空の結論。\n\n架空の根拠。\n\n架空のお願い"])
  })

  it("report が呼ばれなかったターンの本文には整形を掛けない", () => {
    const turn = turnOf(
      [ask, utteranceEvent("架空の答え。\n\n以上です。"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual(["架空の答え。\n\n以上です。"])
  })

  describe("変更の札", () => {
    const TASK: ReportTask = {
      kind: "task",
      id: "t-001",
      name: "架空の作業",
      outcome: "finished",
      genre: "work",
    }
    const counted = (toolUseId: string): SessionEvent => ({
      kind: "report-change-summary",
      toolUseId,
      changed: [],
      files: 3,
      added: 12,
      removed: 4,
      mixed: false,
    })
    const changeSummaries = (turn: ReturnType<typeof turnOf>) =>
      (turn?.steps ?? []).map((step) =>
        step.body.kind === "text" ? step.body.changeSummary : undefined,
      )

    it("task のある最終レポートは、report-change-summary を畳んだ数を本文に持つ", () => {
      const turn = turnOf(
        [ask, report("架空の結論。", "", "", [], TASK), counted("toolu_r1"), finished],
        SETTLED,
        true,
      )

      expect(changeSummaries(turn)).toEqual([
        { kind: "counted", changed: [], files: 3, added: 12, removed: 4, mixed: false },
      ])
    })

    describe("変更したファイルの畳んだ節", () => {
      const regionsOf = (changed: readonly ChangedFile[]) => {
        const counting: SessionEvent = {
          kind: "report-change-summary",
          toolUseId: "toolu_r1",
          changed,
          files: changed.length,
          added: 0,
          removed: 0,
          mixed: false,
        }
        const entries = mainViewEntries(
          fold([ask, report("架空の結論。", "", "", [], TASK), counting, finished]),
        )
        const entry = entries.find((candidate) => candidate.kind === "report")
        return entry?.kind === "report" ? entry.regions : undefined
      }

      it("最終の頭にだけ出て、中間の頭には出ない", () => {
        const head = headOf(regionsOf([{ path: "src/架空/a.ts", change: "added" }]))

        expect(head?.finalStatus.changedFiles).toMatchObject({ kind: "files", count: 1 })
        expect(head?.status.changedFiles).toEqual({ kind: "none" })
      })

      it("一覧が空なら最終の頭にも出ない", () => {
        expect(headOf(regionsOf([]))?.finalStatus.changedFiles).toEqual({ kind: "none" })
      })
    })

    it("中間レポートに回った本文は数を持たない", () => {
      const turn = turnOf(
        [
          ask,
          reportOfDrawn({ toolUseId: "toolu_first", conclusion: "架空の途中。", task: TASK }),
          counted("toolu_first"),
          reportOfDrawn({ toolUseId: "toolu_last", conclusion: "架空の締め。", task: TASK }),
          finished,
        ],
        SETTLED,
        true,
      )

      expect(changeSummaries(turn)).toEqual([{ kind: "none" }, { kind: "none" }])
    })

    it("task の無い最終レポートは数を持たない", () => {
      const turn = turnOf(
        [ask, report("架空の結論。"), counted("toolu_r1"), finished],
        SETTLED,
        true,
      )

      expect(changeSummaries(turn)).toEqual([{ kind: "none" }])
    })
  })

  it("本文の節の見出しの並びは節の `heading` の字そのもの（記号を含んでも逃がさない）で、見出しの無い節は数えない", () => {
    const heading = "`tw accept` の判定 a<b & *c* _d_ [e](x) \\f"
    const turn = turnOf(
      [
        ask,
        reportOfDrawn({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [
            {
              heading,
              blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside: "" }],
            },
            {
              heading: "",
              blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside: "" }],
            },
          ],
          favor: "",
          checks: [],
          task: { kind: "none" },
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const body = turn?.steps.find((step) => step.body.kind === "text")?.body
    expect(body?.kind === "text" ? reportHeadedSections(body.report) : undefined).toEqual([
      { id: 0, heading },
    ])
  })

  it("見出しのある節の欄の ID は節の並びの位置で、見出しの無い節の位置を飛ばさず、`markdown` 本文は空になる", () => {
    const section = (heading: string): ReportBlockSection => ({
      heading,
      blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside: "" }],
    })
    const turn = turnOf(
      [
        ask,
        reportOfDrawn({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [section(""), section("一つ目"), section(""), section("二つ目")],
          favor: "",
          checks: [],
          task: { kind: "none" },
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const body = turn?.steps.find((step) => step.body.kind === "text")?.body
    expect(body?.kind === "text" ? reportHeadedSections(body.report) : undefined).toEqual([
      { id: 1, heading: "一つ目" },
      { id: 3, heading: "二つ目" },
    ])
    expect(reportHeadedSections({ kind: "markdown", markdown: "## 見出し" })).toEqual([])
  })

  describe("figure", () => {
    const checks: readonly ReportCheck[] = [
      { status: "ok", label: "架空の検査", figure: "", command: "", detail: "", howToVerify: "" },
    ]
    const sections: readonly ReportBlockSection[] = [
      {
        heading: "",
        blocks: [
          { kind: "text", text: "架空の根拠。", fold: "", aside: "" },
          {
            kind: "graph",
            title: "架空の節の図",
            direction: "TD",
            legend: [],
            source: "A -> B",
            fold: "",
            aside: "",
          },
        ],
      },
    ]
    const surfaceWith = (figure: RecordedReportFigure) => {
      const turn = turnOf(
        [
          ask,
          reportOfDrawn({
            toolUseId: "toolu_r1",
            conclusion: "架空の結論。",
            figure,
            sections,
            checks,
          }),
          finished,
        ],
        SETTLED,
        true,
      )
      const body = turn?.steps.find((step) => step.body.kind === "text")?.body
      const a2ui =
        body?.kind === "text" && body.report.kind === "regions" ? body.report.a2ui : undefined
      if (a2ui?.kind !== "surface") throw new Error("面が無い")
      return a2ui
    }
    const captionOrdinals = (a2ui: ReturnType<typeof surfaceWith>) =>
      Object.values(a2ui.leafValues).flatMap(({ captionNumber }) =>
        captionNumber.kind === "none" ? [] : [captionNumber.ordinal],
      )

    it("figure の図は面の先頭の欄に「図 1」で持ち、sections の図の番号はそのあとに続く", () => {
      const a2ui = surfaceWith({
        kind: "graph",
        title: "架空の欄の図",
        direction: "LR",
        legend: [],
        source: "X -> Y",
        fold: "",
        aside: "",
      })

      const figureLeaf = a2ui.figure.kind === "leaves" ? a2ui.figure.entries[0] : undefined
      expect(figureLeaf?.kind).toBe("leaf")
      expect(
        figureLeaf?.kind === "leaf" ? a2ui.leafValues[figureLeaf.id]?.captionNumber : undefined,
      ).toEqual({ kind: "figure", ordinal: 1 })
      expect(captionOrdinals(a2ui).toSorted()).toEqual([1, 2])
      expect(a2ui.head.checks.kind).toBe("checks")
      expect(a2ui.favor.text).toBe("")
    })

    it("none は何も持たず、sections の図が「図 1」になる", () => {
      const withNone = surfaceWith({ kind: "none", reason: "no-shape" })

      expect(withNone.figure).toEqual({ kind: "none" })
      expect(captionOrdinals(withNone)).toEqual([1])
      expect(withNone.leafValues).toEqual(
        surfaceWith({ kind: "none", reason: "unrecorded" }).leafValues,
      )
    })
  })
})
