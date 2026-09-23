import { describe, expect, it } from "bun:test"

import { type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { tsukumoServer } from "../../../src/server/adapter/sdk-tool.ts"
import { createReportReview } from "../../../src/server/core/report-review.ts"
import { type SessionMode } from "../../../src/server/core/session-driver.ts"

// どのツールが載るかを、モデルが見るのと同じ MCP の `tools/list` で確かめる（サーバの中身を
// 覗かず、公開された口だけを通す）。本物の claude は起こさない。

const EXPRESSIONS = [{ name: "default", label: "通常" }] as const

const WORK_MODE: SessionMode = { kind: "work" }

const CHAT_MODE: SessionMode = {
  kind: "chat",
  personaMemory: { remember: () => {}, forget: () => {}, finishTurn: () => {} },
  chatSummary: {
    read: () => undefined,
    write: () => {},
    markUndelivered: () => {},
    markDelivered: () => {},
  },
  chatKeep: { keep: () => {} },
  chatRecall: { index: () => {}, recall: () => ({ kind: "not-found" }) },
}

describe("tsukumoServer", () => {
  it("仕事のときは report が常に載る（speak と並ぶ）", async () => {
    const names = await listedToolNames(tsukumoServer(EXPRESSIONS, WORK_MODE, createReportReview()))

    expect(names).toEqual(["speak", "report"])
  })

  it("雑談のときは report が載らない（雑談は本文を書かない）", async () => {
    const names = await listedToolNames(tsukumoServer(EXPRESSIONS, CHAT_MODE, createReportReview()))

    expect(names).not.toContain("report")
    expect(names).toContain("speak")
    expect(names).toContain("remember")
  })
})

/** `tools/list` の応答のうち、ここで読む形（名前の並び）。 */
const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
})

/**
 * サーバをメモリ上の口につなぎ、`tools/list` を1回送って返ってきたツールの名前を並べる。
 * 口は送り返しを控えるだけの最小のもの（MCP の `Transport` の形）。
 */
async function listedToolNames(server: McpSdkServerConfigWithInstance): Promise<string[]> {
  const replies: unknown[] = []
  const transport: Parameters<McpSdkServerConfigWithInstance["instance"]["connect"]>[0] = {
    start: async () => {},
    close: async () => {},
    send: async (message) => {
      replies.push(message)
    },
  }
  await server.instance.connect(transport)
  transport.onmessage?.({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })

  const reply = await waitForReply(replies)
  await server.instance.close()
  return reply.result.tools.map((tool) => tool.name)
}

/** 応答が控えに届くまで、macrotask を1回ずつ譲って待つ（届かなければ 50 回で諦めて落とす）。 */
async function waitForReply(
  replies: readonly unknown[],
): Promise<z.infer<typeof TOOLS_LIST_REPLY>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = replies.find((reply) => TOOLS_LIST_REPLY.safeParse(reply).success)
    if (found !== undefined) {
      return TOOLS_LIST_REPLY.parse(found)
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error("tools/list の応答が届かなかった")
}
