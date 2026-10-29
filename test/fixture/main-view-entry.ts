import type {
  MainViewA2uiReport,
  MainViewEntry,
  MainViewReportBody,
  MainViewStep,
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

/** 本文の、欄の Markdown を描く順（頭 → 節 → 振り返り → お願い）につなぎ、空の欄を除いたもの。 */
export const bodyMarkdownOf = (body: MainViewReportBody) =>
  (body.kind === "markdown"
    ? [body.markdown]
    : [
        body.head,
        ...body.sections.map((section) => section.markdown),
        body.retrospective,
        isBlankText(body.favor.markdown)
          ? ""
          : `<div class="note note-favor">\n\n${body.favor.markdown}\n\n</div>`,
      ]
  )
    .filter((markdown) => !isBlankText(markdown))
    .join("\n\n")
/** 本文を持つステップなら {@link bodyMarkdownOf}。持たなければ（ステップが無ければ）undefined。 */
export const reportOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? bodyMarkdownOf(step.body.report) : undefined
export const firstLineOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.firstLine : undefined
/** `task` の無い `report` の結論を包んだ形。 */
export const lead = (conclusion: string) =>
  `<div class="conclusion-lead">\n\n${conclusion}\n\n</div>`

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
    head: markdown,
    finalHead: markdown,
    sections: [],
    retrospective: "",
    favor: { id: "favor-toolu_fictional", markdown: "" },
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
