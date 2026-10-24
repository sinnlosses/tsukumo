// 日記を書かせる使い捨ての `query()`。持たせるのは `diary` ツール1つだけの、プロセス内の MCP サーバ。
// `includePartialMessages` の断片を3段の合図（`diary-drafting` / `diary-stage`）へ変えて流す（変換は `createDiaryStreamObserver`）。
//
// 会話のセッションとは別の子プロセスで、日記を1つ書き終えたら終わる。
// 考える段（extended thinking）は切る。
// 組み込みのツールは持たせず（`tools: []`）、MCP は `diary` だけ（`strictMcpConfig: true` / `allowedTools` に `mcp__tsukumo__diary` だけ）。
// `permissionMode: "dontAsk"`（ほかは聞かずに断る。許可を尋ねる先が無い）。
// 設定ファイルも読まず（`settingSources: []`）、transcript も書かない（`persistSession: false`）。
//
// 渡す文面と受け取る日記は会話の内容に当たるので、ここではログにもファイルにも書かない。
// 検査・保存・「書けた／書けなかった」の判定は core が持つ。

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames,
  resolveExpressionLabel,
} from "../../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { TSUKUMO_MCP_SERVER_NAME, tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"
import {
  DIARY_BOOKMARK_DESCRIPTION,
  DIARY_TOOL_DESCRIPTION,
  DIARY_TOOL_NAME,
  type DiaryIntake,
} from "../core/diary-tool.ts"
import { createDiaryStreamObserver } from "./sdk-diary-stream.ts"

/** 呼び直す余地（仮）。 */
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
 * `diary` を1回書かせる。
 * 起こせない・API の失敗は for-await の反復が例外で終わるので、呼び出し側が拾って「書けなかった」に畳む。
 * `intake.submit` が受け付けたかどうかは `onEvent` に流れる `diary-written` で呼び出し側が見る（ここでは判定しない）。
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

  // `diary` の呼び出しの塊を追いかけ、断片を3段の合図に変える。
  const observer = createDiaryStreamObserver()
  for await (const message of session) {
    for (const event of observer.observe(message)) {
      onEvent(event)
    }
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

/** zod の `enum` に渡す表情名。空にならないことが型の要求なので、`default` を必ず先頭に置く。 */
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
