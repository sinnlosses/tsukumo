// `report` ツールのレポートの組み立て（結論・節・変更の札・図）と、締めの speak で終える並び。
import { describe, expect, it } from "vitest"

import {
  orderedReportRegions,
  reportHeadedSections,
} from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import { mainViewTurns } from "../../../../src/browser/domain/main-view/main-view.ts"
import { parseReportBody } from "../../../../src/shared/report/body-fence.ts"
import type { ChangedFile } from "../../../../src/shared/report/changed-file.ts"
import type {
  RecordedReportFigure,
  ReportSection,
} from "../../../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../../../src/shared/report/report-check.ts"
import type { ReportTask } from "../../../../src/shared/report/report-task.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type { MainViewStep } from "../../../../src/shared/session/main-view-shape.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import {
  firstLineOf,
  lead,
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
import { reportEvent } from "../../../fixture/report-event.ts"
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

/** お願いの欄の Markdown（記法の「お願い」の塊で包む）。 */
const favorNote = (favor: string) => `<div class="note note-favor">\n\n${favor}\n\n</div>`

describe("mainViewTurns（report ツールで受け取ったレポート）", () => {
  it("conclusion → body → favor（お願いの塊）の順に1つの本文へ組み、最終レポートにする", () => {
    const turn = turnOf(
      [ask, report("架空の結論。", "| 列 |\n| --- |\n| 値 |", "架空のお願い"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([
      `${lead("架空の結論。")}\n\n| 列 |\n| --- |\n| 値 |\n\n${favorNote("架空のお願い")}`,
    ])
    expect(turn?.steps.map((step) => step.final)).toEqual([true])
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("振り返りの見出しは sections の後ろ・favor の前に置く", () => {
    const turn = turnOf(
      [
        ask,
        reportEvent({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: parseReportBody("架空の根拠。").sections,
          retrospective: { kind: "recorded", summary: "架空の結果。", drafts: [], blocks: [] },
          favor: "架空のお願い",
        }),
        finished,
      ],
      SETTLED,
      true,
    )

    const [shown] = shownReports(turn)
    const order = ["架空の根拠。", "## 振り返り", 'class="note note-favor"'].map((part) =>
      shown?.indexOf(part),
    )
    expect(order).toEqual(order.toSorted((a, b) => (a ?? 0) - (b ?? 0)))
    expect(order.every((index) => index !== undefined && index >= 0)).toBe(true)
  })

  it("振り返りの塊は見出し「振り返り」の下の欄に、結果のあとに続けて描く", () => {
    const turn = turnOf(
      [
        ask,
        reportEvent({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: parseReportBody("架空の根拠。").sections,
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
    expect(regions?.kind === "regions" ? regions.retrospective : undefined).toBe(
      "## 振り返り\n\n架空の結果。\n\n架空の補足。",
    )
  })

  it("欄は頭・節（並びの位置を ID に持つ）・振り返り・お願いに分かれ、描く順の欄はそれを順に並べたもの", () => {
    const turn = turnOf(
      [
        ask,
        reportEvent({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [
            {
              heading: " 架空の節A ",
              shapeTag: "unspecified",
              blocks: [{ kind: "text", text: "架空の本文A。", fold: "", aside: "" }],
            },
            {
              heading: "",
              shapeTag: "unspecified",
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
    const retrospective = "## 振り返り\n\n架空の結果。"
    expect(regions).toEqual({
      kind: "regions",
      head: lead("架空の結論。"),
      finalHead: lead("架空の結論。"),
      sections: [
        { id: 0, heading: "架空の節A", markdown: "## 架空の節A\n\n架空の本文A。" },
        { id: 1, heading: "", markdown: "架空の本文B。" },
      ],
      retrospective,
      favor: { id: "favor-toolu_r1", markdown: "架空のお願い" },
      a2ui: { kind: "none" },
    })
    expect(regions === undefined ? undefined : orderedReportRegions(regions)).toEqual([
      { kind: "head", markdown: lead("架空の結論。") },
      { kind: "section", id: 0, markdown: "## 架空の節A\n\n架空の本文A。" },
      { kind: "section", id: 1, markdown: "架空の本文B。" },
      { kind: "retrospective", markdown: retrospective },
      { kind: "favor", id: "favor-toolu_r1", markdown: favorNote("架空のお願い") },
    ])
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

    const [shown] = shownReports(turn)
    expect(shown?.startsWith(lead("架空の結論。"))).toBe(true)
    expect(shown?.endsWith(`</div>\n\n架空の根拠。\n\n${favorNote("架空のお願い")}`)).toBe(true)
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
        const regions = regionsOf([{ path: "src/架空/a.ts", change: "added" }])

        expect(regions?.kind === "regions" ? regions.finalHead : "").toContain(
          "<summary>変更したファイル 1</summary>",
        )
        expect(regions?.kind === "regions" ? regions.head : "").not.toContain("変更したファイル")
      })

      it("一覧が空なら最終の頭にも出ない", () => {
        const regions = regionsOf([])

        expect(regions?.kind === "regions" ? regions.finalHead : "").not.toContain(
          "変更したファイル",
        )
      })
    })

    it("中間レポートに回った本文は数を持たない", () => {
      const turn = turnOf(
        [
          ask,
          reportEvent({ toolUseId: "toolu_first", conclusion: "架空の途中。", task: TASK }),
          counted("toolu_first"),
          reportEvent({ toolUseId: "toolu_last", conclusion: "架空の締め。", task: TASK }),
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
        reportEvent({
          toolUseId: "toolu_r1",
          conclusion: "架空の結論。",
          sections: [
            {
              heading,
              shapeTag: "unspecified",
              blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside: "" }],
            },
            {
              heading: "",
              shapeTag: "unspecified",
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
    const section = (heading: string): ReportSection => ({
      heading,
      shapeTag: "unspecified",
      blocks: [{ kind: "text", text: "架空の本文。", fold: "", aside: "" }],
    })
    const turn = turnOf(
      [
        ask,
        reportEvent({
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
    const sections: readonly ReportSection[] = [
      {
        heading: "",
        shapeTag: "unspecified",
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
    const shownWith = (figure: RecordedReportFigure): string =>
      shownReports(
        turnOf(
          [
            ask,
            reportEvent({
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
        ),
      )[0] ?? ""

    it("figure の図は checks の下・sections の上に「図 1」で描き、sections の図の番号はそのあとに続く", () => {
      const shown = shownWith({
        kind: "graph",
        title: "架空の欄の図",
        direction: "LR",
        legend: [],
        source: "X -> Y",
        fold: "",
        aside: "",
      })

      const order = [
        shown.indexOf('aria-label="検証結果"'),
        shown.indexOf('図 1</span><span class="caption-text">架空の欄の図'),
        shown.indexOf("架空の根拠。"),
        shown.indexOf('図 2</span><span class="caption-text">架空の節の図'),
      ]
      expect(order.every((index) => index >= 0)).toBe(true)
      expect(order).toEqual(order.toSorted((a, b) => a - b))
      expect(shown).not.toContain("checks-summary-favor")
    })

    it("none は何も描かず、sections の図が「図 1」になる", () => {
      const withNone = shownWith({ kind: "none", reason: "no-shape" })

      expect(withNone).toBe(shownWith({ kind: "none", reason: "unrecorded" }))
      expect(withNone).toContain('図 1</span><span class="caption-text">架空の節の図')
      expect(withNone).not.toContain("図 2")
      expect(withNone).not.toContain("no-shape")
    })
  })
})
