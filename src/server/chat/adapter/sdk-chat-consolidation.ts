// 定着を1回走らせる使い捨ての `query()`（`docs/design.md` 7章「定着はどこで走るか」）。SDK に
// 触るので `sdk-` で始まる（原則3）。何を渡し、受け取ったものをどう検査するかは core
// （`src/server/chat/core/chat-consolidation.ts`）が持ち、ここは起こして `structured_output` を
// 返すだけ。形は `src/server/visit/adapter/sdk-visit-script.ts` に揃える。
//
// 雑談のセッション（`sdk-driver.ts`）とは別の子プロセスで、定着1回ぶんを返したら終わる。
// 考える段（extended thinking）は切る。組み込みのツールも MCP も持たせず
// （`tools: []`・`mcpServers: {}`）、設定ファイルも読まず（`settingSources: []`。フックも
// CLAUDE.md も載らない）、transcript も書かない（`persistSession: false`）。
//
// 渡す文面（畳む行・前のあらすじ・直前のエピソードの見出し）も受け取る出力も会話の内容に
// 当たるので、ログにもファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。
//
// 時間切れの適用（`AbortSignal.timeout` との合成）はここでは持たない——渡された `signal` を
// そのまま使うだけで、`CHAT_CONSOLIDATION_TIMEOUT_MS`（`chat-consolidation.ts`）を組み合わせるのは
// 呼び出し側（背景で1本だけ走らせる後段）の役目（`sdk-visit-script.ts` が
// `VISIT_SCRIPT_TIMEOUT_MS` を持たないのと同じ切り分け）。

import { query } from "@anthropic-ai/claude-agent-sdk"

import { type ChatConsolidationQuery } from "../core/chat-consolidation.ts"

/** 子プロセスを起こす場所と環境変数（雑談のセッションと同じものを引き継ぐ）。 */
export type ChatConsolidationProcess = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * 定着を1回走らせ、`structured_output` をそのまま返す（検査は呼び出し側 `chat-consolidation.ts`
 * の `parseChatConsolidationResult`）。起こせない・形の出力に失敗した・中断されたときは reject
 * する（理由の文には会話の中身を入れない）。
 */
export async function queryChatConsolidation(
  request: ChatConsolidationQuery,
  child: ChatConsolidationProcess,
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
      throw new Error(`定着を走らせられなかった（${message.subtype}）`)
    }
  }
  throw new Error("定着の result が届かなかった")
}
