// 立ち絵1枚を添えた、出力の形つきの使い捨ての `query()` を1回起こす（作るダイアログの欄を埋める生成）。
// 何を渡し、受け取ったものをどう検査するかは core が持ち、ここは起こして `structured_output` を返すだけ。
//
// 画像を添えられるのはストリーミング入力だけなので、user メッセージ1件（画像 → 文面）を流して閉じる。
// 会話のセッションとは別の子プロセスで、1回ぶんを返したら終わる。考える段は切る。
// 組み込みのツールも MCP も持たせず（`tools: []`・`mcpServers: {}`）、設定ファイルも読まず（`settingSources: []`）、transcript も書かない（`persistSession: false`）。
//
// 時間切れの適用はここでは持たない（渡された `signal` をそのまま使う）。

import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import type { CharacterGenerationQuery } from "../core/character-generation.ts"

/** 子プロセスを起こす場所と環境変数（会話のセッションと同じものを引き継ぐ）。 */
export type CharacterGenerationProcess = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * 問い合わせを1回走らせ、`structured_output` をそのまま返す（検査は core）。
 * 起こせない・形の出力に失敗した・中断されたときは reject する。
 */
export async function queryCharacterGeneration(
  request: CharacterGenerationQuery,
  child: CharacterGenerationProcess,
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
    prompt: singleMessage(request),
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
      throw new Error(`立ち絵からの生成が通らなかった（${message.subtype}）`)
    }
  }
  throw new Error("立ち絵からの生成の result が届かなかった")
}

/** 画像1枚と文面を載せた user メッセージを1件だけ流して閉じる入力。 */
async function* singleMessage(request: CharacterGenerationQuery): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: request.image.mediaType,
            data: request.image.base64,
          },
        },
        { type: "text", text: request.prompt },
      ],
    },
    parent_tool_use_id: null,
    session_id: "",
  }
}
