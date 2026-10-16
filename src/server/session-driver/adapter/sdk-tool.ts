// tsukumo がプロセス内の MCP サーバとして提供するツール。
// `speak` と `recall` / `recall_episode`、雑談のときの `remember` / `forget`、仕事のときの `report` / `work_plan` / `question_brief` / `clear_and_send`。
// `diary` と `usage_review_*` はここには載らない（どちらも会話とは別の使い捨ての問い合わせ。`queryDiary` / `queryUsageReview`）。
//
// サーバの名前とツールの名前は `TSUKUMO_MCP_SERVER_NAME` と `*_TOOL_NAME` が持つ。

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionEnumForSpeak,
  expressionGuideForSpeak,
} from "../../../shared/character-pack/expression-choice.ts"
import {
  reportFigureSchema,
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
import { parseReportTask, reportTaskSchema } from "../../../shared/report/report-task.ts"
import {
  type QuestionBrief,
  questionBriefSchema,
} from "../../../shared/session-driver/question-brief.ts"
import { phaseResultShape } from "../../../shared/session/phase-result.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  parseWorkPlanClosing,
  WORK_PLAN_CLOSINGS,
  workPlanShape,
} from "../../../shared/session/work-plan.ts"
import { chatRecallEpisodeText, chatRecallListText } from "../../chat/core/chat-memory-prompt.ts"
import { readReportBlockFiles } from "../../report/adapter/report-file.ts"
import { checkMermaidSyntax } from "../../report/adapter/report-mermaid-syntax.ts"
import { mermaidSourcesInSections } from "../../report/core/report-figure-fault.ts"
import {
  REPORT_CHECKS_DESCRIPTION,
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
import { CLEAR_AND_SEND_TOOL_DESCRIPTION } from "../core/clear-and-send.ts"
import {
  forgetReply,
  type PersonaMemoryReply,
  rememberReply,
} from "../core/persona-memory-reply.ts"
import {
  answerPhaseResultCall,
  PHASE_RESULT_COUNT_DESCRIPTION,
  PHASE_RESULT_OUTCOME_DESCRIPTION,
  PHASE_RESULT_PHASE_DESCRIPTION,
  PHASE_RESULT_REASON_DESCRIPTION,
  PHASE_RESULT_TOOL_DESCRIPTION,
} from "../core/phase-result-tool.ts"
import {
  answerQuestionBriefCall,
  mermaidSourcesOf,
  QUESTION_BRIEF_TOOL_DESCRIPTION,
} from "../core/question-brief.ts"
import type { ChatRecall, PersonaMemory, SessionMode } from "../core/session-driver.ts"
import type { SpeechVerdict } from "../core/speech-review.ts"
import {
  CLEAR_AND_SEND_TOOL_NAME,
  FORGET_TOOL_NAME,
  PHASE_RESULT_TOOL_NAME,
  QUESTION_BRIEF_TOOL_NAME,
  RECALL_EPISODE_TOOL_NAME,
  RECALL_TOOL_NAME,
  REMEMBER_TOOL_NAME,
  REPORT_TOOL_NAME,
  SPEAK_TOOL_NAME,
  TSUKUMO_MCP_SERVER_NAME,
  WORK_PLAN_TOOL_NAME,
} from "../core/tsukumo-tool-name.ts"
import {
  answerWorkPlanCall,
  WORK_PLAN_CURRENT_DESCRIPTION,
  WORK_PLAN_DELEGATED_RANGE_DESCRIPTION,
  WORK_PLAN_FINISHED_IN_GROUP_DESCRIPTION,
  WORK_PLAN_PHASE_SUMMARY_DESCRIPTION,
  WORK_PLAN_PHASES_DESCRIPTION,
  WORK_PLAN_SKIPPED_PHASES_DESCRIPTION,
  WORK_PLAN_TOOL_DESCRIPTION,
} from "../core/work-plan-tool.ts"

/** モデルに見せる `speak` ツールの説明。セリフと本文の境目はここだけで説明する。 */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想はこのツールで言う。" +
  "`report` を呼ぶターンの締めの一言はここではなく `report` の closing に入れる。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。" +
  "委譲先の段を番号で言うセリフでは、その番号を `phase` で申告する。"

/** モデルに見せる `speak` の `phase` 引数の説明。 */
const SPEAK_PHASE_DESCRIPTION =
  "セリフが委譲先の段を番号で言うとき（「段2が返った」など）、その段の番号（1から委譲先の段の数まで。`phase_result` の `phase` と同じ数え方）。" +
  "委譲の範囲があるあいだ、範囲の外の番号は差し戻される。" +
  "段を番号で言わないセリフと、計画・受け入れのような範囲の外の段（名前で言う）では省く"

/**
 * モデルに見せる `remember` ツールの説明。
 * 何を書いてよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには置き場所と形だけを書く（二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。" +
  "この依頼のあいだに tsukumo の外のツール（Read・Bash・Web・他の MCP など）を使ったときと、同じ文面をもう覚えているときは書かれず、エラーが返る。"

/**
 * モデルに見せる `forget` ツールの説明。
 * 何を消してよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには指し方と範囲だけを書く（二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。" +
  "一致する行が無ければ何も消えず、エラーが返る。"

/**
 * モデルに見せる `recall` ツールの説明。
 * 雑談でいつ引くかの条は `CHAT_MANNER_PROMPT` が持つので、ここには何が返るかと引ける回数だけを書く。
 */
const RECALL_TOOL_DESCRIPTION =
  "前の話を思い出せないときに、言葉でエピソード索引を引き、当たった候補の一覧（id・見出し・要旨）を返す。逐語は返らない。" +
  "1件を開くには recall_episode を使う。当たらなければ候補は無い。引けるのは1ターンに2回まで。"

/**
 * モデルに見せる `recall_episode` ツールの説明。
 * 雑談でいつ開くかの条は `CHAT_MANNER_PROMPT` が持つので、ここには何が返るかと開ける回数だけを書く。
 */
const RECALL_EPISODE_TOOL_DESCRIPTION =
  "recall で見た候補の id を渡し、その1件の範囲の会話をそのままの文面で開く。" +
  "知らない id なら何も返らない。開けるのは1ターンに2件まで。"

/**
 * プロセス内の MCP サーバ。
 * 戻り値は既定が "ok" だけで、tsukumo の内部の状態や画面の事情がモデルへ戻る経路を作らない（`docs/architecture/adr/0009-speech-via-tool.md`）。
 * 例外は `speak`（仕事のときだけ）と `recall` / `recall_episode` と `report` と `work_plan` と `phase_result` と `question_brief` と `remember` / `forget`。
 * `remember` / `forget` が返すのは、書けなかった・消せなかった理由の固定の文面だけ（`rememberReply` / `forgetReply`）。
 * `remember` は `allowsRemember` が偽のあいだ口を呼ばずに断る（外部由来の印）。
 * `phase_result` が返すのは、帯の今の段（帯を動かさなかったらそのこと）か、形の崩れの直し方だけ。
 * `speak` が返すのは、新しい事実の無い呼び出しと範囲の外の `phase` を差し戻す固定の文面だけ。
 * `recall` / `recall_episode` が返すのは、そのセッションが自分で読める外の事実（自分の過去の会話の目次と1件の逐語）だけ。
 * `report` が返すのは差し戻すときの規約違反だけ、`work_plan` が返すのは `CallReview` が受け付けなかったときの直し方だけ。
 *
 * 常に載るのは `speak` と `recall` / `recall_episode` で、`remember` / `forget` は雑談モードのときだけ載る。
 * 仕事のときに `remember` / `forget` を出すと、作業の文脈が人格に入り込む経路になる。
 *
 * `report` は仕事のときだけ載る（仕事ではレポートを常にこれで受け取る。雑談は本文を書かない決まりなので載せない）。
 * `work_plan` も仕事のときだけ。
 * `phase_result` も仕事のときだけで、帯を動かす口は変換ではなく handler（帯を動かしたら `delegate-returned` を流す）。
 * 変換は委譲先の呼び出しから、次の返却の1行目を読まない印だけを作る。
 * `question_brief` も仕事のときだけで、返すのは崩れた添え書きの直し方だけ。受け付けた添え書きは `holdBrief` に預ける。
 * `clear_and_send` も仕事のときだけで、返すのは "ok" だけ。渡された文面は `holdClearAndSend` に預ける。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す（`toSessionEvents`）。
 * 受け取り口を1つにしておくと、イベントの流れが1本で済む。
 * `report` と `work_plan` の引数も同じで、handler が引数を読むのは差し戻すかと返す文を決めるためだけ。
 * `report` の差し戻しだけは `report-rejected` を流す（差し戻した呼び出しは変換のあとに捨てられ、記録の口が無いため）。
 */
export function tsukumoServer(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  callReview: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
  onEvent: (event: SessionEvent) => void,
  holdBrief: (briefs: readonly QuestionBrief[]) => void,
  holdClearAndSend: (text: string) => void,
  allowsRemember: () => boolean,
) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      speakTool(expressions, mode, callReview),
      recallTool(mode.chatRecall),
      recallEpisodeTool(mode.chatRecall),
      ...(mode.kind === "work"
        ? [
            reportTool(expressions, callReview, onReportTitle, cwd, onEvent),
            workPlanTool(callReview),
            phaseResultTool(callReview, onEvent),
            questionBriefTool(holdBrief),
            clearAndSendTool(holdClearAndSend),
          ]
        : []),
      ...(mode.kind === "chat"
        ? [rememberTool(mode.personaMemory, allowsRemember), forgetTool(mode.personaMemory)]
        : []),
    ],
  })
}

/** セリフを受け取るツール。差し戻すかは仕事のときだけ `CallReview` が決める。 */
function speakTool(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  review: CallReview,
) {
  return tool(
    SPEAK_TOOL_NAME,
    SPEAK_TOOL_DESCRIPTION,
    {
      ...speechShape(expressions),
      // 0 や負の数も形では通し、範囲の検査の差し戻しで直し方を返す。
      phase: z.number().int().optional().describe(SPEAK_PHASE_DESCRIPTION),
    },
    async ({ phase }) => {
      const mention =
        mode.kind === "work" && phase !== undefined
          ? review.judgePhaseMention(phase)
          : ACCEPTED_SPEECH
      const verdict = mode.kind === "work" ? review.judgeSpeak() : ACCEPTED_SPEECH
      const rejection = mention.kind === "rejected" ? mention : verdict
      return rejection.kind === "rejected"
        ? { content: [{ type: "text" as const, text: rejection.text }], isError: true }
        : { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

const ACCEPTED_SPEECH = { kind: "accepted" } as const satisfies SpeechVerdict

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
function reportTool(
  expressions: readonly ExpressionChoice[],
  review: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
  onEvent: (event: SessionEvent) => void,
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
          `結論。レポートの冒頭の1〜${String(MAX_CONCLUSION_SENTENCES)}文。1文目は全角${String(MAX_FIRST_SENTENCE)}字以内（目安は${String(FIRST_SENTENCE_TARGET)}字、読点は${String(FIRST_SENTENCE_TARGET_COMMAS)}つまで）。悪い例: 「設定の読み込みを共通化し、型を整理し、テストも足して、起動の流れを書き換えた」（変更の列挙）。良い例: 「次から設定の書き間違いが起動時に分かる」（読み手から見た変化）`,
        ),
      figure: reportFigureSchema.describe(REPORT_FIGURE_DESCRIPTION),
      sections: z
        .array(reportSectionSchema)
        .min(1)
        .optional()
        .describe(REPORT_SECTIONS_DESCRIPTION),
      favor: z
        .string()
        .optional()
        .describe(
          "作業を終えた・止めたあとに残る利用者へのお願い（判断・作業・情報）が実際にあるときだけ1つ（2件あってもまとめる）。無ければ省く。作業の途中で利用者の手が要るときは report を呼ばず AskUserQuestion で聞く",
        ),
      checks: z.array(reportCheckSchema).optional().describe(REPORT_CHECKS_DESCRIPTION),
      title: z.string().optional().describe(REPORT_TITLE_DESCRIPTION),
      sessionSummary: z.string().describe(REPORT_SESSION_SUMMARY_DESCRIPTION),
      sessionRemaining: z.string().describe(REPORT_SESSION_REMAINING_DESCRIPTION),
      closing: z.object(speechShape(expressions)).describe(REPORT_CLOSING_DESCRIPTION),
      waitingLine: z.object(speechShape(expressions)).describe(REPORT_WAITING_LINE_DESCRIPTION),
    },
    async ({ task, workPlanClosing, conclusion, figure, sections, favor, checks, title }) => {
      const fileContents = await readReportBlockFiles(cwd, sections ?? [])
      const mermaidFaults = await checkMermaidSyntax(
        mermaidSourcesInSections(sectionsWithFigure(figure, sections ?? [])),
      )
      const changedFiles = await review.changedFiles()
      const verdict = review.judgeReport(
        {
          conclusion,
          figure,
          sections: sections ?? [],
          favor: favor ?? "",
          checks: checks ?? [],
          fileContents,
          mermaidFaults,
          task: parseReportTask(task),
          workPlanClosing: parseWorkPlanClosing(workPlanClosing),
        },
        changedFiles,
      )
      if (verdict.kind === "rejected") {
        onEvent({ kind: "report-rejected", reasons: verdict.reasons })
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

/**
 * 段取りを受け取るツール。引数の形は shared の `workPlanShape` に説明文を足したもの。
 * 欄をまたぐ検査は `workPlanSchema` にあり、`answerWorkPlanCall` の判定が同じ `parseWorkPlan` で行って差し戻す。
 */
function workPlanTool(review: CallReview) {
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
function phaseResultTool(review: CallReview, onEvent: (event: SessionEvent) => void) {
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
function questionBriefTool(holdBrief: (briefs: readonly QuestionBrief[]) => void) {
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

function clearAndSendTool(hold: (text: string) => void) {
  return tool(
    CLEAR_AND_SEND_TOOL_NAME,
    CLEAR_AND_SEND_TOOL_DESCRIPTION,
    { text: z.string().trim().min(1).describe("文脈を空にしたあと、最初の依頼として送る文面") },
    async ({ text }) => {
      hold(text)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/** ツールの結果の `_meta` に true で載せると、Claude Code がそこでターンを閉じるキー。 */
const END_TURN_META_KEY = "claude/endTurn"

/** 覚えたことを書き足すツール。書けたら "ok"、書けなかったら理由の固定文を `isError` で返す。 */
function rememberTool(memory: PersonaMemory, allowsRemember: () => boolean) {
  return tool(
    REMEMBER_TOOL_NAME,
    REMEMBER_TOOL_DESCRIPTION,
    { line: z.string().describe("覚えること。キャラクター自身についての1行（120文字まで）") },
    async ({ line }) =>
      personaMemoryToolResult(
        rememberReply(allowsRemember() ? memory.remember(line) : "external-tool"),
      ),
  )
}

/** 覚えた1行を忘れるツール。消せたら "ok"、消せなかったら理由の固定文を `isError` で返す。 */
function forgetTool(memory: PersonaMemory) {
  return tool(
    FORGET_TOOL_NAME,
    FORGET_TOOL_DESCRIPTION,
    { line: z.string().describe("忘れること。「覚えたこと」に並んでいる1行の文面そのまま") },
    async ({ line }) => personaMemoryToolResult(forgetReply(memory.forget(line))),
  )
}

function personaMemoryToolResult(reply: PersonaMemoryReply) {
  return { content: [{ type: "text" as const, text: reply.text }], isError: reply.isError }
}

/**
 * 索引を引いて古い会話の候補を見るツール。
 * 返すのはその会話自身の過去の目次（`id`・見出し・要旨）だけで、tsukumo の状態も画面の事情も載せない。
 * 文面に組み立てるのは core（`chatRecallListText`）で、採点・1ターンの回数の縛りは `createChatRecall`。
 */
function recallTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_TOOL_NAME,
    RECALL_TOOL_DESCRIPTION,
    { keyword: z.string().describe("引く言葉。語を空白で区切ると、どれかに当たった候補が返る") },
    async ({ keyword }) => ({
      content: [
        { type: "text" as const, text: chatRecallListText(chatRecall.recallList(keyword)) },
      ],
    }),
  )
}

/**
 * `recall` で見た候補を1件開くツール。返すのは開いた1件の範囲の逐語だけ。
 * 文面に組み立てるのは core（`chatRecallEpisodeText`）で、1ターンの回数の縛りは `createChatRecall`。
 */
function recallEpisodeTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_EPISODE_TOOL_NAME,
    RECALL_EPISODE_TOOL_DESCRIPTION,
    { id: z.string().describe("recall の一覧で見た候補の id") },
    async ({ id }) => ({
      content: [
        { type: "text" as const, text: chatRecallEpisodeText(chatRecall.recallEpisode(id)) },
      ],
    }),
  )
}

/** セリフの引数の形（`speak` と `report` の `closing`・`waitingLine` で同じ）。 */
function speechShape(expressions: readonly ExpressionChoice[]) {
  return {
    text: z.string().describe("セリフ。1〜2文の短い一言"),
    expression: z
      .enum(expressionEnumForSpeak(expressions))
      .describe(expressionGuideForSpeak(expressions)),
  }
}
