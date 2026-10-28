// 仕事のときだけ載る `report` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../shared/report/a2ui-report-catalog.ts"
import type { ReportArgumentField } from "../../../shared/report/report-argument-size.ts"
import { keyFiguresSchema } from "../../../shared/report/report-block-comparison.ts"
import { reportFigureSchema, reportSectionSchema } from "../../../shared/report/report-block.ts"
import { reportCheckSchema } from "../../../shared/report/report-check.ts"
import {
  FIRST_SENTENCE_TARGET,
  FIRST_SENTENCE_TARGET_COMMAS,
  MAX_CONCLUSION_SENTENCES,
  MAX_FIRST_SENTENCE,
} from "../../../shared/report/report-limit.ts"
import { reportRetrospectiveSchema } from "../../../shared/report/report-retrospective.ts"
import { type ReportTask, reportTaskSchema } from "../../../shared/report/report-task.ts"
import type { FigurePreference } from "../../../shared/session/session-default.ts"
import { WORK_PLAN_CLOSINGS } from "../../../shared/session/work-plan.ts"
import type { ReportSchemaVariant } from "../../core/schema-variant.ts"
import { REPORT_TOOL_NAME } from "../../core/tsukumo-tool-name.ts"
import { readReportBlockFiles } from "../../report/adapter/report-file.ts"
import { a2uiStructureFaults } from "../../report/core/a2ui-structure-fault.ts"
import { hasReportField } from "../../report/core/report-inheritance.ts"
import { REPORT_CHANGED_FIELDS_ONLY_TEXT } from "../../report/core/report-rejection.ts"
import {
  REPORT_A2UI_COMPONENTS_DESCRIPTION,
  REPORT_BODY_DESCRIPTION,
  REPORT_CHECKS_DESCRIPTION,
  REPORT_RETROSPECTIVE_DESCRIPTION,
  REPORT_CLOSING_DESCRIPTION,
  reportFigureDescription,
  REPORT_FIGURE_SHORT_TYPE_NOTE,
  REPORT_KEY_FIGURES_DESCRIPTION,
  REPORT_PART_CARD_NOTE,
  REPORT_SECTIONS_DESCRIPTION,
  REPORT_SECTIONS_SHORT_TYPE_HEADING,
  REPORT_SESSION_REMAINING_DESCRIPTION,
  REPORT_SESSION_SUMMARY_DESCRIPTION,
  REPORT_TASK_DESCRIPTION,
  REPORT_TITLE_DESCRIPTION,
  REPORT_TOOL_DESCRIPTION,
  REPORT_WAITING_LINE_DESCRIPTION,
  REPORT_WORK_PLAN_CLOSING_DESCRIPTION,
} from "../../report/core/report-tool.ts"
import { reportShortTypeText } from "../../report/core/short-type-text.ts"
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
 * `short-type` のときは `figure` と `sections` を緩い形で受け、塊の型は `sections` の欄の説明に短い型の表記で載せる。
 * Claude Code はツールの説明文を既定 2048 字で切り、欄の説明は切らない。型の表記をツールの説明文へ移すと切れる。
 * `body-fence` のときは本文を Markdown の `body` で受け、`sections` は緩い形で残す。`body` と `sections` が同じ呼び出しに来たら判定せずに `isError` で返す。
 * 緩い形は SDK の検査を素通りするので、handler が `json-schema` と同じ形で検査し直し、落ちたら判定せずに `isError` で返す。
 * `a2ui` のときは A2UI のカタログの部品の一覧 `components` だけで受ける。
 * 構造の規約に外れた一覧は、判定より先に `CallReview.judgeReportStructure` に渡し、差し戻すなら `VALIDATION_FAILED` の文を `isError` で返す。
 */
export function reportTool(
  expressions: readonly ExpressionChoice[],
  review: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
  reportSchema: ReportSchemaVariant,
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
    const fileContents = await readReportBlockFiles(cwd, report.sections)
    const verdict = review.judgeReport({
      conclusion: report.conclusion,
      conclusionSentenceChars: report.conclusionSentenceChars,
      keyFigures: report.keyFigures,
      figure: report.figure,
      sections: report.sections,
      retrospective: report.retrospective,
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

  if (reportSchema === "json-schema") {
    return tool(
      REPORT_TOOL_NAME,
      REPORT_TOOL_DESCRIPTION,
      reportInputShape(expressions, figurePreference),
      answer,
    )
  }
  if (reportSchema === "a2ui") {
    return tool(
      REPORT_TOOL_NAME,
      REPORT_TOOL_DESCRIPTION,
      a2uiInputShape(expressions),
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
  if (reportSchema === "body-fence") {
    const bodyInput = z.object({
      ...reportInputShape(expressions, figurePreference),
      body: z.string().optional(),
    })
    return tool(
      REPORT_TOOL_NAME,
      REPORT_TOOL_DESCRIPTION,
      bodyFenceInputShape(expressions, figurePreference),
      async (input) => {
        if (input.body !== undefined && input.sections !== undefined) {
          return {
            content: [{ type: "text" as const, text: BODY_AND_SECTIONS_TEXT }],
            isError: true,
          }
        }
        const parsed = bodyInput.safeParse(input)
        return parsed.success
          ? answer(parsed.data)
          : {
              content: [{ type: "text" as const, text: invalidInputText(parsed.error) }],
              isError: true,
            }
      },
    )
  }
  const strictInput = z.object(reportInputShape(expressions, figurePreference))
  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    shortTypeInputShape(expressions, figurePreference),
    async (input) => {
      const parsed = strictInput.safeParse(input)
      return parsed.success
        ? answer(parsed.data)
        : {
            content: [{ type: "text" as const, text: invalidInputText(parsed.error) }],
            isError: true,
          }
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

/** モデルに渡す `report` の引数の形。欄はどれも任意。 */
function reportInputShape(
  expressions: readonly ExpressionChoice[],
  figurePreference: FigurePreference,
) {
  return {
    task: reportTaskSchema.optional().describe(REPORT_TASK_DESCRIPTION),
    workPlanClosing: z
      .enum(WORK_PLAN_CLOSINGS)
      .optional()
      .describe(REPORT_WORK_PLAN_CLOSING_DESCRIPTION),
    conclusion: z
      .array(z.string())
      .optional()
      .describe(
        `結論。レポートの冒頭の文を1要素1文（句点まで）で1〜${String(MAX_CONCLUSION_SENTENCES)}要素。1文目は全角${String(MAX_FIRST_SENTENCE)}字以内（目安は${String(FIRST_SENTENCE_TARGET)}字、読点は${String(FIRST_SENTENCE_TARGET_COMMAS)}つまで）。悪い例: 「設定の読み込みを共通化し、型を整理し、テストも足して、起動の流れを書き換えた」（変更の列挙）。良い例: 「次から設定の書き間違いが起動時に分かる」（読み手から見た変化）。2文目は「それで何が良いか」か「変えていないもの」。例: ["…分かる。", "読み方は変えていない。"]`,
      ),
    keyFigures: keyFiguresSchema.optional().describe(REPORT_KEY_FIGURES_DESCRIPTION),
    figure: reportFigureSchema.optional().describe(reportFigureDescription(figurePreference)),
    sections: z.array(reportSectionSchema).min(1).optional().describe(REPORT_SECTIONS_DESCRIPTION),
    retrospective: reportRetrospectiveSchema.optional().describe(REPORT_RETROSPECTIVE_DESCRIPTION),
    favor: z
      .string()
      .optional()
      .describe(
        "作業を終えた・止めたあとに残る利用者へのお願い（判断・作業・情報）が実際にあるときだけ1つ（2件あってもまとめる）。無ければ省く",
      ),
    checks: z.array(reportCheckSchema).optional().describe(REPORT_CHECKS_DESCRIPTION),
    title: z.string().optional().describe(REPORT_TITLE_DESCRIPTION),
    sessionSummary: z.string().optional().describe(REPORT_SESSION_SUMMARY_DESCRIPTION),
    sessionRemaining: z.string().optional().describe(REPORT_SESSION_REMAINING_DESCRIPTION),
    closing: z.object(speechShape(expressions)).optional().describe(REPORT_CLOSING_DESCRIPTION),
    waitingLine: z
      .object(speechShape(expressions))
      .optional()
      .describe(REPORT_WAITING_LINE_DESCRIPTION),
  }
}

/** `short-type` のときモデルに渡す引数の形。`figure`・`sections`・`retrospective` の塊だけを緩い形にし、ほかの欄と説明は `json-schema` と同じ。 */
function shortTypeInputShape(
  expressions: readonly ExpressionChoice[],
  figurePreference: FigurePreference,
) {
  return {
    ...reportInputShape(expressions, figurePreference),
    retrospective: reportRetrospectiveSchema
      .extend({
        blocks: z
          .array(LOOSE_OBJECT)
          .optional()
          .describe("結果の根拠に図・表・コードが要るときだけ。ReportSection の blocks と同じ部品"),
      })
      .optional()
      .describe(REPORT_RETROSPECTIVE_DESCRIPTION),
    figure: LOOSE_OBJECT.optional().describe(
      `${reportFigureDescription(figurePreference)}${REPORT_FIGURE_SHORT_TYPE_NOTE}`,
    ),
    sections: z
      .array(LOOSE_OBJECT)
      .optional()
      .describe(
        `${REPORT_SECTIONS_DESCRIPTION}\n${REPORT_SECTIONS_SHORT_TYPE_HEADING}\n${reportShortTypeText()}`,
      ),
  }
}

/**
 * `body-fence` のときモデルに渡す引数の形。本文は `body` で受け、旧い `sections` は緩い形で残す。
 * `figure`・`retrospective` は `short-type` と同じ緩い形で、塊の型の表記は `figure` の説明に1回だけ載せる。
 */
function bodyFenceInputShape(
  expressions: readonly ExpressionChoice[],
  figurePreference: FigurePreference,
) {
  return {
    ...shortTypeInputShape(expressions, figurePreference),
    figure: LOOSE_OBJECT.optional().describe(
      `${reportFigureDescription(figurePreference)}${REPORT_PART_CARD_NOTE}`,
    ),
    sections: z
      .array(LOOSE_OBJECT)
      .optional()
      .describe(
        `旧い本文の形。body と同じ呼び出しに併記できない。body のフェンスで書けない部品（options・compare・matrix・svg・stats・timeline・beforeAfter・chart・plot）を使うときは、body を渡さず本文全体をこちらの節の blocks で書く。${REPORT_PART_CARD_NOTE}`,
      ),
    body: z.string().optional().describe(REPORT_BODY_DESCRIPTION),
  }
}

/** `a2ui` のときモデルに渡す引数の形。`Report` の締めのセリフと待ちの一言だけ、表情を選べる名前に絞る。 */
function a2uiInputShape(expressions: readonly ExpressionChoice[]) {
  const { Report, ...others } = REPORT_COMPONENT_SCHEMAS
  const report = Report.extend({
    closing: z.object(speechShape(expressions)).optional(),
    waitingLine: z.object(speechShape(expressions)).optional(),
  })
  return {
    components: z
      .array(z.discriminatedUnion("component", [report, ...Object.values(others)]))
      .min(1)
      .describe(REPORT_A2UI_COMPONENTS_DESCRIPTION),
  }
}

/** `body` と `sections` が同じ呼び出しに来たときの戻り値。 */
const BODY_AND_SECTIONS_TEXT =
  `Input validation error: ${REPORT_TOOL_NAME} の body と sections は同じ呼び出しに併記できない。` +
  "どちらか一方だけを渡して呼び直す"

const LOOSE_OBJECT = z.record(z.string(), z.unknown())

/** handler の検査で落ちたときの戻り値。SDK が自分の検査で落としたときと同じ書き出しにする。 */
function invalidInputText(error: z.ZodError): string {
  return `Input validation error: Invalid arguments for tool ${REPORT_TOOL_NAME}: ${error.message}`
}

/** ツールの結果の `_meta` に true で載せると、Claude Code がそこでターンを閉じるキー。 */
const END_TURN_META_KEY = "claude/endTurn"
