// 実際の吹き出しを1行ずつ描き、各行が端末で実際に何カラムで終わるかを実測する。
// 崩れている行を特定するのが目的。文章は出さず、行番号と桁数だけを出す。
// 素のターミナルで実行すること: bun run scripts/probe-balloon-rows.ts <transcript.jsonl>
import { readFileSync } from "node:fs"
import process from "node:process"

import { buildBalloon } from "../src/balloon.ts"
import { extractLatestUtterance } from "../src/transcript.ts"

const path = process.argv[2]
if (path === undefined || !process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write(
    "使い方: 素のターミナルで bun run scripts/probe-balloon-rows.ts <transcript.jsonl>\n",
  )
  process.exit(2)
}

const paneWidth = process.stdout.columns
const utterance = extractLatestUtterance(readFileSync(path, "utf8"))
const rows = buildBalloon(utterance, paneWidth)

process.stdin.setRawMode(true)
process.stdin.resume()

function parseColumn(response: string): number | undefined {
  const end = response.indexOf("R")
  const separator = response.lastIndexOf(";", end)
  if (end < 0 || separator < 0) return undefined
  const column = Number(response.slice(separator + 1, end))
  return Number.isFinite(column) ? column : undefined
}

function cursor(): Promise<{ readonly row: number; readonly column: number }> {
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const text = String(chunk)
      const end = text.indexOf("R")
      const separator = text.lastIndexOf(";", end)
      const start = text.lastIndexOf("[", separator)
      const column = parseColumn(text)
      if (column !== undefined && start >= 0) {
        process.stdin.off("data", onData)
        resolve({ row: Number(text.slice(start + 1, separator)), column })
      }
    }
    process.stdin.on("data", onData)
    process.stdout.write("\x1b[6n")
  })
}

const report: string[] = []
for (const [index, row] of rows.entries()) {
  process.stdout.write("\r\x1b[K")
  const before = await cursor()
  process.stdout.write(row)
  const after = await cursor()
  // 行が折り返されていれば after.row が進む
  const wrapped = after.row - before.row
  const rendered =
    wrapped > 0 ? `${wrapped}行に折り返し (末尾桁 ${after.column})` : `${after.column - 1}桁`
  report.push(`  行${String(index + 1).padStart(2)}  実測 ${rendered}`)
  process.stdout.write("\r\x1b[K")
}

process.stdin.setRawMode(false)
process.stdin.pause()

console.log(`端末幅 (process.stdout.columns): ${paneWidth}`)
console.log(`吹き出しの行数: ${rows.length}`)
console.log("各行の実測:")
for (const line of report) console.log(line)
console.log("\nすべての行が同じ桁数（＝端末幅）なら balloon.ts は正しく、崩れは描画側。")
console.log("特定の行だけ「折り返し」と出たら、その行が幅を超えている。")
