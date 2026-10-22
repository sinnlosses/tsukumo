import { orderedReportRegions } from "../../src/shared/session/main-view-report-body.ts"
import type {
  MainViewEntry,
  MainViewReportBody,
  MainViewStep,
} from "../../src/shared/session/main-view-shape.ts"
import type { TurnBodies } from "../../src/shared/session/turn-progress.ts"

/** いちばん新しいやり取りの本文がどれも確定している（ターンが終わっている）。 */
export const SETTLED = { report: false, utterance: false } as const satisfies TurnBodies
/** いま走っている SDK ターンで `report` もツールの外の本文も届いている。 */
export const WRITING = { report: true, utterance: true } as const satisfies TurnBodies

/** 本文の、描く順の欄の Markdown を空行でつないだもの。 */
export const bodyMarkdownOf = (body: MainViewReportBody) =>
  orderedReportRegions(body)
    .map((region) => region.markdown)
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
export const toolReport = (markdown: string): MainViewEntry => ({
  kind: "report",
  regions: {
    kind: "regions",
    head: markdown,
    finalHead: markdown,
    sections: [],
    retrospective: "",
    favor: { id: "favor-toolu_fictional", markdown: "" },
  },
  conclusion: "",
  task: { kind: "none" },
  changeSummary: { kind: "none" },
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
