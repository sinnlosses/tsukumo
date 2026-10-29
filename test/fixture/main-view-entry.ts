import type { PhaseListRowView } from "../../src/shared/report/report-phase-time.ts"
import type {
  MainViewA2uiReport,
  MainViewEntry,
  MainViewReportBody,
  MainViewStep,
  MainViewSurfaceHead,
  MainViewSurfaceStatus,
} from "../../src/shared/session/main-view-shape.ts"
import type { TurnBodies } from "../../src/shared/session/turn-progress.ts"
import { isBlankText } from "../../src/shared/utils/blank-text.ts"

/** いちばん新しいやり取りの本文がどれも確定している（ターンが終わっている）。 */
export const SETTLED = { report: false, utterance: false } as const satisfies TurnBodies
/** いま走っている SDK ターンで `report` もツールの外の本文も届いている。 */
export const WRITING = { report: true, utterance: true } as const satisfies TurnBodies

const NO_SURFACE_STATUS = {
  phaseTimes: { kind: "none" },
  changedFiles: { kind: "none" },
} as const satisfies MainViewSurfaceStatus

/** 根の `Report` が無い記録の面の値。`leadText` が空なら頭に結論を持たない。 */
export const noRootA2ui = (
  leadText = "",
  favorId = "favor-toolu_fictional",
): MainViewA2uiReport => ({
  kind: "none",
  head: {
    lead: leadText === "" ? { kind: "none" } : { kind: "conclusion-lead", text: leadText },
    keyFigures: [],
    checks: { kind: "none" },
    status: NO_SURFACE_STATUS,
    finalStatus: NO_SURFACE_STATUS,
  },
  favor: { id: favorId, text: "" },
})

/**
 * 本文の字を描く順（結論 → `Markdown` の葉 → お願い）につなぎ、空のものを除いたもの。
 * 面の値だけを読み、頭の合図の行・所要時間・節の見出しは含まない。
 */
export const bodyTextOf = (body: MainViewReportBody) =>
  (body.kind === "markdown"
    ? [body.markdown]
    : [
        body.a2ui.head.lead.kind === "none" ? "" : body.a2ui.head.lead.text,
        ...(body.a2ui.kind === "surface" ? Object.values(body.a2ui.markdownLeaves) : []),
        body.a2ui.favor.text,
      ]
  )
    .filter((text) => !isBlankText(text))
    .join("\n\n")
/** 本文を持つステップなら {@link bodyTextOf}。持たなければ（ステップが無ければ）undefined。 */
export const reportOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? bodyTextOf(step.body.report) : undefined
export const firstLineOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.firstLine : undefined
/** 頭の合図の行で、通った項目の所要時間の字（測れなければ空文字）。 */
export const passedTimesOf = (head: MainViewSurfaceHead | undefined): readonly string[] =>
  head?.checks.kind === "checks" ? head.checks.passed.map((row) => row.time) : []

/** 頭の段ごとの所要時間（最終のときの頭）の、計の字と一覧の段の行（`番号 名前`・所要の字・割合の字）。 */
export const phaseTimesOf = (head: MainViewSurfaceHead | undefined) => {
  const times = head?.finalStatus.phaseTimes
  const rowText = (row: PhaseListRowView): readonly string[] => [
    row.label.kind === "plain" ? row.label.text : `${row.label.num} ${row.label.name}`,
    row.valueText,
    row.ratioText,
  ]
  return times === undefined || times.kind === "none"
    ? undefined
    : {
        totalText: times.totalText,
        rows: times.rows.flatMap((entry) =>
          entry.kind === "row"
            ? [rowText(entry.row)]
            : [rowText(entry.head), ...entry.inner.map(rowText)],
        ),
      }
}

/** 本文が `report` ツールの面なら、その頭の値。 */
export const headOf = (body: MainViewReportBody | undefined): MainViewSurfaceHead | undefined =>
  body === undefined || body.kind === "markdown" ? undefined : body.a2ui.head

export const request = (text: string, turnId = 0): MainViewEntry => ({
  kind: "request",
  turnId,
  text,
  images: [],
})
export const detail = (markdown: string): MainViewEntry => ({ kind: "detail", markdown })
export const edit = (path: string): MainViewEntry => ({
  kind: "tool",
  name: "Edit",
  input: { file_path: path },
  status: {
    kind: "finished",
    finishedAt: { kind: "stamped", at: 0 },
    result: { kind: "succeeded" },
  },
})
/** `report` ツールで受け取ったレポート（引数を組んだあとの形。本文は頭の欄だけ）。中間レポートはここからしか生まれない。 */
export const toolReport = (markdown: string, toolUseId = "toolu_fictional"): MainViewEntry => ({
  kind: "report",
  regions: {
    kind: "regions",
    sections: [],
    a2ui: noRootA2ui(markdown),
  },
  conclusion: markdown,
  task: { kind: "none" },
  changeSummary: { kind: "none" },
  toolUseId,
})
/** 見出しと箇条書きを持つ本文。資料らしい形でも `report` の外なら出ないことを確かめるのに使う。 */
export const materialReport = (label: string): string =>
  `## ${label}\n\n- 1つ目の発見\n- 2つ目の発見`

export const question = (text: string): MainViewEntry => ({
  kind: "question",
  toolUseId: "toolu_fictional",
  questions: [{ header: "架空", text, multiSelect: false, options: [] }],
  answers: [],
})
