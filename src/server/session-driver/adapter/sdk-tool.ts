// tsukumo がプロセス内の MCP サーバとして提供するツール（`speak`、`remember` /
// `forget` / `recall` / `recall_episode`、仕事のときの `report` / `usage_review_stage` /
// `usage_review_result`）。組み立てたサーバは駆動（src/server/session-driver/adapter/sdk-driver.ts）が
// `query()` の `mcpServers` へ渡す。`diary` はここには載らない（会話とは別の使い捨ての問い合わせ。
// `src/server/diary/adapter/sdk-diary.ts`）。
//
// サーバの名前と `speak` の名前は src/server/session-driver/core/sdk-message.ts が持つ（届いた `assistant`
// メッセージから `speak` の呼び出しを見分ける側が core にあるため）。

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../../../shared/expression-choice.ts"
import { type Expression } from "../../../shared/expression.ts"
import { reportCheckSchema } from "../../../shared/report-check.ts"
import {
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  USAGE_REVIEW_STAGES,
} from "../../../shared/usage-review.ts"
import { chatRecallEpisodeText, chatRecallListText } from "../../chat/core/chat-memory-prompt.ts"
import { type ReportReview } from "../../report/core/report-review.ts"
import {
  REPORT_CHECKS_DESCRIPTION,
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
import { REPORT_TOOL_NAME, SPEAK_TOOL_NAME, TSUKUMO_MCP_SERVER_NAME } from "../core/sdk-message.ts"
import { type ChatRecall, type PersonaMemory, type SessionMode } from "../core/session-driver.ts"

/** モデルに見せる `speak` ツールの説明。**セリフと本文の境目はここだけで説明する。** */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想・完了報告はこのツールで言う。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

/** 覚えたことを書き足すツールの名前（docs/glossary.md「remember ツール」）。 */
const REMEMBER_TOOL_NAME = "remember"

/**
 * モデルに見せる `remember` ツールの説明。**何を書いてよいかの条は
 * `src/server/chat/core/chat-manner.ts` が持つ**ので、ここには置き場所と形だけを書く
 * （二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。"

/** 覚えた1行を忘れるツールの名前（docs/glossary.md「forget ツール」）。 */
const FORGET_TOOL_NAME = "forget"

/**
 * モデルに見せる `forget` ツールの説明。**何を消してよいかの条は
 * `src/server/chat/core/chat-manner.ts` が持つ**ので、ここには指し方と範囲だけを書く
 * （二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。"

/** 索引を引いて古い雑談の候補を見るツールの名前（docs/glossary.md「recall ツール」）。 */
const RECALL_TOOL_NAME = "recall"

/**
 * モデルに見せる `recall` ツールの説明。**いつ引くかの条は
 * `src/server/chat/core/chat-manner.ts` が持つ**ので、ここには何が返るかと引ける回数だけを書く
 * （二重に書かない）。
 */
const RECALL_TOOL_DESCRIPTION =
  "言葉でエピソード索引を引き、当たった候補の一覧（id・見出し・要旨）を返す。逐語は返らない。" +
  "1件を開くには recall_episode を使う。当たらなければ候補は無い。引けるのは1ターンに2回まで。" +
  "呼ぶ条件は雑談モードの規約に従う。"

/** `recall` で見た候補を1件開くツールの名前（docs/glossary.md「recall_episode ツール」）。 */
const RECALL_EPISODE_TOOL_NAME = "recall_episode"

/**
 * モデルに見せる `recall_episode` ツールの説明。**いつ開くかの条は
 * `src/server/chat/core/chat-manner.ts` が持つ**ので、ここには何が返るかと開ける回数だけを書く
 * （二重に書かない）。
 */
const RECALL_EPISODE_TOOL_DESCRIPTION =
  "recall で見た候補の id を渡し、その1件の範囲の雑談をそのままの文面で開く。" +
  "知らない id なら何も返らない。開けるのは1ターンに2件まで。呼ぶ条件は雑談モードの規約に従う。"

/**
 * プロセス内の MCP サーバ。**戻り値は既定が "ok" だけ**で、tsukumo の内部の状態や画面の事情が
 * モデルへ戻る経路を作らない（docs/architecture.md「セリフはテキストの規約ではなく、ツール
 * 呼び出しで受け取る」・docs/design.md 7.1）。**例外は `recall` / `recall_episode` と `report` と
 * 見直しの2つ**で、`recall` / `recall_episode` が返すのは**そのセッションが自分で読める外の事実**
 * （自分の過去の雑談の目次と1件の逐語）だけ、`report` が返すのは差し戻すときの**規約違反**だけ
 * （docs/display.md 4.2）、見直しの2つが返すのは**利用者が見送った提案の識別子**と差し戻しの
 * 理由だけ。**`diary` は会話のこのサーバには載らない**（振り返りは会話とは別の使い捨ての
 * 問い合わせ。`src/server/diary/adapter/sdk-diary.ts`。docs/design.md「日記の受け取りと保存」）。
 *
 * 常に載るのは `speak` だけで、**`remember` / `forget` / `recall` / `recall_episode`
 * は雑談モードのときだけ**（`mode` が `chat` のときだけ）載る。仕事のときに出すと、作業の文脈が
 * 人格に入り込む経路（7.1）や、仕事の会話をアーカイブに残す経路になる。
 *
 * **`report` は仕事のときだけ**載る（仕事ではレポートを常にこれで受け取る。雑談は本文を
 * 書かない決まりなので載せない。`src/server/report/core/report-tool.ts`）。**見直しの2つも仕事の
 * ときだけ**（トークン消費の画面から頼むのは仕事の会話への依頼）。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す
 * （src/server/session-driver/core/sdk-message.ts）。受け取り口を1つにしておくと、イベントの流れが1本で済む。
 * `report` の引数も同じで、handler が引数を読むのは差し戻すかを決めるためだけ。**見直しの2つだけは
 * 逆に handler がイベントを流す**（検査を通したものだけを状態に入れるため。
 * `src/server/usage-review/core/usage-review-tool.ts`）。
 */
export function tsukumoServer(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  reportReview: ReportReview,
  usageReview: UsageReviewIntake,
  onReportTitle: (title: string) => void,
) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      tool(
        SPEAK_TOOL_NAME,
        SPEAK_TOOL_DESCRIPTION,
        {
          text: z.string().describe("セリフ。1〜2文の短い一言"),
          expression: z
            .enum(speakExpressionEnum(expressions))
            .describe(expressionGuide(expressions)),
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      ),
      ...(mode.kind === "work"
        ? [reportTool(reportReview, onReportTitle), ...usageReviewTools(usageReview)]
        : []),
      ...(mode.kind === "chat"
        ? [
            rememberTool(mode.personaMemory),
            forgetTool(mode.personaMemory),
            recallTool(mode.chatRecall),
            recallEpisodeTool(mode.chatRecall),
          ]
        : []),
    ],
  })
}

/**
 * レポートを受け取るツール。**差し戻しの判定の窓口はここだけ**
 * （src/server/report/core/report-review.ts）。通すときの戻り値は "ok" だけ、差し戻すときは規約違反と
 * 直し方だけを `isError` 付きで返す（画面の事情は載せない。docs/display.md 4.2）。描くか捨てるかは
 * この `isError` を見て決まる。レポートにする引数は、ここではなく `assistant` メッセージの変換が
 * 取り出す（src/server/session-driver/core/sdk-message.ts）。
 *
 * **`title` は差し戻されなかったときだけ {@link onReportTitle} へ渡す**——差し戻された呼び出しの
 * 題を渡すと、規約違反を書いたついでの題が残ってしまう。実際に書くかどうかの判断（利用者の
 * `/rename` を上書きしないなど）は `onReportTitle` の先（`src/server/session-driver/core/session-title.ts` /
 * `src/server/session-driver/adapter/sdk-session.ts`）が持つので、ここは渡すだけ。
 */
function reportTool(review: ReportReview, onReportTitle: (title: string) => void) {
  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    {
      conclusion: z.string().describe("結論。レポートの冒頭の1〜2文"),
      body: z.string().optional().describe("結論のあとの根拠・比較・手順（記法は規約のまま）"),
      favor: z.string().optional().describe("利用者へのお願い（判断・作業・情報）。無ければ省く"),
      checks: z.array(reportCheckSchema).optional().describe(REPORT_CHECKS_DESCRIPTION),
      title: z.string().optional().describe(REPORT_TITLE_DESCRIPTION),
    },
    async ({ conclusion, body, favor, checks, title }) => {
      const verdict = review.judge({
        conclusion,
        body: body ?? "",
        favor: favor ?? "",
        checks: checks ?? [],
      })
      if (verdict.kind === "rejected") {
        return { content: [{ type: "text" as const, text: verdict.text }], isError: true }
      }
      if (title !== undefined) {
        onReportTitle(title)
      }
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/** 見直しの期間の引数（2つのツールで同じ）。 */
const USAGE_REVIEW_DAYS = z.number().int().positive().describe("見た期間。今日を含む直近何日か")

/**
 * 見直しを受け取る2つのツール（`usage_review_stage` / `usage_review_result`）。**形の検査は
 * ここの zod の形**で、崩れた引数は handler に届かずに SDK が理由を返す。形の外の条と、
 * 受け付けたときにイベントを流すのは {@link UsageReviewIntake}。提案の件数の上限を zod に
 * 書かないのは、差し戻しの文面を core の1箇所で揃えるため。
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
        content: [{ type: "text" as const, text: intake.enterStage(stage, days) }],
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
        const verdict = intake.submit(findings)
        return verdict.kind === "rejected"
          ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
          : { content: [{ type: "text" as const, text: "ok" }] }
      },
    ),
  ]
}

/**
 * 覚えたことを書き足すツール。**上限に当たった回も "ok" を返す**（受け付けたかどうかを
 * モデルへ戻さない。docs/design.md 7.1）。どこにどう書くかは
 * src/server/chat/adapter/persona-memory.ts の仕事。
 */
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

/**
 * 覚えた1行を忘れるツール。**一致する行が無かった回も "ok" を返す**（消せたかどうかを
 * モデルへ戻さない。docs/design.md 7.1）。どの行と突き合わせるかは
 * src/server/chat/adapter/persona-memory.ts の仕事。
 */
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
 * 索引を引いて古い雑談の候補を見るツール。**戻り値が "ok" でないツールの1つ**で、返すのは
 * **その会話自身の過去の目次**（`id`・見出し・要旨）だけ（tsukumo の状態も画面の事情も載せない。
 * docs/chat-mode.md 4.9「古い雑談は索引を引いて思い出す」）。**文面に組み立てるのは core**
 * （src/server/chat/core/chat-memory-prompt.ts）で、**採点・1ターンの回数の縛りは
 * src/server/chat/core/chat-recall.ts**。
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
 * `recall` で見た候補を1件開くツール。**戻り値が "ok" でないツールの1つ**で、返すのは
 * **開いた1件の範囲の逐語**だけ。**文面に組み立てるのは core**（chat-memory-prompt.ts）で、
 * **1ターンの回数の縛りは chat-recall.ts**。
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

/**
 * zod の `enum` に渡す表情名。**空にならないこと**が型の要求なので、`default` を必ず先頭に置く
 * （`expressionChoices` も `default` を必ず含むが、ここで型としても保証しておく）。
 */
function speakExpressionEnum(
  expressions: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...toExpressionNames(expressions).filter((name) => name !== "default")]
}

/**
 * 表情名とラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。
 * **ラベルはキャラクターパックの定義から来る**（コードに持たない。docs/design.md 7章）。
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
