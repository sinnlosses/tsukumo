// 仕事のときだけ載る `work_plan` / `phase_result` / `question_brief` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type QuestionBrief,
  questionBriefSchema,
} from "../../../shared/session-driver/question-brief.ts"
import { phaseResultShape } from "../../../shared/session/phase-result.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { workPlanShape } from "../../../shared/session/work-plan.ts"
import {
  PHASE_RESULT_TOOL_NAME,
  QUESTION_BRIEF_TOOL_NAME,
  WORK_PLAN_TOOL_NAME,
} from "../../core/tsukumo-tool-name.ts"
import {
  answerQuestionBriefCall,
  mermaidSourcesOf,
  QUESTION_BRIEF_TOOL_DESCRIPTION,
} from "../../question/core/question-brief.ts"
import { checkMermaidSyntax } from "../../report/adapter/report-mermaid-syntax.ts"
import {
  answerPhaseResultCall,
  PHASE_RESULT_COUNT_DESCRIPTION,
  PHASE_RESULT_OUTCOME_DESCRIPTION,
  PHASE_RESULT_PHASE_DESCRIPTION,
  PHASE_RESULT_REASON_DESCRIPTION,
  PHASE_RESULT_TOOL_DESCRIPTION,
} from "../../work-plan/core/phase-result-tool.ts"
import {
  answerWorkPlanCall,
  WORK_PLAN_CURRENT_DESCRIPTION,
  WORK_PLAN_DELEGATED_RANGE_DESCRIPTION,
  WORK_PLAN_FINISHED_IN_GROUP_DESCRIPTION,
  WORK_PLAN_PHASE_SUMMARY_DESCRIPTION,
  WORK_PLAN_PHASES_DESCRIPTION,
  WORK_PLAN_SKIPPED_PHASES_DESCRIPTION,
  WORK_PLAN_TOOL_DESCRIPTION,
} from "../../work-plan/core/work-plan-tool.ts"
import type { CallReview } from "../core/call-review.ts"

/**
 * ワークプランを受け取るツール。引数の形は shared の `workPlanShape` に説明文を足したもの。
 * 欄をまたぐ検査は `workPlanSchema` にあり、`answerWorkPlanCall` の判定が同じ `parseWorkPlan` で行って差し戻す。
 */
export function workPlanTool(review: CallReview) {
  return tool(
    WORK_PLAN_TOOL_NAME,
    WORK_PLAN_TOOL_DESCRIPTION,
    {
      phases: workPlanShape.phases.describe(WORK_PLAN_PHASES_DESCRIPTION),
      current: workPlanShape.current.describe(WORK_PLAN_CURRENT_DESCRIPTION),
      finishedInGroup: workPlanShape.finishedInGroup.describe(
        WORK_PLAN_FINISHED_IN_GROUP_DESCRIPTION,
      ),
      phaseSummary: workPlanShape.phaseSummary.describe(WORK_PLAN_PHASE_SUMMARY_DESCRIPTION),
      delegatedRange: workPlanShape.delegatedRange.describe(WORK_PLAN_DELEGATED_RANGE_DESCRIPTION),
      skippedPhases: workPlanShape.skippedPhases.describe(WORK_PLAN_SKIPPED_PHASES_DESCRIPTION),
    },
    async (input) => {
      const answer = answerWorkPlanCall(review, input)
      return {
        content: [{ type: "text" as const, text: answer.text }],
        isError: answer.isError,
      }
    },
  )
}

/**
 * 委譲先が段の結果を返すツール。引数の形は shared の `phaseResultShape` に説明文を足したもの。
 * 欄をまたぐ検査は `phaseResultSchema` にあり、`answerPhaseResultCall` の判定が同じ `parsePhaseResult` で行って差し戻す。
 * メインの呼び出しは `PreToolUse` のフックが拒むので、ここでは見分けない。
 */
export function phaseResultTool(review: CallReview, onEvent: (event: SessionEvent) => void) {
  return tool(
    PHASE_RESULT_TOOL_NAME,
    PHASE_RESULT_TOOL_DESCRIPTION,
    {
      phase: phaseResultShape.phase.describe(PHASE_RESULT_PHASE_DESCRIPTION),
      count: phaseResultShape.count.describe(PHASE_RESULT_COUNT_DESCRIPTION),
      outcome: phaseResultShape.outcome.describe(PHASE_RESULT_OUTCOME_DESCRIPTION),
      reason: phaseResultShape.reason.describe(PHASE_RESULT_REASON_DESCRIPTION),
    },
    async (input) => {
      const answer = answerPhaseResultCall(review, input, onEvent)
      return {
        content: [{ type: "text" as const, text: answer.text }],
        isError: answer.isError,
      }
    },
  )
}

/** 質問の添え書きを受け取るツール。形の外の検査と預け先への受け渡しは `answerQuestionBriefCall`。 */
export function questionBriefTool(holdBrief: (briefs: readonly QuestionBrief[]) => void) {
  return tool(
    QUESTION_BRIEF_TOOL_NAME,
    QUESTION_BRIEF_TOOL_DESCRIPTION,
    {
      questions: z
        .array(questionBriefSchema)
        .describe("次の AskUserQuestion の質問ごとの添え書き。1〜4件"),
    },
    async ({ questions }) => {
      const mermaidFaults = await checkMermaidSyntax(mermaidSourcesOf(questions))
      const answer = answerQuestionBriefCall(questions, mermaidFaults, holdBrief)
      return {
        content: [{ type: "text" as const, text: answer.text }],
        isError: answer.isError,
      }
    },
  )
}
