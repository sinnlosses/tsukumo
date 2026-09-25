import { describe, expect, it } from "bun:test"

import { type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { createReportReview } from "../../../../src/server/report/core/report-review.ts"
import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import { type SessionMode } from "../../../../src/server/session-driver/core/session-driver.ts"
import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"
import { applySessionEvent, INITIAL_SESSION_STATE } from "../../../../src/shared/session-state.ts"

// どのツールが載るか・呼ぶと何が返るかを、モデルが見るのと同じ MCP の `tools/list` /
// `tools/call` で確かめる（サーバの中身を覗かず、公開された口だけを通す）。本物の claude は
// 起こさない。見直しの引数は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

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
  it("仕事のときは report と見直しの2つが常に載る（speak と並ぶ）", async () => {
    const names = await listedToolNames(workServer())

    expect(names).toEqual(["speak", "report", "usage_review_stage", "usage_review_result"])
  })

  it("雑談のときは report も見直しの2つも載らない。diary も載らない（会話とは別の使い捨ての問い合わせ）", async () => {
    const names = await listedToolNames(
      tsukumoServer(EXPRESSIONS, CHAT_MODE, createReportReview(), noopIntake(), () => {}),
    )

    expect(names).not.toContain("report")
    expect(names).not.toContain("usage_review_result")
    expect(names).not.toContain("diary")
    expect(names).toContain("speak")
    expect(names).toContain("remember")
  })
})

describe("report の title", () => {
  it("通った report の title を渡す", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の結論",
      title: "架空の題",
    })

    expect(reply).toEqual({ text: "ok", isError: false })
    expect(titles).toEqual(["架空の題"])
  })

  it("title を渡さなくても report は通る", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の結論",
    })

    expect(reply).toEqual({ text: "ok", isError: false })
    expect(titles).toEqual([])
  })

  it("規約違反で差し戻された report の title は渡さない", async () => {
    const titles: string[] = []

    // conclusion が3文以上（規約違反「冒頭の1〜2文で結論」）だと差し戻される。
    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の一文目。架空の二文目。架空の三文目。",
      title: "架空の題",
    })

    expect(reply.isError).toBe(true)
    expect(titles).toEqual([])
  })
})

describe("見直しのツール", () => {
  it("正しい結果を渡すと ok が返り、畳んだ状態が結果になる", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events), "usage_review_result", VALID_FINDINGS)

    expect(reply).toEqual({ text: "ok", isError: false })
    expect(events).toEqual([{ kind: "usage-review-result", findings: VALID_FINDINGS }])
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 2_000),
      INITIAL_SESSION_STATE,
    )
    expect(state.usageReview).toEqual({
      kind: "result",
      reviewedAt: 2_000,
      findings: VALID_FINDINGS,
    })
  })

  it("段を渡すとイベントが流れ、見送った提案の識別子が戻り値に並ぶ", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      workServer(events, ["unused-mcp:example-server"]),
      "usage_review_stage",
      { stage: "cache", days: 7 },
    )

    expect(events).toEqual([{ kind: "usage-review-stage", stage: "cache", days: 7 }])
    expect(reply.isError).toBe(false)
    expect(reply.text.split("\n")[0]).toBe("ok")
    expect(reply.text).toContain("- unused-mcp:example-server")
  })

  it("列挙に無い種類は境界で断られ、理由が戻り値で返り、イベントは流れない", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals: [{ ...VALID_PROPOSAL, kind: "unknown-kind" }],
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("kind")
    expect(events).toEqual([])
  })

  it("形は合っていても条に外れる結果は、直し方つきで差し戻される", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      workServer(events, ["unused-mcp:example-server"]),
      "usage_review_result",
      { ...VALID_FINDINGS, headline: " ", proposals: [VALID_PROPOSAL, VALID_PROPOSAL] },
    )

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("`headline` が空")
    expect(reply.text).toContain("同じ `kind` と `target` の組が1件重なっている")
    expect(reply.text).toContain("利用者が見送った提案が2件入っている")
    expect(events).toEqual([])
  })

  it("提案が上限を超えると差し戻される", async () => {
    const events: SessionEvent[] = []
    const proposals = ["a", "b", "c", "d", "e", "f"].map((target) => ({
      ...VALID_PROPOSAL,
      kind: "tool-result",
      target,
    }))

    const reply = await callTool(workServer(events), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("提案が6件ある")
    expect(events).toEqual([])
  })
})

const VALID_PROPOSAL = {
  kind: "unused-mcp",
  target: "example-server",
  impact: "small",
  title: "架空の MCP サーバを外す",
  basis: "架空の根拠（10 ターンぶん）",
  action: "架空のやること",
  followUp: "delegate",
} as const

const VALID_FINDINGS = {
  days: 7,
  headline: "架空の冒頭の一言。",
  proposals: [VALID_PROPOSAL],
} as const

/**
 * 仕事のサーバ。見直しのイベントは `events` に積み、見送りの一覧は `dismissed` を返す。
 * `report` が受け取った題は `titles` に積む。
 */
function workServer(
  events: SessionEvent[] = [],
  dismissed: readonly string[] = [],
  titles: string[] = [],
): McpSdkServerConfigWithInstance {
  return tsukumoServer(
    EXPRESSIONS,
    WORK_MODE,
    createReportReview(),
    createUsageReviewIntake(
      () => dismissed,
      (event) => {
        events.push(event)
      },
    ),
    (title) => {
      titles.push(title)
    },
  )
}

function noopIntake() {
  return createUsageReviewIntake(
    () => [],
    () => {},
  )
}

/** `tools/list` の応答のうち、ここで読む形（名前の並び）。 */
const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
})

/** `tools/call` の応答のうち、ここで読む形（最初の文面と `isError`）。 */
const TOOLS_CALL_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
  }),
})

async function listedToolNames(server: McpSdkServerConfigWithInstance): Promise<string[]> {
  const reply = await request(server, "tools/list", {}, TOOLS_LIST_REPLY)
  return reply.result.tools.map((tool) => tool.name)
}

async function callTool(
  server: McpSdkServerConfigWithInstance,
  name: string,
  args: unknown,
): Promise<{ readonly text: string; readonly isError: boolean }> {
  const reply = await request(server, "tools/call", { name, arguments: args }, TOOLS_CALL_REPLY)
  return {
    text: reply.result.content.map((block) => block.text).join("\n"),
    isError: reply.result.isError ?? false,
  }
}

/**
 * サーバをメモリ上の口につなぎ、要求を1回送って返ってきた応答を読む。
 * 口は送り返しを控えるだけの最小のもの（MCP の `Transport` の形）。
 */
async function request<T>(
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

/** 応答が控えに届くまで、macrotask を1回ずつ譲って待つ（届かなければ 50 回で諦めて落とす）。 */
async function waitForReply<T>(replies: readonly unknown[], schema: z.ZodType<T>): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = replies.find((reply) => schema.safeParse(reply).success)
    if (found !== undefined) {
      return schema.parse(found)
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error("応答が届かなかった")
}
