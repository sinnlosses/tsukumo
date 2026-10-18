// 仕事のときだけ載る `report` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import {
  reportFigureSchema,
  type ReportSection,
  reportSectionSchema,
  sectionsWithFigure,
} from "../../../shared/report/report-block.ts"
import { reportCheckSchema } from "../../../shared/report/report-check.ts"
import {
  FIRST_SENTENCE_TARGET,
  FIRST_SENTENCE_TARGET_COMMAS,
  MAX_CONCLUSION_SENTENCES,
  MAX_FIRST_SENTENCE,
} from "../../../shared/report/report-limit.ts"
import { reportRetrospectiveSchema } from "../../../shared/report/report-retrospective.ts"
import { parseReportTask, reportTaskSchema } from "../../../shared/report/report-task.ts"
import { parseWorkPlanClosing, WORK_PLAN_CLOSINGS } from "../../../shared/session/work-plan.ts"
import { readReportBlockFiles } from "../../report/adapter/report-file.ts"
import { checkMermaidSyntax } from "../../report/adapter/report-mermaid-syntax.ts"
import { mermaidSourcesInSections } from "../../report/core/report-figure-fault.ts"
import {
  REPORT_CHECKS_DESCRIPTION,
  REPORT_RETROSPECTIVE_DESCRIPTION,
  REPORT_CLOSING_DESCRIPTION,
  REPORT_FIGURE_DESCRIPTION,
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
import { REPORT_TOOL_NAME } from "../core/tsukumo-tool-name.ts"
import { speechShape } from "./sdk-speech-tool.ts"

/**
 * レポートを受け取るツール。差し戻しの判定の窓口はここだけ（`CallReview.judgeReport`）。
 * 通すときの戻り値は "ok" だけ、差し戻すときは規約違反と直し方だけを `isError` 付きで返す（画面の事情は載せない）。
 * 描くか捨てるかはこの `isError` を見て決まる。
 * レポートにする引数（締めのセリフの `closing` も）は、ここではなく `assistant` メッセージの変換が取り出す（`toSessionEvents`）。
 *
 * 通したときだけ結果に `_meta["claude/endTurn"]` を付け、そこでターンを閉じる。
 * Claude Code はこの結果のあとに assistant を挟まず `result` を返す。この印は transcript には残らない。
 * 差し戻し（`isError`）では閉じず、モデルが直して呼び直す。
 *
 * `title` は差し戻されなかったときだけ `onReportTitle` へ渡す。
 * 差し戻された呼び出しの題を渡すと、規約違反を書いたついでの題が残ってしまう。
 * 実際に書くかどうかの判断（利用者の `/rename` を上書きしないなど）は `decideSessionTitle` が持つので、ここは渡すだけ。
 */
export function reportTool(
  expressions: readonly ExpressionChoice[],
  review: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
) {
  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    {
      task: reportTaskSchema.optional().describe(REPORT_TASK_DESCRIPTION),
      workPlanClosing: z
        .enum(WORK_PLAN_CLOSINGS)
        .optional()
        .describe(REPORT_WORK_PLAN_CLOSING_DESCRIPTION),
      conclusion: z
        .string()
        .describe(
          `結論。レポートの冒頭の1〜${String(MAX_CONCLUSION_SENTENCES)}文。1文目は全角${String(MAX_FIRST_SENTENCE)}字以内（目安は${String(FIRST_SENTENCE_TARGET)}字、読点は${String(FIRST_SENTENCE_TARGET_COMMAS)}つまで）。悪い例: 「設定の読み込みを共通化し、型を整理し、テストも足して、起動の流れを書き換えた」（変更の列挙）。良い例: 「次から設定の書き間違いが起動時に分かる」（読み手から見た変化）。2文目は「それで何が良いか」か「変えていないもの」。例: 「…分かる。読み方は変えていない」`,
        ),
      figure: reportFigureSchema.describe(REPORT_FIGURE_DESCRIPTION),
      sections: z
        .array(reportSectionSchema)
        .min(1)
        .optional()
        .describe(REPORT_SECTIONS_DESCRIPTION),
      retrospective: reportRetrospectiveSchema
        .optional()
        .describe(REPORT_RETROSPECTIVE_DESCRIPTION),
      favor: z
        .string()
        .optional()
        .describe(
          "作業を終えた・止めたあとに残る利用者へのお願い（判断・作業・情報）が実際にあるときだけ1つ（2件あってもまとめる）。無ければ省く",
        ),
      checks: z.array(reportCheckSchema).optional().describe(REPORT_CHECKS_DESCRIPTION),
      title: z.string().optional().describe(REPORT_TITLE_DESCRIPTION),
      sessionSummary: z.string().describe(REPORT_SESSION_SUMMARY_DESCRIPTION),
      sessionRemaining: z.string().describe(REPORT_SESSION_REMAINING_DESCRIPTION),
      closing: z.object(speechShape(expressions)).describe(REPORT_CLOSING_DESCRIPTION),
      waitingLine: z.object(speechShape(expressions)).describe(REPORT_WAITING_LINE_DESCRIPTION),
    },
    async ({ task, workPlanClosing, conclusion, figure, sections, favor, checks, title }) => {
      const taggedSections = (sections ?? []).map((section): ReportSection => ({
        ...section,
        shapeTag: section.shapeTag ?? "unspecified",
      }))
      const fileContents = await readReportBlockFiles(cwd, taggedSections)
      const mermaidFaults = await checkMermaidSyntax(
        mermaidSourcesInSections(sectionsWithFigure(figure, taggedSections)),
      )
      const verdict = review.judgeReport({
        conclusion,
        figure,
        sections: taggedSections,
        favor: favor ?? "",
        checks: checks ?? [],
        fileContents,
        mermaidFaults,
        task: parseReportTask(task),
        workPlanClosing: parseWorkPlanClosing(workPlanClosing),
      })
      if (verdict.kind === "rejected") {
        return { content: [{ type: "text" as const, text: verdict.text }], isError: true }
      }
      if (title !== undefined) {
        onReportTitle(title)
      }
      return {
        content: [{ type: "text" as const, text: "ok" }],
        _meta: { [END_TURN_META_KEY]: true },
      }
    },
  )
}

/** ツールの結果の `_meta` に true で載せると、Claude Code がそこでターンを閉じるキー。 */
const END_TURN_META_KEY = "claude/endTurn"
