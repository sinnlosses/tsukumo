// 日記を書かせる使い捨ての `query()`（`docs/design.md`「日記の受け取りと保存」）。SDK に触るので
// `sdk-` で始まる（原則3）。持たせるのは `diary` ツール1つだけの、プロセス内の MCP サーバ。
// `includePartialMessages` の断片を3段の合図（`diary-drafting` / `diary-stage`）へ変えて流す。
//
// 会話のセッション（`sdk-driver.ts`）とは別の子プロセスで、**日記を1つ書き終えたら終わる**。
// 考える段（extended thinking）は切る。組み込みのツールは持たせず（`tools: []`）、MCP は
// `diary` だけ（`strictMcpConfig: true` / `allowedTools` に `mcp__tsukumo__diary` だけ）、
// `permissionMode: "dontAsk"`（ほかは聞かずに断る。許可を尋ねる先が無い）。設定ファイルも読まず
// （`settingSources: []`）、transcript も書かない（`persistSession: false`）。
//
// 渡す文面と受け取る日記は会話の内容に当たるので、ログにもファイルにも書かない
// （docs/coding-standards.md「会話内容の扱い」）。検査・保存・「書けた／書けなかった」の判定は
// core（`diary-writer.ts` / `diary-tool.ts`）。

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk"
import { isPlainObject } from "remeda"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames,
  resolveExpressionLabel,
} from "../../../shared/expression-choice.ts"
import { type Expression } from "../../../shared/expression.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import {
  TSUKUMO_MCP_SERVER_NAME,
  tsukumoToolFullName,
} from "../../session-driver/core/sdk-message.ts"
import {
  DIARY_BOOKMARK_DESCRIPTION,
  DIARY_TOOL_DESCRIPTION,
  DIARY_TOOL_NAME,
  diaryArgumentHasBookmarkKey,
  type DiaryIntake,
} from "../core/diary-tool.ts"

/** 呼び直す余地（仮。`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。 */
const DIARY_QUERY_MAX_TURNS = 4

const DIARY_TOOL_FULL_NAME = tsukumoToolFullName(DIARY_TOOL_NAME)

/** {@link queryDiary} に渡すもの。 */
export type DiaryQueryRequest = {
  readonly systemPrompt: string
  readonly prompt: string
  readonly model: string
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly expressions: readonly ExpressionChoice[]
}

/**
 * `diary` を1回書かせる。**reject しない**——起こせない・API の失敗は for-await の反復が
 * 例外で終わるだけで、呼び出し側（`diary-writer.ts`）が拾って「書けなかった」に畳む。
 * `intake.submit` が受け付けたかどうかは `onEvent` に流れる `diary-written` で呼び出し側が見る
 * （ここでは判定しない）。
 */
export async function queryDiary(
  request: DiaryQueryRequest,
  intake: DiaryIntake,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const abortController = new AbortController()
  if (signal.aborted) {
    abortController.abort()
  } else {
    signal.addEventListener(
      "abort",
      () => {
        abortController.abort()
      },
      { once: true },
    )
  }

  const session = query({
    prompt: request.prompt,
    options: {
      cwd: request.cwd,
      env: { ...request.env },
      model: request.model,
      systemPrompt: request.systemPrompt,
      tools: [],
      mcpServers: { [TSUKUMO_MCP_SERVER_NAME]: diaryServer(intake, request.expressions) },
      strictMcpConfig: true,
      allowedTools: [DIARY_TOOL_FULL_NAME],
      permissionMode: "dontAsk",
      settingSources: [],
      persistSession: false,
      includePartialMessages: true,
      maxTurns: DIARY_QUERY_MAX_TURNS,
      thinking: { type: "disabled" },
      abortController,
    },
  })

  // **`diary` の呼び出しの塊を追いかけ、断片を3段の合図に変える**（`docs/design.md`
  // 「日記の受け取りと保存」「3段の進みの決まり方」）。
  const observer = createDiaryStreamObserver()
  for await (const message of session) {
    for (const event of observer.observe(message)) {
      onEvent(event)
    }
  }
}

/** {@link createDiaryStreamObserver} が返す窓口。 */
export type DiaryStreamObserver = {
  /**
   * 生のメッセージ1件を渡す。`diary` ツールの塊が開いたら `diary-drafting` を、引数の断片を
   * つないで `bookmark` の鍵を見つけたら `diary-stage { stage: "pick" }` を返す（同じ塊では
   * `pick` を二度と返さない）。塊が閉じたら追いかけるのをやめる。それ以外は常に空の並び。
   */
  readonly observe: (message: unknown) => readonly SessionEvent[]
}

/**
 * {@link DiaryStreamObserver} を1つ作る（**問い合わせ1回に1つ**）。`index` で塊を見分け、
 * サブエージェントの中（`parent_tool_use_id` あり）は見ない。SDK の型は import しない——
 * `stream_event` の生の形は `isPlainObject` で構造だけを見る（`session-driver/core/sdk-message.ts`
 * と同じやり方）。
 */
export function createDiaryStreamObserver(): DiaryStreamObserver {
  let tracking: { readonly index: number; readonly buffer: string } | undefined

  return {
    observe: (message) => {
      if (
        !isPlainObject(message) ||
        message.type !== "stream_event" ||
        typeof message.parent_tool_use_id === "string" ||
        !isPlainObject(message.event)
      ) {
        return []
      }
      const event = message.event
      const index = event.index
      if (typeof index !== "number") {
        return []
      }

      if (event.type === "content_block_start" && isPlainObject(event.content_block)) {
        const block = event.content_block
        if (block.type === "tool_use" && block.name === DIARY_TOOL_FULL_NAME) {
          tracking = { index, buffer: "" }
          return [
            { kind: "diary-drafting", toolUseId: typeof block.id === "string" ? block.id : "" },
          ]
        }
        tracking = undefined
        return []
      }

      if (tracking === undefined || tracking.index !== index) {
        return []
      }

      if (event.type === "content_block_delta" && isPlainObject(event.delta)) {
        if (
          event.delta.type !== "input_json_delta" ||
          typeof event.delta.partial_json !== "string"
        ) {
          return []
        }
        const buffer = tracking.buffer + event.delta.partial_json
        tracking = { index, buffer }
        if (diaryArgumentHasBookmarkKey(buffer)) {
          // 拾ったら、この塊が閉じるまで待たずに追いかけるのをやめる（二重に出さない）。
          tracking = undefined
          return [{ kind: "diary-stage", stage: "pick" }]
        }
        return []
      }

      if (event.type === "content_block_stop") {
        tracking = undefined
      }
      return []
    },
  }
}

/** `diary` だけを持つプロセス内の MCP サーバ。 */
function diaryServer(intake: DiaryIntake, expressions: readonly ExpressionChoice[]) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      tool(
        DIARY_TOOL_NAME,
        DIARY_TOOL_DESCRIPTION,
        {
          body: z
            .string()
            .describe("日記の本文。キャラクターの口調で、この日の仕事の感想とねぎらいを短く"),
          expression: z
            .enum(diaryExpressionEnum(expressions))
            .describe(diaryExpressionGuide(expressions)),
          bookmark: z
            .object({
              taskId: z.string().describe("しおりに選ぶタスクの id（その日の終えたタスクから1件）"),
              reason: z.string().describe("選んだ理由を1文で"),
            })
            .optional()
            .describe(DIARY_BOOKMARK_DESCRIPTION),
        },
        async ({ body, expression, bookmark }) => {
          const verdict = await intake.submit({ body, expression, bookmark })
          return verdict.kind === "rejected"
            ? { content: [{ type: "text" as const, text: verdict.text }], isError: true }
            : { content: [{ type: "text" as const, text: "ok" }] }
        },
      ),
    ],
  })
}

/**
 * zod の `enum` に渡す表情名。**空にならないこと**が型の要求なので、`default` を必ず先頭に置く
 * （`src/server/session-driver/adapter/sdk-tool.ts` の同名の考え方と同じ）。
 */
function diaryExpressionEnum(
  expressions: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...expressionNames(expressions).filter((name) => name !== "default")]
}

/** 表情名とラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。 */
function diaryExpressionGuide(expressions: readonly ExpressionChoice[]): string {
  const guide = diaryExpressionEnum(expressions)
    .map((name) => `${name}（${resolveExpressionLabel(expressions, name)}）`)
    .join(" / ")
  return `表情。${guide}`
}
