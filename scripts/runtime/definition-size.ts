// `report` の定義（モデルに渡る JSON Schema とツール説明）と規約の字数を、`report-usage` の版ごとに出す。
// モデルが見るのと同じ `tools/list` の応答を取り、`inputSchema` を `JSON.stringify` した長さと、欄ごとの長さを数える。
//
// 使い方:
//   node scripts/runtime/definition-size.ts
// 出力: 版ごとに `<版>\tschema <字数>\tdescription <字数>` と、字数の多い順の欄ごとの行。最後に `prompt <字数>`。
// `report` が載っていないなど、数えられないときは標準エラーに理由を書いて終了コード1。

import process from "node:process"

import { z } from "zod"

import { REPORT_SCHEMA_VARIANTS } from "../../src/server/core/schema-variant.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/server/report/core/report-notation.ts"
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

const INPUT_SCHEMA = z.object({ properties: z.record(z.string(), z.unknown()) })

for (const reportSchema of REPORT_SCHEMA_VARIANTS) {
  const sizes = await measure(reportSchema)
  process.stdout.write(
    `${reportSchema}\tschema ${String(sizes.schema)}\tdescription ${String(sizes.description)}\n`,
  )
  for (const [name, chars] of sizes.properties) {
    process.stdout.write(`  ${name}\t${String(chars)}\n`)
  }
}
process.stdout.write(`prompt\t${String(REPORT_NOTATION_PROMPT.length)}\n`)

type Sizes = {
  readonly schema: number
  readonly description: number
  readonly properties: readonly (readonly [string, number])[]
}

async function measure(reportSchema: (typeof REPORT_SCHEMA_VARIANTS)[number]): Promise<Sizes> {
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
  const { properties } = INPUT_SCHEMA.parse(report.inputSchema)
  return {
    schema: JSON.stringify(report.inputSchema).length,
    description: report.description?.length ?? 0,
    properties: Object.entries(properties)
      .map(([name, value]) => [name, JSON.stringify(value).length] as const)
      .toSorted((a, b) => b[1] - a[1]),
  }
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
