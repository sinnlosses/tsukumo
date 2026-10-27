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
import { fetchReportDefinition } from "./tools-list-reply.ts"

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
  const report = await fetchReportDefinition(reportSchema)
  const { properties } = INPUT_SCHEMA.parse(report.inputSchema)
  return {
    schema: JSON.stringify(report.inputSchema).length,
    description: report.description?.length ?? 0,
    properties: Object.entries(properties)
      .map(([name, value]) => [name, JSON.stringify(value).length] as const)
      .toSorted((a, b) => b[1] - a[1]),
  }
}
