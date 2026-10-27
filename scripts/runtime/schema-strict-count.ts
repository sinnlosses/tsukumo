// `report` の引数の JSON Schema が Structured Outputs の strict の枠に入るかを、`report-usage` の版ごとに静的に数える。
// API には登録せず、モデルが見るのと同じ `tools/list` の応答の `inputSchema` を歩く。
//
// 使い方:
//   node scripts/runtime/schema-strict-count.ts
// 出力: 版ごとに `<版>\t<項目>\t<数>\t枠 <枠>\t<入る|超える>[\t<位置>]` と、最後に `<版>\tVERDICT\t<入る|超える>\t<超えた項目>`。
// 数えられないときは標準エラーに理由を書いて終了コード1。

import process from "node:process"

import { REPORT_SCHEMA_VARIANTS } from "../../src/server/core/schema-variant.ts"
import { countStrictFit, exceededNames, type StrictCount } from "./strict-schema-fit.ts"
import { fetchReportDefinition } from "./tools-list-reply.ts"

try {
  for (const variant of REPORT_SCHEMA_VARIANTS) {
    const definition = await fetchReportDefinition(variant)
    process.stdout.write(render(variant, countStrictFit(definition.inputSchema)))
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

function render(variant: string, count: StrictCount): string {
  const recursive = count.recursivePaths.length > 0
  const lines = [
    ...count.items.map((item) => {
      const fit = item.count > item.limit ? "超える" : "入る"
      const where = item.paths.length > 0 ? `\t${item.paths.join(",")}` : ""
      return `${variant}\t${item.name}\t${String(item.count)}\t枠 ${String(item.limit)}\t${fit}${where}`
    }),
    `${variant}\t再帰\t${String(count.recursivePaths.length)}\t枠 0\t${recursive ? "超える" : "入る"}${recursive ? `\t${count.recursivePaths.join(",")}` : ""}`,
  ]
  const exceeded = exceededNames(count)
  lines.push(
    `${variant}\tVERDICT\t${exceeded.length > 0 ? "超える" : "入る"}\t${exceeded.join(",")}`,
  )
  return `${lines.join("\n")}\n`
}
