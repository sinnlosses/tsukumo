// `body-fence` の版の `report` を、モデルが見るのと同じ `tools/list` / `tools/call` で確かめる。

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { REPORT_BODY_DESCRIPTION } from "../../../../src/server/report/core/report-tool.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool, mcpRequest } from "../../../fixture/mcp-server.ts"
import {
  BODY_FENCE_WORK_MODE,
  CLOSING,
  FIGURE,
  REMAINING,
  SESSION_SUMMARY,
  WAITING_LINE,
  WORK_MODE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

const draft = {
  conclusion: ["架空の結論"],
  closing: CLOSING,
  figure: FIGURE,
  sessionSummary: SESSION_SUMMARY,
  sessionRemaining: REMAINING,
  waitingLine: WAITING_LINE,
}

const SECTIONS = [{ heading: "架空の節", blocks: [{ kind: "text", text: "架空の根拠。" }] }]

const bodyFenceServer = (events: SessionEvent[] = []) =>
  workServer(events, [], createCallReview(), [], BODY_FENCE_WORK_MODE)

describe("body-fence の report の定義", () => {
  it("body に説明が付き、sections は旧い形として残る。json-schema の版には body が無い", async () => {
    const bodyFence = await listedProperties(bodyFenceServer())
    const jsonSchema = await listedProperties(workServer([], [], createCallReview(), [], WORK_MODE))

    expect(bodyFence.body?.description).toBe(REPORT_BODY_DESCRIPTION)
    expect(bodyFence.sections?.description).toContain("併記できない")
    expect(jsonSchema.body).toBeUndefined()
  })
})

describe("body-fence の report の定義の大きさ", () => {
  it("塊の定義（definitions）を載せず、json-schema の版より小さい", async () => {
    const bodyFence = await listedInputSchema(bodyFenceServer())
    const jsonSchema = await listedInputSchema(
      workServer([], [], createCallReview(), [], WORK_MODE),
    )

    expect(bodyFence).not.toHaveProperty("definitions")
    expect(JSON.stringify(bodyFence).length).toBeLessThan(JSON.stringify(jsonSchema).length)
  })
})

describe("body-fence の report の受理", () => {
  it("body だけなら通してターンを閉じ、壊れた型つきフェンスがあっても差し戻さず数える", async () => {
    const review = createCallReview()
    const judged: string[][] = []
    const judgeReport: CallReview["judgeReport"] = (report) => {
      judged.push(report.sections.flatMap((section) => section.blocks.map((block) => block.kind)))
      return review.judgeReport(report)
    }

    const reply = await callTool(
      workServer([], [], { ...review, judgeReport }, [], BODY_FENCE_WORK_MODE),
      "report",
      { ...draft, body: "架空の文\n```graph\nA -> B: 渡す\n```\n```code\nx\n```" },
    )

    expect(reply.isError).toBe(false)
    expect(reply.endsTurn).toBe(true)
    expect(judged).toEqual([["markdown", "graph", "code"]])
  })

  it("sections だけなら従来どおり通す", async () => {
    const reply = await callTool(bodyFenceServer(), "report", { ...draft, sections: SECTIONS })

    expect(reply.isError).toBe(false)
    expect(reply.endsTurn).toBe(true)
  })

  it("body と sections を併記したら、判定せずに差し戻す", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(bodyFenceServer(events), "report", {
      ...draft,
      body: "架空の本文",
      sections: SECTIONS,
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
    expect(reply.text).toContain("併記できない")
    expect(reply.text).not.toContain("架空の本文")
    expect(events).toEqual([])
  })

  it("body-fence の版でも、崩れた sections は json-schema の版と同じに差し戻す", async () => {
    const reply = await callTool(bodyFenceServer(), "report", {
      ...draft,
      sections: [{ blocks: [{ kind: "text" }] }],
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("Input validation error: Invalid arguments for tool report")
  })
})

const TOOLS_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(z.object({ name: z.string(), inputSchema: z.unknown() })),
  }),
})

const PROPERTIES = z.object({
  properties: z.record(z.string(), z.object({ description: z.string().optional() })),
})

async function listedProperties(server: ReturnType<typeof workServer>) {
  return PROPERTIES.parse(await listedInputSchema(server)).properties
}

async function listedInputSchema(server: ReturnType<typeof workServer>): Promise<unknown> {
  const reply = await mcpRequest(server, "tools/list", {}, TOOLS_REPLY)
  const report = reply.result.tools.find((tool) => tool.name === "report")
  if (report === undefined) {
    throw new Error("report が載っていない")
  }
  return report.inputSchema
}
