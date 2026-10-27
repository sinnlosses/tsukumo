// `report` の定義を、モデルが見るのと同じ `tools/list` の応答から取る。

import process from "node:process"

import { z } from "zod"

import type { REPORT_SCHEMA_VARIANTS } from "../../src/server/core/schema-variant.ts"
import { tsukumoServer } from "../../src/server/session-driver/adapter/sdk-tool.ts"
import { createCallReview } from "../../src/server/session-driver/core/call-review.ts"

const TOOLS_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(
      z.object({ name: z.string(), description: z.string().optional(), inputSchema: z.unknown() }),
    ),
  }),
})

export type ReportDefinition = {
  readonly description: string | undefined
  readonly inputSchema: unknown
}

export async function fetchReportDefinition(
  reportSchema: (typeof REPORT_SCHEMA_VARIANTS)[number],
): Promise<ReportDefinition> {
  const server = tsukumoServer(
    [{ name: "default", label: "通常" }],
    { kind: "work", reportSchema, figurePreference: "chart" },
    createCallReview(),
    () => {},
    process.cwd(),
    () => {},
    () => {},
    () => true,
  )
  const replies: unknown[] = []
  const transport: Parameters<typeof server.instance.connect>[0] = {
    start: async () => {},
    close: async () => {},
    send: async (message) => {
      replies.push(message)
    },
  }
  await server.instance.connect(transport)
  transport.onmessage?.({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
  const reply = await waitFor(replies)
  await server.instance.close()
  const report = reply.result.tools.find((tool) => tool.name === "report")
  if (report === undefined) {
    throw new Error(`${reportSchema} の tools/list に report が載っていない`)
  }
  return { description: report.description, inputSchema: report.inputSchema }
}

async function waitFor(replies: readonly unknown[]): Promise<z.output<typeof TOOLS_REPLY>> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const found = replies.find((reply) => TOOLS_REPLY.safeParse(reply).success)
    if (found !== undefined) {
      return TOOLS_REPLY.parse(found)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("tools/list の応答が届かなかった")
}
