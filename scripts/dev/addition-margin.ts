// 部品を足す前に、落ちうる 3 つの上限（常設文章の字数・report の引数の schema の字数・大きなファイルのトークン）の余白を出す。
// 使い方: node scripts/dev/addition-margin.ts
// 出力: <名前>\t<いま>\t<上限>\t<残り> を 1 行ずつ。終了コードは常に 0。

import { statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { z } from "zod"

import { mcpRequest } from "../../test/fixture/mcp-server.ts"
import { workServer } from "../../test/fixture/sdk-tool.ts"
import {
  REPORT_INPUT_SCHEMA_MAX_CHARS,
  SYSTEM_PROMPT_TEXTS,
  SYSTEM_PROMPT_TOTAL_LIMIT,
} from "../shared/addition-budget.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { countTokens } from "../shared/token-limit.ts"

const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(z.object({ name: z.string(), inputSchema: z.record(z.string(), z.unknown()) })),
  }),
})

const LARGE_FILES = [
  "scripts/dev/lib/a2ui-write-trial.ts",
  "test/browser/features/report/a2ui-surface.test.tsx",
] as const

const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_LIST_REPLY)
const schema = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema

const rows = [
  margin(
    "systemPrompt の規約 4 本の合計（字）",
    SYSTEM_PROMPT_TEXTS.reduce((sum, text) => sum + [...text].length, 0),
    SYSTEM_PROMPT_TOTAL_LIMIT,
  ),
  margin(
    "report の引数の schema（字）",
    JSON.stringify(schema).length,
    REPORT_INPUT_SCHEMA_MAX_CHARS,
  ),
  ...LARGE_FILES.map((path) => {
    const { tokens, limit } = countTokens(path, statSync(join(REPOSITORY_ROOT, path)).size)
    return margin(`${path}（トークン）`, tokens, limit)
  }),
]

process.stdout.write(rows.map((row) => `${row.join("\t")}\n`).join(""))

function margin(
  name: string,
  current: number,
  limit: number,
): readonly [string, number, number, number] {
  return [name, current, limit, limit - current]
}
