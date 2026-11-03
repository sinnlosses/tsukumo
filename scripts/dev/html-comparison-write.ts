// HTML 版とレポート版を、同じ題材・同じ書き手（素の環境の `claude -p`）に書かせ、撮影の道具が読む疑似セッションを組む。
// 撮るのは HTML 版とレポート版の撮影の糊（compare-html）に任せる。
// 使い方:
//   node scripts/dev/html-comparison-write.ts --topics <題材の json> --out /tmp/html-comparison/<日付> [--only <id>] [--model <名>] [--effort <段>]
// 題材は架空のものだけを渡す。実物の会話は渡さない。出力は <out> にだけ置き、リポジトリには入れない。

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { replayEnvironment } from "../shared/claude-environment.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  type ComparisonTopic,
  extractHtml,
  htmlSystemPrompt,
  judgeReport,
  parseTopics,
  type RejectionStage,
  reportScene,
  reportSystemPrompt,
  sessionIndexFor,
  writerRequest,
} from "./lib/html-comparison-write.ts"

const CLAUDE_TIMEOUT_MS = 600_000
const CONCURRENCY = 3
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const MAX_REPORT_CALLS = 4
const BASE_INDEX = path.join(REPOSITORY_ROOT, "fixture/fake-session/index.json")

const USAGE =
  "使い方: node scripts/dev/html-comparison-write.ts --topics <json> --out <dir> [--only <id>] [--model <名>（既定 opus）] [--effort <段>]\n"

type Writer = { readonly model: string; readonly effort: string | undefined }

const reportRecordSchema = z.object({
  accepted: z.boolean(),
  calls: z.number(),
  rejections: z.array(z.object({ stage: z.string(), codes: z.array(z.string()) })),
  components: z.array(z.unknown()),
  outputs: z.array(z.string()),
})

type ReportRecord = z.infer<typeof reportRecordSchema>

async function main(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      topics: { type: "string" },
      out: { type: "string" },
      only: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
    },
  })
  if (values.topics === undefined || values.out === undefined) {
    process.stderr.write(USAGE)
    return 2
  }
  const out = path.resolve(values.out)
  const topics = parseTopics(JSON.parse(readFileSync(values.topics, "utf8")))
  const only = values.only
  const pending = only === undefined ? topics : topics.filter((topic) => topic.id === only)
  const writer = { model: values.model ?? "opus", effort: values.effort }

  const failure = await runPool(out, pending, writer)
  writeSession(out, topics)
  printSummary(out, topics)
  if (failure !== "") {
    process.stderr.write(`止めた: ${failure}\n`)
    return 1
  }
  return 0
}

async function runPool(
  out: string,
  topics: readonly ComparisonTopic[],
  writer: Writer,
): Promise<string> {
  const queue = [...topics]
  let failure = ""
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined && failure === ""; next = queue.shift()) {
      try {
        await writeTopic(out, next, writer)
      } catch (error) {
        failure = `${next.id}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return failure
}

/** 1つの題材の2版を書かせる。書き終えた版のファイルがあれば飛ばす。 */
async function writeTopic(out: string, topic: ComparisonTopic, writer: Writer): Promise<void> {
  const directory = path.join(out, topic.id)
  mkdirSync(directory, { recursive: true })
  const htmlFile = path.join(directory, "page.html")
  const reportFile = path.join(directory, "report.json")
  await Promise.all([
    existsSync(htmlFile) ? Promise.resolve() : writeHtml(htmlFile, topic, writer),
    existsSync(reportFile) ? Promise.resolve() : writeReport(reportFile, topic, writer),
  ])
  process.stdout.write(`${topic.id}: 書いた\n`)
}

async function writeHtml(file: string, topic: ComparisonTopic, writer: Writer): Promise<void> {
  const reply = await ask(writer, htmlSystemPrompt(), writerRequest(topic))
  const html = extractHtml(reply)
  if (html === undefined) {
    throw new Error("HTML 版の出力に <html> が無い")
  }
  writeFileSync(file, html)
}

/** 本番と同じく差し戻しを書き手へ返して書き直させ、描ける一覧になるか上限まで回す。 */
async function writeReport(file: string, topic: ComparisonTopic, writer: Writer): Promise<void> {
  const system = reportSystemPrompt()
  const request = writerRequest(topic)
  let outputs: readonly string[] = []
  let rejections: ReportRecord["rejections"] = []
  let spent: ReadonlySet<RejectionStage> = new Set()
  let user = request
  for (let call = 1; call <= MAX_REPORT_CALLS; call += 1) {
    const reply = await ask(writer, system, user)
    outputs = [...outputs, reply]
    const judged = judgeReport(reply, spent)
    if (judged.kind === "accepted") {
      saveReport(file, {
        accepted: true,
        calls: call,
        rejections,
        components: [...judged.components],
        outputs: [...outputs],
      })
      return
    }
    rejections = [...rejections, { stage: judged.stage, codes: [...judged.codes] }]
    spent = judged.stage === "schema" ? spent : new Set([...spent, judged.stage])
    user = [
      request,
      "前回の出力:",
      reply,
      "差し戻し:",
      judged.retryText,
      "直して components を全部書き直し、JSON の配列だけを出力する。",
    ].join("\n\n")
  }
  saveReport(file, {
    accepted: false,
    calls: MAX_REPORT_CALLS,
    rejections,
    components: [],
    outputs: [...outputs],
  })
}

function saveReport(file: string, record: ReportRecord): void {
  writeFileSync(file, JSON.stringify(record, undefined, 2))
}

/** 描ける一覧になった題材だけを場面にし、<out>/session/ に索引と場面を置く。 */
function writeSession(out: string, topics: readonly ComparisonTopic[]): void {
  const directory = path.join(out, "session")
  mkdirSync(directory, { recursive: true })
  const drawn = topics.flatMap((topic) => {
    const record = readRecord(out, topic)
    return record?.accepted === true ? [{ topic, components: record.components }] : []
  })
  for (const { topic, components } of drawn) {
    writeFileSync(
      path.join(directory, `${topic.id}.json`),
      JSON.stringify(reportScene(topic, components), undefined, 2),
    )
  }
  const index = sessionIndexFor(
    JSON.parse(readFileSync(BASE_INDEX, "utf8")),
    drawn.map(({ topic }) => topic.id),
  )
  writeFileSync(path.join(directory, "index.json"), JSON.stringify(index, undefined, 2))
}

function printSummary(out: string, topics: readonly ComparisonTopic[]): void {
  for (const topic of topics) {
    const record = readRecord(out, topic)
    const html = existsSync(path.join(out, topic.id, "page.html")) ? "HTML あり" : "HTML なし"
    const report =
      record === undefined
        ? "レポート未"
        : `レポート ${record.accepted ? "描ける" : "描けない"}・呼び出し ${String(record.calls)} 回・差し戻し ${record.rejections.map((rejection) => `${rejection.stage}(${rejection.codes.join("/")})`).join(" ") || "なし"}`
    process.stdout.write(`${topic.id}: ${html}・${report}\n`)
  }
  process.stdout.write(`疑似セッションの索引: ${path.join(out, "session/index.json")}\n`)
}

function readRecord(out: string, topic: ComparisonTopic): ReportRecord | undefined {
  const file = path.join(out, topic.id, "report.json")
  return existsSync(file)
    ? reportRecordSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    : undefined
}

function ask(writer: Writer, system: string, user: string): Promise<string> {
  const effortArgs = writer.effort === undefined ? [] : ["--effort", writer.effort]
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      [
        "-p",
        "--model",
        writer.model,
        ...effortArgs,
        "--tools",
        "",
        "--disable-slash-commands",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--system-prompt",
        system,
        user,
      ],
      {
        env: replayEnvironment(process.env),
        timeout: CLAUDE_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error)
        } else {
          resolve(stdout)
        }
      },
    )
    child.stdin?.end()
  })
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
