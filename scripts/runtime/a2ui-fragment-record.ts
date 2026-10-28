// `report`（a2ui の部品の配列を受ける）だけを持たせた本物の SDK を 1 ターン走らせ、`includePartialMessages` の断片を録る。
// 標準出力には種類・数・時刻・字数の表だけを出す。断片の本文は `--out` のファイル（既定は /tmp/a2ui-streaming/fragments.jsonl）にだけ書く。
// 依頼は架空のアプリの架空の事実だけ。
//
// 使い方:
//   node scripts/runtime/a2ui-fragment-record.ts [--model sonnet] [--out <パス>]

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk"
import { isPlainObject } from "remeda"
import { z } from "zod"

import { a2uiReportComponentSchema } from "../../src/shared/report/a2ui-report-catalog.ts"
import { summarizeFragments, type FragmentRow } from "./a2ui-fragment-summary.ts"

const DEFAULT_OUT = "/tmp/a2ui-streaming/fragments.jsonl"

const FICTIONAL_REQUEST = `架空の家計簿アプリ kakeibo-lite で、月の締めの合計が 1 円ずれる不具合を直した、という体で長めの報告を report で 1 回だけ呼んで書いて。
節は 8 つ、表は 2 つ、地の文は全部で 10 段落ほど。済んだこと: src/total.ts の丸めを切り捨てから銀行丸めに変えた。src/month.ts の締め日の判定と src/export.ts の書き出しも合わせて直した。
単体テスト 214 件が全部通り、ずれていた 3 か月分の合計が手計算と一致した。残る課題は小数第 3 位以下の通貨が無いことの確認と、為替の端数の扱い。
ツールで調べず、ここに書いた架空の事実だけで書く。`

/** 録った 1 行。本文 `text` は `--out` のファイルにだけ入る。 */
type RecordedLine = FragmentRow & { readonly text: string }

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: { model: { type: "string" }, out: { type: "string" } },
  })
  const out = values.out ?? DEFAULT_OUT
  const lines = await recordTurn(values.model ?? "sonnet")

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\n") + "\n")
  process.stdout.write(`${summarizeFragments(lines)}\n`)
}

async function recordTurn(model: string): Promise<readonly RecordedLine[]> {
  const server = createSdkMcpServer({
    name: "tsukumo",
    tools: [
      tool(
        "report",
        "報告を受け取る。components は部品の平らな配列。",
        { components: z.array(a2uiReportComponentSchema) },
        () => Promise.resolve({ content: [{ type: "text" as const, text: "ok" }] }),
      ),
    ],
  })
  const startedAt = Temporal.Now.instant().epochMilliseconds
  const lines: RecordedLine[] = []

  for await (const message of query({
    prompt: FICTIONAL_REQUEST,
    options: {
      model,
      cwd: "/tmp",
      includePartialMessages: true,
      permissionMode: "default",
      tools: [],
      mcpServers: { tsukumo: server },
      allowedTools: ["mcp__tsukumo__report"],
      maxTurns: 3,
    },
  })) {
    const atMs = Temporal.Now.instant().epochMilliseconds - startedAt
    if (message.type === "stream_event") {
      lines.push(fragmentLine(atMs, message.event))
    } else if (message.type === "assistant") {
      lines.push({ atMs, eventType: "assistant", deltaType: "", blockType: "", chars: 0, text: "" })
    }
  }
  return lines
}

function fragmentLine(atMs: number, event: unknown): RecordedLine {
  const record = isPlainObject(event) ? event : {}
  const delta = isPlainObject(record.delta) ? record.delta : {}
  const block = isPlainObject(record.content_block) ? record.content_block : {}
  const text =
    typeof delta.partial_json === "string"
      ? delta.partial_json
      : typeof delta.text === "string"
        ? delta.text
        : ""
  return {
    atMs,
    eventType: typeof record.type === "string" ? record.type : "",
    deltaType: typeof delta.type === "string" ? delta.type : "",
    blockType: typeof block.type === "string" ? block.type : "",
    chars: text.length,
    text,
  }
}

await main()
