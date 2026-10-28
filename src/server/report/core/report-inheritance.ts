// `report` の差し戻しのあとの出し直しで、渡さなかった欄を直前に差し戻した呼び出しの値で埋める段。
// 動いているとき（`CallReview.pass` の頭）と、transcript からの組み直し（復元・セッションの中身）の両方が同じ段を通す。
// handler が判定と題に使う値も、同じ土台から `fill` で組む（土台は1つで、イベントの流れだけが動かす）。
//
// 土台は会話の中身なので、このメモリの中にだけ置き、ログにもファイルにも書かない。

import {
  REPORT_ARGUMENT_FIELDS,
  type ReportArgumentField,
} from "../../../shared/report/report-argument-size.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

export type ReportInheritance = {
  /**
   * 届いたイベントを1つずつ通す（メインのイベントだけを渡す）。変えるのは `report` だけで、ほかはそのまま返す。
   * `report` は {@link ReportInheritance.fill} で埋めたうえで、結果が届くまで預かる。
   *
   * 土台は、同じ `toolUseId` の `tool-finished` が `isError` で届いた（差し戻した）`report` の、埋めたあとの姿。
   * handler に届かずに落ちた呼び出しも、届いて差し戻した呼び出しも同じに扱う。
   * 差し戻しが続けば、いちばん新しい差し戻しに置き換わる。
   * 受け付けた（`isError` でない `tool-finished`）とき、ターンの頭（`session-info`・`turn-started`・`turn-resumed`）、
   * ターンの終わり（`turn-finished`）、利用者の新しい言葉（`request`・`aside`）で捨てる。
   */
  readonly pass: (event: SessionEvent) => SessionEvent
  /**
   * `report` を土台で埋めて返す（預からず、土台も変えない）。土台が無ければそのまま返す。
   * 渡さなかった欄（`argumentChars.fields` に無い欄）のうち土台が持っていた欄（土台が渡したか引き継いだ欄）を土台の値で埋め、
   * その名前を `inheritedFields` に入れる。
   * 空の値（`favor: ""`・`checks: []`）を渡した欄は渡した欄なので、引き継がずに上書きになる。
   */
  readonly fill: (report: ReportEvent) => ReportEvent
}

/** {@link ReportInheritance} を1つ作る。動いているセッション1つ、または組み直す transcript 1本に1つ。 */
export function createReportInheritance(): ReportInheritance {
  let base: ReportEvent | undefined
  // 結果（`tool-finished`）をまだ受け取っていない `report`（埋めたあとの姿）。
  let held: readonly ReportEvent[] = []

  const fill = (report: ReportEvent): ReportEvent =>
    base === undefined ? report : inherited(report, base)

  return {
    pass: (event) => {
      switch (event.kind) {
        case "report": {
          const filled = fill(event)
          held = [...held, filled]
          return filled
        }
        case "tool-finished": {
          const report = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (report !== undefined) {
            held = held.filter((candidate) => candidate !== report)
            base = event.isError ? report : undefined
          }
          return event
        }
        case "turn-finished":
          held = []
          base = undefined
          return event
        default:
          if (REPORT_INHERITANCE_BOUNDARIES.has(event.kind)) {
            base = undefined
          }
          return event
      }
    },
    fill,
  }
}

/** その欄を、渡したか引き継いだか。 */
export function hasReportField(report: ReportEvent, field: ReportArgumentField): boolean {
  return report.argumentChars.fields[field] !== undefined || report.inheritedFields.includes(field)
}

/** 土台を捨てる境目。ターンの頭と終わり、利用者の新しい言葉。 */
const REPORT_INHERITANCE_BOUNDARIES: ReadonlySet<SessionEvent["kind"]> = new Set([
  "session-info",
  "turn-started",
  "turn-resumed",
  "turn-finished",
  "request",
  "aside",
] as const satisfies readonly SessionEvent["kind"][])

/** 本文を渡す2つの欄。どちらか一方を渡したら、他方は引き継がない。 */
const BODY_FIELDS = ["sections", "body"] as const satisfies readonly ReportArgumentField[]

function inherited(event: ReportEvent, base: ReportEvent): ReportEvent {
  const passedBody = BODY_FIELDS.some((field) => event.argumentChars.fields[field] !== undefined)
  const fields = new Set(
    REPORT_ARGUMENT_FIELDS.filter(
      (field) =>
        event.argumentChars.fields[field] === undefined &&
        hasReportField(base, field) &&
        !(passedBody && BODY_FIELDS.some((bodyField) => bodyField === field)),
    ),
  )
  const from = (field: ReportArgumentField): ReportEvent => (fields.has(field) ? base : event)
  const fromBody = BODY_FIELDS.some((field) => fields.has(field)) ? base : event
  return {
    ...event,
    inheritedFields: [...fields],
    task: from("task").task,
    workPlanClosing: from("workPlanClosing").workPlanClosing,
    conclusion: from("conclusion").conclusion,
    conclusionSentenceChars: from("conclusion").conclusionSentenceChars,
    conclusionFirstSentence: from("conclusion").conclusionFirstSentence,
    keyFigures: from("keyFigures").keyFigures,
    figure: from("figure").figure,
    sections: fromBody.sections,
    unknownBlockCount: fromBody.unknownBlockCount,
    brokenFenceCount: fromBody.brokenFenceCount,
    components: fromBody.components,
    retrospective: from("retrospective").retrospective,
    favor: from("favor").favor,
    checks: from("checks").checks,
    title: from("title").title,
    sessionSummary: from("sessionSummary").sessionSummary,
    sessionRemaining: from("sessionRemaining").sessionRemaining,
    closing: from("closing").closing,
    waitingLine: from("waitingLine").waitingLine,
  }
}
