// 訪問の台本を書かせる使い捨ての `query()`（`docs/design.md` 5章「訪問の台本」）。SDK に触るので
// `sdk-` で始まる（原則3）。何を渡し、受け取ったものをどう検査するかは core
// （`src/server/core/visit-script.ts` と `visit-script-writer.ts`）が持ち、ここは起こして
// `structured_output` を返すだけ。
//
// 仕事のセッション（`sdk-driver.ts`）とは別の子プロセスで、**訪問1回ぶんの台本を返したら終わる**。
// 考える段（extended thinking）は切る。組み込みのツールも MCP も持たせず（`tools: []`・`mcpServers: {}`）、設定ファイルも読まず
// （`settingSources: []`。フックも CLAUDE.md も載らない）、transcript も書かない
// （`persistSession: false`）。渡す文面と受け取る台本は会話の内容に当たるので、ログにも
// ファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。

import { query } from "@anthropic-ai/claude-agent-sdk"

import { type VisitScriptQuery } from "../core/visit-script.ts"

/** 子プロセスを起こす場所と環境変数（仕事のセッションと同じものを引き継ぐ）。 */
export type VisitScriptProcess = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * 台本を1本書かせ、`structured_output` をそのまま返す（検査は呼び出し側）。起こせない・
 * 形の出力に失敗した・中断されたときは reject する（理由の文には会話の中身を入れない）。
 */
export async function queryVisitScript(
  request: VisitScriptQuery,
  child: VisitScriptProcess,
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
      // 考え込ませると軽いモデルでも1分を超え、時間切れで毎回落とし先へ回る（実測）。
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
      throw new Error(`訪問の台本を書かせられなかった（${message.subtype}）`)
    }
  }
  throw new Error("訪問の台本の result が届かなかった")
}
