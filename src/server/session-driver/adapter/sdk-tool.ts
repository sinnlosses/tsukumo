// tsukumo がプロセス内の MCP サーバとして提供するツール。
// `speak` と `recall` / `recall_episode`、雑談のときの `remember` / `forget`、仕事のときの `report` / `work_plan` / `usage_review_stage` / `usage_review_result`。
// `diary` はここには載らない（会話とは別の使い捨ての問い合わせ。`queryDiary`）。
//
// サーバの名前とツールの名前は `TSUKUMO_MCP_SERVER_NAME` と `*_TOOL_NAME` が持つ（`usage_review_*` だけは見直しの機能が持つ）。

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import { reportSectionSchema } from "../../../shared/report/report-block.ts"
import { reportCheckSchema } from "../../../shared/report/report-check.ts"
import { reportTaskSchema } from "../../../shared/report/report-task.ts"
import { MIN_WORK_PLAN_PHASES, parseWorkPlan } from "../../../shared/session/work-plan.ts"
import {
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  USAGE_REVIEW_STAGES,
} from "../../../shared/usage-review/usage-review.ts"
import { chatRecallEpisodeText, chatRecallListText } from "../../chat/core/chat-memory-prompt.ts"
import { readReportBlockFiles } from "../../report/adapter/report-file.ts"
import type { ReportReview } from "../../report/core/report-review.ts"
import {
  REPORT_CHECKS_DESCRIPTION,
  REPORT_CLOSING_DESCRIPTION,
  REPORT_SECTIONS_DESCRIPTION,
  REPORT_SESSION_SUMMARY_DESCRIPTION,
  REPORT_TASK_DESCRIPTION,
  REPORT_TITLE_DESCRIPTION,
  REPORT_TOOL_DESCRIPTION,
} from "../../report/core/report-tool.ts"
import {
  USAGE_REVIEW_RESULT_TOOL_DESCRIPTION,
  USAGE_REVIEW_RESULT_TOOL_NAME,
  USAGE_REVIEW_STAGE_TOOL_DESCRIPTION,
  USAGE_REVIEW_STAGE_TOOL_NAME,
  type UsageReviewIntake,
  usageProposalKindGuide,
  usageReviewStageGuide,
} from "../../usage-review/core/usage-review-tool.ts"
import type { ChatRecall, PersonaMemory, SessionMode } from "../core/session-driver.ts"
import type { SpeechReview, SpeechVerdict } from "../core/speech-review.ts"
import {
  FORGET_TOOL_NAME,
  RECALL_EPISODE_TOOL_NAME,
  RECALL_TOOL_NAME,
  REMEMBER_TOOL_NAME,
  REPORT_TOOL_NAME,
  SPEAK_TOOL_NAME,
  TSUKUMO_MCP_SERVER_NAME,
  WORK_PLAN_TOOL_NAME,
} from "../core/tsukumo-tool-name.ts"
import {
  WORK_PLAN_CURRENT_DESCRIPTION,
  WORK_PLAN_PHASE_SUMMARY_DESCRIPTION,
  WORK_PLAN_PHASES_DESCRIPTION,
  WORK_PLAN_REJECTION,
  WORK_PLAN_TOOL_DESCRIPTION,
} from "../core/work-plan-tool.ts"

/** モデルに見せる `speak` ツールの説明。セリフと本文の境目はここだけで説明する。 */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想はこのツールで言う。" +
  "`report` を呼ぶターンの締めの一言はここではなく `report` の closing に入れる。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

/**
 * モデルに見せる `remember` ツールの説明。
 * 何を書いてよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには置き場所と形だけを書く（二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。"

/**
 * モデルに見せる `forget` ツールの説明。
 * 何を消してよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには指し方と範囲だけを書く（二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。"

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
 * 例外は `speak`（仕事のときだけ）と `recall` / `recall_episode` と `report` と `work_plan` と見直しの2つ。
 * `speak` が返すのは、新しい事実の無い呼び出しを差し戻す固定の文面だけ。
 * `recall` / `recall_episode` が返すのは、そのセッションが自分で読める外の事実（自分の過去の会話の目次と1件の逐語）だけ。
 * `report` が返すのは差し戻すときの規約違反だけ、`work_plan` が返すのは `parseWorkPlan` が受け付けなかったときの直し方だけ。
 * 見直しの2つが返すのは、利用者が見送った提案の識別子と差し戻しの理由だけ。
 *
 * 常に載るのは `speak` と `recall` / `recall_episode` で、`remember` / `forget` は雑談モードのときだけ載る。
 * 仕事のときに `remember` / `forget` を出すと、作業の文脈が人格に入り込む経路になる。
 *
 * `report` は仕事のときだけ載る（仕事ではレポートを常にこれで受け取る。雑談は本文を書かない決まりなので載せない）。
 * `work_plan` も仕事のときだけ。
 * 見直しの2つも仕事のときだけ（トークン消費の画面から頼むのは仕事の会話への依頼）。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す（`toSessionEvents`）。
 * 受け取り口を1つにしておくと、イベントの流れが1本で済む。
 * `report` と `work_plan` の引数も同じで、handler が引数を読むのは差し戻すかを決めるためだけ。
 * 見直しの2つだけは逆に handler がイベントを流す（検査を通したものだけを状態に入れるため。`createUsageReviewIntake`）。
 */
export function tsukumoServer(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  reportReview: ReportReview,
  speechReview: SpeechReview,
  usageReview: UsageReviewIntake,
  onReportTitle: (title: string) => void,
  cwd: string,
) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      speakTool(expressions, mode, speechReview),
      recallTool(mode.chatRecall),
      recallEpisodeTool(mode.chatRecall),
      ...(mode.kind === "work"
        ? [
            reportTool(expressions, reportReview, onReportTitle, cwd),
            workPlanTool(),
            ...usageReviewTools(usageReview),
          ]
        : []),
      ...(mode.kind === "chat"
        ? [rememberTool(mode.personaMemory), forgetTool(mode.personaMemory)]
        : []),
    ],
  })
}

/** セリフを受け取るツール。差し戻すかは仕事のときだけ `SpeechReview` が決める。 */
function speakTool(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  review: SpeechReview,
) {
  return tool(SPEAK_TOOL_NAME, SPEAK_TOOL_DESCRIPTION, speechShape(expressions), async () => {
    const verdict = mode.kind === "work" ? review.judge() : ACCEPTED_SPEECH
    return verdict.kind === "rejected"
      ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
      : { content: [{ type: "text" as const, text: "ok" }] }
  })
}

const ACCEPTED_SPEECH = { kind: "accepted" } as const satisfies SpeechVerdict

/**
 * レポートを受け取るツール。差し戻しの判定の窓口はここだけ（`ReportReview`）。
 * 通すときの戻り値は "ok" だけ、差し戻すときは規約違反と直し方だけを `isError` 付きで返す（画面の事情は載せない）。
 * 描くか捨てるかはこの `isError` を見て決まる。
 * レポートにする引数（締めのセリフの `closing` も）は、ここではなく `assistant` メッセージの変換が取り出す（`toSessionEvents`）。
 *
 * 通したときだけ結果に `_meta["claude/endTurn"]` を付け、そこでターンを閉じる。
 * 本体はこの結果のあとに assistant を挟まず `result` を返す。この印は transcript には残らない。
 * 差し戻し（`isError`）では閉じず、モデルが直して呼び直す。
 *
 * `title` は差し戻されなかったときだけ `onReportTitle` へ渡す。
 * 差し戻された呼び出しの題を渡すと、規約違反を書いたついでの題が残ってしまう。
 * 実際に書くかどうかの判断（利用者の `/rename` を上書きしないなど）は `decideSessionTitle` が持つので、ここは渡すだけ。
 */
function reportTool(
  expressions: readonly ExpressionChoice[],
  review: ReportReview,
  onReportTitle: (title: string) => void,
  cwd: string,
) {
  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    {
      task: reportTaskSchema.optional().describe(REPORT_TASK_DESCRIPTION),
      conclusion: z.string().describe("結論。レポートの冒頭の1〜2文"),
      sections: z
        .array(reportSectionSchema)
        .min(1)
        .optional()
        .describe(REPORT_SECTIONS_DESCRIPTION),
      favor: z
        .string()
        .optional()
        .describe(
          "利用者へのお願い（判断・作業・情報）が実際にあるときだけ1つ（2件あってもまとめる）。無ければ省く",
        ),
      checks: z.array(reportCheckSchema).optional().describe(REPORT_CHECKS_DESCRIPTION),
      title: z.string().optional().describe(REPORT_TITLE_DESCRIPTION),
      sessionSummary: z.string().optional().describe(REPORT_SESSION_SUMMARY_DESCRIPTION),
      closing: z.object(speechShape(expressions)).describe(REPORT_CLOSING_DESCRIPTION),
    },
    async ({ conclusion, sections, favor, checks, title }) => {
      const fileContents = await readReportBlockFiles(cwd, sections ?? [])
      const verdict = review.judge({
        conclusion,
        sections: sections ?? [],
        favor: favor ?? "",
        checks: checks ?? [],
        fileContents,
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

/** 段取りを受け取るツール。差し戻すかは `parseWorkPlan` で決め、形の検査はここの zod の形。 */
function workPlanTool() {
  return tool(
    WORK_PLAN_TOOL_NAME,
    WORK_PLAN_TOOL_DESCRIPTION,
    {
      phases: z
        .array(z.string().trim().min(1))
        .min(MIN_WORK_PLAN_PHASES)
        .describe(WORK_PLAN_PHASES_DESCRIPTION),
      current: z.number().int().min(0).describe(WORK_PLAN_CURRENT_DESCRIPTION),
      phaseSummary: z.string().optional().describe(WORK_PLAN_PHASE_SUMMARY_DESCRIPTION),
    },
    async (plan) =>
      parseWorkPlan(plan) === undefined
        ? { content: [{ type: "text" as const, text: WORK_PLAN_REJECTION }], isError: true }
        : { content: [{ type: "text" as const, text: "ok" }] },
  )
}

/** ツールの結果の `_meta` に true で載せると、本体がそこでターンを閉じるキー。 */
const END_TURN_META_KEY = "claude/endTurn"

/** 見直しの期間の引数（2つのツールで同じ）。 */
const USAGE_REVIEW_DAYS = z.number().int().positive().describe("見た期間。今日を含む直近何日か")

/**
 * 見直しを受け取る2つのツール（`usage_review_stage` / `usage_review_result`）。
 * 形の検査はここの zod の形で、崩れた引数は handler に届かずに SDK が理由を返す。
 * 形の外の条と、受け付けたときにイベントを流すのは {@link UsageReviewIntake}。
 * 提案の件数の上限を zod に書かないのは、差し戻しの文面を core の1箇所で揃えるため。
 */
function usageReviewTools(intake: UsageReviewIntake) {
  return [
    tool(
      USAGE_REVIEW_STAGE_TOOL_NAME,
      USAGE_REVIEW_STAGE_TOOL_DESCRIPTION,
      {
        stage: z.enum(USAGE_REVIEW_STAGES).describe(usageReviewStageGuide()),
        days: USAGE_REVIEW_DAYS,
      },
      async ({ stage, days }) => ({
        content: [{ type: "text" as const, text: await intake.enterStage(stage, days) }],
      }),
    ),
    tool(
      USAGE_REVIEW_RESULT_TOOL_NAME,
      USAGE_REVIEW_RESULT_TOOL_DESCRIPTION,
      {
        days: USAGE_REVIEW_DAYS,
        headline: z.string().describe("冒頭の一言。キャラクターの口調で、見てきた結果を1〜2文で"),
        proposals: z
          .array(
            z.object({
              kind: z.enum(USAGE_PROPOSAL_KINDS).describe(usageProposalKindGuide()),
              target: z.string().describe("対象の名前（入れ方は kind の説明のとおり。無ければ空）"),
              impact: z
                .enum(USAGE_PROPOSAL_IMPACTS)
                .describe("効きめ。large（大）/ medium（中）/ small（小）"),
              title: z.string().describe("見出し。何を変えるかが分かる短い1行"),
              basis: z.string().describe("根拠。どの数から言っているか（記録の件数つき）"),
              action: z.string().describe("やること。利用者が何をすればよいか"),
              followUp: z
                .enum(USAGE_PROPOSAL_FOLLOW_UPS)
                .describe(
                  "押す口。delegate（tsukumo に頼む。この会話ですぐ変えられる）/ task（タスクにする。あとでやる作業）",
                ),
            }),
          )
          .describe("提案。効きめの大きい順"),
      },
      async (findings) => {
        const verdict = await intake.submit(findings)
        return verdict.kind === "rejected"
          ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
          : { content: [{ type: "text" as const, text: "ok" }] }
      },
    ),
  ]
}

/** 覚えたことを書き足すツール。上限に当たった回も "ok" を返す（受け付けたかどうかをモデルへ戻さない）。 */
function rememberTool(memory: PersonaMemory) {
  return tool(
    REMEMBER_TOOL_NAME,
    REMEMBER_TOOL_DESCRIPTION,
    { line: z.string().describe("覚えること。キャラクター自身についての1行（120文字まで）") },
    async ({ line }) => {
      memory.remember(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/** 覚えた1行を忘れるツール。一致する行が無かった回も "ok" を返す（消せたかどうかをモデルへ戻さない）。 */
function forgetTool(memory: PersonaMemory) {
  return tool(
    FORGET_TOOL_NAME,
    FORGET_TOOL_DESCRIPTION,
    { line: z.string().describe("忘れること。「覚えたこと」に並んでいる1行の文面そのまま") },
    async ({ line }) => {
      memory.forget(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
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

/** セリフの引数の形（`speak` と `report` の `closing` で同じ）。 */
function speechShape(expressions: readonly ExpressionChoice[]) {
  return {
    text: z.string().describe("セリフ。1〜2文の短い一言"),
    expression: z.enum(speakExpressionEnum(expressions)).describe(expressionGuide(expressions)),
  }
}

/**
 * zod の `enum` に渡す表情名。
 * 空にならないことが型の要求なので、`default` を必ず先頭に置く（`expressionChoices` も `default` を必ず含むが、ここで型としても保証しておく）。
 */
function speakExpressionEnum(
  expressions: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...toExpressionNames(expressions).filter((name) => name !== "default")]
}

/**
 * 表情名とラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。
 * ラベルはキャラクターパックの定義から来る。
 */
function expressionGuide(expressions: readonly ExpressionChoice[]): string {
  const guide = speakExpressionEnum(expressions)
    .map((name) => `${name}（${labelOf(expressions, name)}）`)
    .join(" / ")
  return `表情。${guide}`
}

function labelOf(expressions: readonly ExpressionChoice[], name: Expression): string {
  return expressions.find((choice) => choice.name === name)?.label ?? name
}
