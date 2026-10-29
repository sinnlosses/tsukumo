// 仕事のときだけ載る `report` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../shared/report/a2ui-report-catalog.ts"
import type { ReportArgumentField } from "../../../shared/report/report-argument-size.ts"
import { reportOutline, sectionLeaves } from "../../../shared/report/report-outline.ts"
import type { ReportTask } from "../../../shared/report/report-task.ts"
import type { FigurePreference } from "../../../shared/session/session-default.ts"
import { WORK_PLAN_CLOSINGS } from "../../../shared/session/work-plan.ts"
import { REPORT_TOOL_NAME } from "../../core/tsukumo-tool-name.ts"
import { readReportBlockFiles } from "../../report/adapter/report-file.ts"
import { a2uiStructureFaults } from "../../report/core/a2ui-structure-fault.ts"
import { hasReportField } from "../../report/core/report-inheritance.ts"
import { REPORT_CHANGED_FIELDS_ONLY_TEXT } from "../../report/core/report-rejection.ts"
import {
  REPORT_A2UI_COMPONENTS_DESCRIPTION,
  REPORT_CHECKS_DESCRIPTION,
  REPORT_CLOSING_DESCRIPTION,
  REPORT_KEY_FIGURES_DESCRIPTION,
  reportFigureDescription,
  REPORT_RETROSPECTIVE_DESCRIPTION,
  REPORT_SECTIONS_DESCRIPTION,
  REPORT_SESSION_REMAINING_DESCRIPTION,
  REPORT_SESSION_SUMMARY_DESCRIPTION,
  REPORT_TASK_DESCRIPTION,
  REPORT_TITLE_DESCRIPTION,
  REPORT_TOOL_DESCRIPTION,
  REPORT_WAITING_LINE_DESCRIPTION,
  REPORT_WORK_PLAN_CLOSING_DESCRIPTION,
} from "../../report/core/report-tool.ts"
import type { CallReview } from "../core/call-review.ts"
import { reportEvents } from "../core/sdk-report-message.ts"
import { speechShape } from "./sdk-speech-tool.ts"

/**
 * レポートを受け取るツール。差し戻しの判定の窓口はここだけ（`CallReview.judgeReport`）。
 * 通すときの戻り値は結論の1文目だけ、差し戻すときは規約違反と直し方だけを `isError` 付きで返す（画面の事情は載せない）。
 * 描くか捨てるかはこの `isError` を見て決まる。
 * レポートにする引数（締めのセリフの `closing` も）は、ここではなく `assistant` メッセージの変換が取り出す（`toSessionEvents`）。
 *
 * モデルに渡す schema の欄はどれも任意で、省いた欄は同じターンで直前に差し戻した呼び出しから引き継ぐ。
 * 判定と題には、届いた引数を `assistant` メッセージの変換と同じ `reportEvents` でイベントの形にし、
 * 描く値と同じ土台で埋めた値（`CallReview.fillReport`）を使う。
 * 組んだ値が省けない欄（{@link ALL_REQUIRED_REPORT_FIELDS}。`sessionRemaining` は作業を終えたときだけ省ける）を欠いたら、判定せずに `isError` で返す（記録の理由は `tool-error`）。
 * 土台を動かすのは `CallReview.pass` に流れる結果だけで、ここは読むだけ。
 *
 * 通したときだけ結果に `_meta["claude/endTurn"]` を付け、そこでターンを閉じる。
 * Claude Code はこの結果のあとに assistant を挟まず `result` を返す。この印は transcript には残らない。
 * 差し戻し（`isError`）では閉じず、モデルが直して呼び直す。
 *
 * `title` は差し戻されなかったときだけ `onReportTitle` へ渡す。
 * 差し戻された呼び出しの題を渡すと、規約違反を書いたついでの題が残ってしまう。
 * 実際に書くかどうかの判断（利用者の `/rename` を上書きしないなど）は `decideSessionTitle` が持つので、ここは渡すだけ。
 *
 * 入力は A2UI のカタログの部品の一覧 `components` だけで受ける。
 * 構造の規約に外れた一覧は、判定より先に `CallReview.judgeReportStructure` に渡し、差し戻すなら `VALIDATION_FAILED` の文を `isError` で返す。
 */
export function reportTool(
  expressions: readonly ExpressionChoice[],
  review: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
  figurePreference: FigurePreference,
) {
  const expressionNames = expressions.map((choice) => choice.name)
  const answer = async (input: unknown) => {
    const called = reportEvents(HANDLER_TOOL_USE_ID, input, expressionNames).find(
      (event) => event.kind === "report",
    )
    const report = called === undefined ? undefined : review.fillReport(called)
    const missing = (
      report === undefined ? ALL_REQUIRED_REPORT_FIELDS : requiredFieldsOf(report)
    ).filter((field) => report === undefined || !hasReportField(report, field))
    if (report === undefined || missing.length > 0) {
      return {
        content: [{ type: "text" as const, text: missingFieldsText(missing) }],
        isError: true,
      }
    }
    const fileContents = await readReportBlockFiles(
      cwd,
      sectionLeaves(reportOutline(report.components)),
    )
    const verdict = review.judgeReport({
      conclusion: report.conclusion,
      conclusionSentenceChars: report.conclusionSentenceChars,
      keyFigures: report.keyFigures,
      components: report.components,
      favor: report.favor,
      checks: report.checks,
      fileContents,
      task: report.task,
      workPlanClosing: report.workPlanClosing,
    })
    if (verdict.kind === "rejected") {
      return { content: [{ type: "text" as const, text: verdict.text }], isError: true }
    }
    if (report.title !== undefined) {
      onReportTitle(report.title)
    }
    return {
      content: [{ type: "text" as const, text: report.conclusionFirstSentence }],
      _meta: { [END_TURN_META_KEY]: true },
    }
  }

  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    a2uiInputShape(expressions, figurePreference),
    async (input) => {
      const faults = a2uiStructureFaults(input.components)
      const structure =
        faults.length === 0 ? { kind: "accepted" as const } : review.judgeReportStructure(faults)
      return structure.kind === "rejected"
        ? { content: [{ type: "text" as const, text: structure.text }], isError: true }
        : answer(input)
    },
  )
}

/**
 * 組んだ値で省けない欄。モデルに渡す schema ではどれも任意で、省いた欄は差し戻した呼び出しから引き継ぐ。
 * `sessionRemaining` は作業を終えた（`task.outcome` が `finished`）ときだけ省ける。
 * `figure` は省ける（省くと図なしとして描かれる）。
 */
const ALL_REQUIRED_REPORT_FIELDS = [
  "conclusion",
  "sessionRemaining",
  "closing",
] as const satisfies readonly ReportArgumentField[]

function requiredFieldsOf(report: { readonly task: ReportTask }): readonly ReportArgumentField[] {
  const finished = report.task.kind === "task" && report.task.outcome === "finished"
  return finished
    ? ALL_REQUIRED_REPORT_FIELDS.filter((field) => field !== "sessionRemaining")
    : ALL_REQUIRED_REPORT_FIELDS
}

/** handler で組む `report` のイベントの id。土台で埋めるだけで、預かりの突き合わせには使わない。 */
const HANDLER_TOOL_USE_ID = "report-handler"

/** 省けない欄が組んだ値に無いときの戻り値。欄の名前だけを載せ、モデルが書いた本文は写さない。 */
function missingFieldsText(missing: readonly ReportArgumentField[]): string {
  return (
    `Input validation error: ${REPORT_TOOL_NAME} に省けない欄が無い（渡さず、引き継ぐ差し戻しも無い）: ${missing.join(", ")}\n` +
    REPORT_CHANGED_FIELDS_ONLY_TEXT
  )
}

/**
 * モデルに渡す引数の形。`Report` の欄に説明を付け、締めのセリフと待ちの一言だけ、表情を選べる名前に絞る。
 * 結論の説明は `Report` の部品の定義が持つ。
 */
function a2uiInputShape(
  expressions: readonly ExpressionChoice[],
  figurePreference: FigurePreference,
) {
  const { Report, Section, ...others } = REPORT_COMPONENT_SCHEMAS
  const { shape } = Report
  const report = Report.extend({
    figure: shape.figure.describe(
      `${reportFigureDescription(figurePreference)}ここには図の部品の ID を置く。`,
    ),
    task: shape.task.describe(REPORT_TASK_DESCRIPTION),
    workPlanClosing: z
      .enum(WORK_PLAN_CLOSINGS)
      .optional()
      .describe(REPORT_WORK_PLAN_CLOSING_DESCRIPTION),
    keyFigures: shape.keyFigures.describe(REPORT_KEY_FIGURES_DESCRIPTION),
    retrospective: shape.retrospective.describe(REPORT_RETROSPECTIVE_DESCRIPTION),
    favor: shape.favor.describe(
      "作業を終えた・止めたあとに残る利用者へのお願い（判断・作業・情報）が実際にあるときだけ1つ（2件あってもまとめる）。無ければ省く",
    ),
    checks: shape.checks.describe(REPORT_CHECKS_DESCRIPTION),
    title: shape.title.describe(REPORT_TITLE_DESCRIPTION),
    sessionSummary: shape.sessionSummary.describe(REPORT_SESSION_SUMMARY_DESCRIPTION),
    sessionRemaining: shape.sessionRemaining.describe(REPORT_SESSION_REMAINING_DESCRIPTION),
    closing: z.object(speechShape(expressions)).optional().describe(REPORT_CLOSING_DESCRIPTION),
    waitingLine: z
      .object(speechShape(expressions))
      .optional()
      .describe(REPORT_WAITING_LINE_DESCRIPTION),
  })
  return {
    components: z
      .array(
        z.discriminatedUnion("component", [
          report,
          Section.describe(REPORT_SECTIONS_DESCRIPTION),
          ...Object.values(others),
        ]),
      )
      .min(1)
      .describe(REPORT_A2UI_COMPONENTS_DESCRIPTION),
  }
}

/** ツールの結果の `_meta` に true で載せると、Claude Code がそこでターンを閉じるキー。 */
const END_TURN_META_KEY = "claude/endTurn"
