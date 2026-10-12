// プロセス内の MCP サーバ（`createSdkMcpServer`）に、モデルが見るのと同じ `tools/list` / `tools/call` を送って応答を読む。
// サーバの中身を覗かず、公開された口だけを通す。

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

/** `tools/list` の応答のうち、ここで読む形（名前の並び）。 */
const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
})

/** `tools/call` の応答のうち、ここで読む形（文面と `isError` と、ターンを閉じる印）。 */
const TOOLS_CALL_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
})

/** 載っているツールの名前の並び。 */
export async function listedToolNames(server: McpSdkServerConfigWithInstance): Promise<string[]> {
  const reply = await mcpRequest(server, "tools/list", {}, TOOLS_LIST_REPLY)
  return reply.result.tools.map((tool) => tool.name)
}

/** ツールを1回呼び、文面・`isError`・ターンを閉じる印を読む。 */
export async function callTool(
  server: McpSdkServerConfigWithInstance,
  name: string,
  args: unknown,
): Promise<{ readonly text: string; readonly isError: boolean; readonly endsTurn: boolean }> {
  const reply = await mcpRequest(server, "tools/call", { name, arguments: args }, TOOLS_CALL_REPLY)
  const { _meta: meta } = reply.result
  return {
    text: reply.result.content.map((block) => block.text).join("\n"),
    isError: reply.result.isError ?? false,
    endsTurn: meta?.["claude/endTurn"] === true,
  }
}

/**
 * サーバをメモリ上の口につなぎ、要求を1回送って返ってきた応答を読む。
 * 口は送り返しを控えるだけの最小のもの（MCP の `Transport` の形）。
 */
export async function mcpRequest<T>(
  server: McpSdkServerConfigWithInstance,
  method: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const replies: unknown[] = []
  const transport: Parameters<McpSdkServerConfigWithInstance["instance"]["connect"]>[0] = {
    start: async () => {},
    close: async () => {},
    send: async (message) => {
      replies.push(message)
    },
  }
  await server.instance.connect(transport)
  transport.onmessage?.({ jsonrpc: "2.0", id: 1, method, params })

  const reply = await waitForReply(replies, schema)
  await server.instance.close()
  return reply
}

/** 応答が控えに届くまで待つ。mermaid の worker の初回の読み込みを待てる長さにしてある。 */
async function waitForReply<T>(replies: readonly unknown[], schema: z.ZodType<T>): Promise<T> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const found = replies.find((reply) => schema.safeParse(reply).success)
    if (found !== undefined) {
      return schema.parse(found)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("応答が届かなかった")
}
