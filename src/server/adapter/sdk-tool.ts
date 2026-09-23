// tsukumo がプロセス内の MCP サーバとして提供するツール（`speak` / `remember` / `forget` /
// `keep` / `index` / `recall`、仕事のときの `report` / `usage_review_stage` / `usage_review_result`）。組み立てたサーバは駆動（src/server/adapter/sdk-driver.ts）が
// `query()` の `mcpServers` へ渡す。
//
// サーバの名前と `speak` の名前は src/server/core/sdk-message.ts が持つ（届いた `assistant`
// メッセージから `speak` の呼び出しを見分ける側が core にあるため）。

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../../shared/expression-choice.ts"
import { type Expression } from "../../shared/expression.ts"
import {
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  USAGE_REVIEW_STAGES,
} from "../../shared/usage-review.ts"
import { chatRecallText } from "../core/chat-memory-prompt.ts"
import { type ReportReview } from "../core/report-review.ts"
import { REPORT_TOOL_DESCRIPTION } from "../core/report-tool.ts"
import { REPORT_TOOL_NAME, SPEAK_TOOL_NAME, TSUKUMO_MCP_SERVER_NAME } from "../core/sdk-message.ts"
import {
  type ChatKeep,
  type ChatRecall,
  type PersonaMemory,
  type SessionMode,
} from "../core/session-driver.ts"
import {
  USAGE_REVIEW_RESULT_TOOL_DESCRIPTION,
  USAGE_REVIEW_RESULT_TOOL_NAME,
  USAGE_REVIEW_STAGE_TOOL_DESCRIPTION,
  USAGE_REVIEW_STAGE_TOOL_NAME,
  type UsageReviewIntake,
  usageProposalKindGuide,
  usageReviewStageGuide,
} from "../core/usage-review-tool.ts"

/** モデルに見せる `speak` ツールの説明。**セリフと本文の境目はここだけで説明する。** */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想・完了報告はこのツールで言う。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

/** 覚えたことを書き足すツールの名前（docs/glossary.md「remember ツール」）。 */
const REMEMBER_TOOL_NAME = "remember"

/**
 * モデルに見せる `remember` ツールの説明。**何を書いてよいかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには置き場所と形だけを書く
 * （二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。"

/** 覚えた1行を忘れるツールの名前（docs/glossary.md「forget ツール」）。 */
const FORGET_TOOL_NAME = "forget"

/**
 * モデルに見せる `forget` ツールの説明。**何を消してよいかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには指し方と範囲だけを書く
 * （二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。"

/** いまのやり取りに「残す」旗を立てるツールの名前（docs/glossary.md「keep ツール」）。 */
const KEEP_TOOL_NAME = "keep"

/**
 * モデルに見せる `keep` ツールの説明。**いつ立てるかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が起きるかと指せる範囲だけを書く
 * （二重に書かない）。
 */
const KEEP_TOOL_DESCRIPTION =
  "いま話しているやり取りに「残す」印を付ける。引数は無く、指せるのはこのターンの1往復だけ。" +
  "印の付いたやり取りは、直近を読み戻す窓から溢れても忘れずに残る。呼ぶ条件は雑談モードの規約に従う。"

/** その日の見出しを索引に残すツールの名前（docs/glossary.md「index ツール」）。 */
const INDEX_TOOL_NAME = "index"

/**
 * モデルに見せる `index` ツールの説明。**いつ書くかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が起きるかと指せる範囲だけを書く
 * （二重に書かない）。
 */
const INDEX_TOOL_DESCRIPTION =
  "今日の雑談に、あとで探すための見出しを1行だけ付ける。付くのは今日の日付で、前の日には付け直せない。" +
  "この見出しは `recall` で引く索引になる。呼ぶ条件は雑談モードの規約に従う。"

/** 索引を引いて古い雑談を思い出すツールの名前（docs/glossary.md「recall ツール」）。 */
const RECALL_TOOL_NAME = "recall"

/**
 * モデルに見せる `recall` ツールの説明。**いつ引くかの条は
 * `src/server/core/chat-manner.ts` が持つ**ので、ここには何が返るかと引ける回数だけを書く
 * （二重に書かない）。
 */
const RECALL_TOOL_DESCRIPTION =
  "日ごとの見出しの索引を言葉で引き、当たった日の雑談をそのままの文面で思い出す。" +
  "当たらなければ何も返らない。引けるのは1ターンに1回だけ。呼ぶ条件は雑談モードの規約に従う。"

/**
 * プロセス内の MCP サーバ。**戻り値は既定が "ok" だけ**で、tsukumo の内部の状態や画面の事情が
 * モデルへ戻る経路を作らない（docs/architecture.md「セリフはテキストの規約ではなく、ツール
 * 呼び出しで受け取る」・docs/design.md 7.1）。**例外は `recall` と `report` と見直しの2つ**で、
 * `recall` が返すのは**そのセッションが自分で読める外の事実**（自分の過去の雑談）だけ、`report` が
 * 返すのは差し戻すときの**規約違反**だけ（docs/display.md 4.2）、見直しの2つが返すのは
 * **利用者が見送った提案の識別子**と差し戻しの理由だけ（docs/design.md「見直しのツールと状態」）。
 *
 * 常に載るのは `speak` の1つで、**`remember` / `forget` / `keep` / `index` / `recall` は
 * 雑談モードのときだけ**（`mode` が `chat` のときだけ）載る。仕事のときに出すと、作業の文脈が
 * 人格に入り込む経路（7.1）や、仕事の会話をアーカイブに残す経路になる。
 *
 * **`report` は仕事のときだけ**載る（仕事ではレポートを常にこれで受け取る。雑談は本文を
 * 書かない決まりなので載せない。`src/server/core/report-tool.ts`）。**見直しの2つも仕事の
 * ときだけ**（トークン消費の画面から頼むのは仕事の会話への依頼）。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す
 * （src/server/core/sdk-message.ts）。受け取り口を1つにしておくと、イベントの流れが1本で済む。
 * `report` の引数も同じで、handler が引数を読むのは差し戻すかを決めるためだけ。**見直しの2つだけは
 * 逆に handler がイベントを流す**（検査を通したものだけを状態に入れるため。
 * `src/server/core/usage-review-tool.ts`）。
 */
export function tsukumoServer(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  reportReview: ReportReview,
  usageReview: UsageReviewIntake,
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
      ...(mode.kind === "work" ? [reportTool(reportReview), ...usageReviewTools(usageReview)] : []),
      ...(mode.kind === "chat"
        ? [
            rememberTool(mode.personaMemory),
            forgetTool(mode.personaMemory),
            keepTool(mode.chatKeep),
            indexTool(mode.chatRecall),
            recallTool(mode.chatRecall),
          ]
        : []),
    ],
  })
}

/**
 * レポートを受け取るツール。**差し戻しの判定の窓口はここだけ**
 * （src/server/core/report-review.ts）。通すときの戻り値は "ok" だけ、差し戻すときは規約違反と
 * 直し方だけを `isError` 付きで返す（画面の事情は載せない。docs/display.md 4.2）。描くか捨てるかは
 * この `isError` を見て決まる。レポートにする引数は、ここではなく `assistant` メッセージの変換が
 * 取り出す（src/server/core/sdk-message.ts）。
 */
function reportTool(review: ReportReview) {
  return tool(
    REPORT_TOOL_NAME,
    REPORT_TOOL_DESCRIPTION,
    {
      conclusion: z.string().describe("結論。レポートの冒頭の1〜2文"),
      body: z.string().optional().describe("結論のあとの根拠・比較・手順（記法は規約のまま）"),
      favor: z.string().optional().describe("利用者へのお願い（判断・作業・情報）。無ければ省く"),
    },
    async ({ conclusion, body, favor }) => {
      const verdict = review.judge({ conclusion, body: body ?? "", favor: favor ?? "" })
      return verdict.kind === "rejected"
        ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
        : { content: [{ type: "text" as const, text: "ok" }] }
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
 * src/server/adapter/persona-memory.ts の仕事。
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
 * src/server/adapter/persona-memory.ts の仕事。
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
 * いまのやり取りに「残す」旗を立てるツール。**引数を取らない** — 指せるのはそのターンの
 * 1往復だけで、**会話の文面がツールの引数を通って戻ってくる経路を作らない**
 * （docs/coding-standards.md「会話内容の扱い」）。**旗が立ったかどうかもモデルへ戻さない**
 * （返すのは "ok" だけ。docs/design.md 7章）。どこにどう書くかは
 * src/server/adapter/chat-archive.ts の仕事。
 */
function keepTool(chatKeep: ChatKeep) {
  return tool(KEEP_TOOL_NAME, KEEP_TOOL_DESCRIPTION, {}, async () => {
    chatKeep.keep()
    return { content: [{ type: "text" as const, text: "ok" }] }
  })
}

/**
 * その日の見出しを索引に1行残すツール。**上限に当たった回も "ok" を返す**（受け付けたかどうかを
 * モデルへ戻さない。`remember` と同じ）。どこにどう書くかは
 * src/server/adapter/chat-archive.ts の仕事。
 */
function indexTool(chatRecall: ChatRecall) {
  return tool(
    INDEX_TOOL_NAME,
    INDEX_TOOL_DESCRIPTION,
    { line: z.string().describe("今日の見出し。あとで探すための1行（120文字まで）") },
    async ({ line }) => {
      chatRecall.index(line)
      return { content: [{ type: "text" as const, text: "ok" }] }
    },
  )
}

/**
 * 索引を引いて古い雑談を思い出すツール。**戻り値が "ok" でない唯一のツール**で、返すのは
 * **その会話自身の過去**だけ（tsukumo の状態も画面の事情も載せない。
 * docs/chat-mode.md 4.9「古い雑談は索引を引いて思い出す」）。**文面に組み立てるのは core**
 * （src/server/core/chat-memory-prompt.ts）で、**どの日を開くかを決めるのは
 * src/server/adapter/chat-archive.ts**。
 */
function recallTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_TOOL_NAME,
    RECALL_TOOL_DESCRIPTION,
    { keyword: z.string().describe("引く言葉。語を空白で区切ると、どれかに当たった日が返る") },
    async ({ keyword }) => ({
      content: [{ type: "text" as const, text: chatRecallText(chatRecall.recall(keyword)) }],
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
