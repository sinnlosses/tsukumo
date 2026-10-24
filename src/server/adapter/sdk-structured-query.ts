// 出力の形つきの使い捨ての `query()` を1回起こす。
// 何を渡し、受け取ったものをどう検査するかは core が持ち、ここは起こして `structured_output` を返すだけ。
// 起こした1回ごとに、種類・所要・トークンの足跡を記録の口へ渡す（`recordedMessages`）。
//
// 画像を添えられるのはストリーミング入力だけなので、画像があるときは user メッセージ1件（画像 → 文面）を流して閉じる。
// 会話のセッションとは別の子プロセスで、1回ぶんを返したら終わる。考える段は切る。
// 組み込みのツールも MCP も持たせず（`tools: []`・`mcpServers: {}`）、設定ファイルも読まず（`settingSources: []`）、transcript も書かない（`persistSession: false`）。
// この子プロセスの形が `docs/coding-standards.md`「会話内容の扱い」の、定着の `query()` へ渡してよい条件になっている。
//
// 渡す文面も受け取る出力も会話の内容に当たりうるので、ログにもファイルにも書かない（足跡は数と種類の語だけ）。
//
// 時間切れの適用はここでは持たない（渡された `signal` をそのまま使う）。

import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import { type StructuredQuery, StructuredQueryResultError } from "../core/structured-query.ts"
import type { ThrowawayQueryRecorder } from "../core/throwaway-query.ts"
import { abortControllerFor, recordedMessages } from "./sdk-throwaway-query.ts"

/** 子プロセスを起こす場所と環境変数（会話のセッションと同じものを引き継ぐ）と、足跡を残す先。 */
export type StructuredQueryProcess = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly record: ThrowawayQueryRecorder
  /** 現在時刻（エポックミリ秒）。 */
  readonly now: () => number
}

/**
 * 問い合わせを1回走らせ、`structured_output` をそのまま返す（検査は core）。
 * 起こせない・中断されたときは reject し、result が成功でなければ {@link StructuredQueryResultError} を投げる。
 */
export async function queryStructured(
  request: StructuredQuery,
  child: StructuredQueryProcess,
  signal: AbortSignal,
): Promise<unknown> {
  const session = query({
    prompt: request.images.length === 0 ? request.prompt : singleMessage(request),
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
      abortController: abortControllerFor(signal),
    },
  })
  const watch = { kind: request.kind, record: child.record, now: child.now }
  for await (const message of recordedMessages(session, watch, signal)) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        return message.structured_output
      }
      throw new StructuredQueryResultError(message.subtype)
    }
  }
  throw new Error("形つきの問い合わせの result が届かなかった")
}

/** 画像と文面を載せた user メッセージを1件だけ流して閉じる入力。 */
async function* singleMessage(request: StructuredQuery): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: {
      role: "user",
      content: [
        ...request.images.map((image) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType,
            data: image.base64,
          },
        })),
        { type: "text", text: request.prompt },
      ],
    },
    parent_tool_use_id: null,
    session_id: "",
  }
}
