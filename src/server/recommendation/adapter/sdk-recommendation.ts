// おすすめの札を1回作る使い捨ての `query()`。
// 何を渡し、受け取ったものをどう検査するかは core が持ち、ここは起こして `structured_output` を返すだけ。
//
// 会話のセッションとは別の子プロセスで、1回ぶんを返したら終わる。考える段は切る。
// 組み込みのツールも MCP も持たせず（`tools: []`・`mcpServers: {}`）、設定ファイルも読まず（`settingSources: []`）、transcript も書かない（`persistSession: false`）。
//
// 時間切れの適用はここでは持たない（渡された `signal` をそのまま使う）。

import { query } from "@anthropic-ai/claude-agent-sdk"

import type { RecommendationQuery } from "../core/recommendation.ts"

/** 子プロセスを起こす場所と環境変数（会話のセッションと同じものを引き継ぐ）。 */
export type RecommendationProcess = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * 問い合わせを1回走らせ、`structured_output` をそのまま返す（検査は `parseRecommendationResult`）。
 * 起こせない・形の出力に失敗した・中断されたときは reject する。
 */
export async function queryRecommendation(
  request: RecommendationQuery,
  child: RecommendationProcess,
  signal: AbortSignal,
): Promise<unknown> {
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
      cwd: child.cwd,
      env: { ...child.env },
      model: request.model,
      systemPrompt: request.systemPrompt,
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      maxTurns: 1,
      persistSession: false,
      thinking: { type: "disabled" },
      outputFormat: { type: "json_schema", schema: { ...request.schema } },
      abortController,
    },
  })
  for await (const message of session) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        return message.structured_output
      }
      throw new Error(`おすすめの札を作れなかった（${message.subtype}）`)
    }
  }
  throw new Error("おすすめの札の result が届かなかった")
}
