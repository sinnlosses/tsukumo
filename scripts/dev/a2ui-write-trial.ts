// `report` の `a2ui` の変種を、素の環境の `claude -p`（Sonnet）に書かせて通過率とツール定義の字数を測る。
// 1 件ごとに <out>/<条件>.json へ結果を書き、あれば飛ばす。出力の全文は <out> にだけ残り、リポジトリには入れない。
// 使い方:
//   node scripts/dev/a2ui-write-trial.ts --dry-run
//   node scripts/dev/a2ui-write-trial.ts --out /tmp/a2ui-trial/runs [--only A-T1]
//   node scripts/dev/a2ui-write-trial.ts --out /tmp/a2ui-trial/runs --summary
// 題材は架空のものだけを渡す。実物の会話は渡さない。

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { buildReportCatalogDocument } from "../../src/shared/report/a2ui-report-catalog.ts"
import { replayEnvironment } from "../shared/claude-environment.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  type ChoiceResult,
  choiceTrialConditions,
  guideClause,
  summarizeChoice,
} from "./lib/a2ui-choice-trial.ts"
import { isControlTopic, isNeutralTopic, requestFor } from "./lib/a2ui-trial-topic.ts"
import {
  type CaseBase,
  type CaseResult,
  catalogCard,
  judgeOutput,
  type Judgement,
  type Loading,
  requestedCards,
  summarizeCases,
  systemPromptFor,
  systemPromptWithExample,
  toolDefinitionChars,
  trialConditions,
  type TrialCondition,
} from "./lib/a2ui-write-trial.ts"

const CLAUDE_TIMEOUT_MS = 300_000
const CONCURRENCY = 4
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const FIXTURE_DIRECTORY = path.join(REPOSITORY_ROOT, "fixture/fake-session")
const PLAIN_EXAMPLE_FILE = "a2ui-sections-sample.json"
const CONTROL_EXAMPLE_FILE = "a2ui-interactive-sample.json"
const CARD_EXAMPLE_FILES = [
  PLAIN_EXAMPLE_FILE,
  CONTROL_EXAMPLE_FILE,
  "a2ui-row-card-decision.json",
  "a2ui-row-card-status.json",
] as const

const faultSchema = z.object({
  source: z.enum(["schema", "structure"]),
  code: z.string(),
})

const storedResultSchema = z.object({
  id: z.string(),
  loading: z.enum(["full", "names", "mixed"]),
  pulledCards: z.number().optional(),
  topic: z.enum(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "N1", "N2", "N3", "N4"]),
  guide: z.enum(["none", "declare", "decide"]).optional(),
  componentNames: z.array(z.string()).optional(),
  sections: z.number(),
  firstFaults: z.array(faultSchema),
  firstSectionCount: z.number(),
  retryFaults: z.array(faultSchema).optional(),
  usedControls: z.boolean(),
  calls: z.number(),
  outputs: z.array(z.string()).optional(),
})

async function main(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: "string" },
      only: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "dry-run": { type: "boolean" },
      summary: { type: "boolean" },
    },
  })
  if (values["dry-run"] === true) {
    printToolDefinitions()
    process.stdout.write(
      `条件 ${String(trialConditions().length)} 件、部品の選びの条件 ${String(choiceTrialConditions().length)} 件\n`,
    )
    return 0
  }
  if (values.out === undefined) {
    process.stderr.write(
      "使い方: node scripts/dev/a2ui-write-trial.ts --out <dir> [--only <接頭辞>] [--model <名>] [--effort <段>] [--summary] | --dry-run\n",
    )
    return 2
  }
  mkdirSync(values.out, { recursive: true })
  if (values.summary === true) {
    printSummary(values.out)
    return 0
  }
  const only = values.only ?? ""
  const pending = [...trialConditions(), ...choiceTrialConditions()].filter((entry) =>
    entry.id.startsWith(only),
  )
  return runPool(values.out, pending, { model: values.model ?? "sonnet", effort: values.effort })
}

type Writer = { readonly model: string; readonly effort: string | undefined }

async function runPool(
  out: string,
  conditions: readonly TrialCondition[],
  writer: Writer,
): Promise<number> {
  const queue = [...conditions]
  let failure = ""
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined && failure === ""; next = queue.shift()) {
      const file = path.join(out, `${next.id}.json`)
      if (existsSync(file)) {
        continue
      }
      try {
        const done = await runCase(next, writer)
        writeFileSync(file, JSON.stringify({ ...done.result, outputs: done.outputs }))
        process.stdout.write(
          `${next.id}: ${done.result.firstFaults.length === 0 ? "一発" : "差し戻し"}\n`,
        )
      } catch (error) {
        failure = `${next.id}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  if (failure !== "") {
    process.stderr.write(`止めた: ${failure}\n`)
    return 1
  }
  return 0
}

async function runCase(
  entry: TrialCondition,
  writer: Writer,
): Promise<{
  readonly result: CaseResult
  readonly outputs: readonly string[]
}> {
  const examples = readExamples()
  const system = entry.withExample
    ? systemPromptWithExample(
        entry.loading,
        isControlTopic(entry.topic) ? examples.control : examples.plain,
      )
    : systemPromptFor(entry.loading)
  const clause = guideClause(entry.guide)
  const request = `${requestFor(entry.topic, entry.sections, true)}${clause}`
  const first = await writeOnce(writer, entry.loading, system, request, examples.cardSources)
  const firstJudgement = judgeOutput(first.text)
  if (firstJudgement.faults.length === 0) {
    return {
      result: firstPassResult(entry, firstJudgement, first),
      outputs: [first.text],
    }
  }
  const retryUser = [
    first.context.replace(request, `${requestFor(entry.topic, entry.sections, false)}${clause}`),
    "前回の出力:",
    first.text,
    "差し戻し:",
    firstJudgement.retryText,
    "直して components を全部書き直し、JSON の配列だけを出力する。",
  ].join("\n\n")
  const retry = await ask(writer, system, retryUser)
  const retryJudgement = judgeOutput(retry)
  return {
    result: retriedResult(entry, firstJudgement, retryJudgement, {
      ...first,
      calls: first.calls + 1,
    }),
    outputs: [first.text, retry],
  }
}

/** 最初の書き出し。`names` は、引かれた部品の文法カードを返して書き直させる（`report_part_card` の代役）。 */
async function writeOnce(
  writer: Writer,
  loading: Loading,
  system: string,
  request: string,
  cardSources: readonly unknown[],
): Promise<WrittenOnce> {
  const reply = await ask(writer, system, request)
  if (loading === "full") {
    return { text: reply, calls: 1, context: request, pulledCards: 0 }
  }
  const names = requestedCards(reply)
  if (names.length === 0) {
    return { text: reply, calls: 1, context: request, pulledCards: 0 }
  }
  const document = buildReportCatalogDocument()
  const cards = names.map((name) => catalogCard(name, document, exampleOf(name, cardSources)).text)
  const context = `${request}\n\n引いた文法カード:\n${cards.join("\n")}`
  return { text: await ask(writer, system, context), calls: 2, context, pulledCards: names.length }
}

type WrittenOnce = {
  readonly text: string
  readonly calls: number
  readonly context: string
  readonly pulledCards: number
}

function caseBaseOf(entry: TrialCondition, first: Judgement, written: WrittenOnce): CaseBase {
  return {
    id: entry.id,
    loading: entry.loading,
    topic: entry.topic,
    sections: entry.sections,
    firstFaults: first.faults,
    firstSectionCount: first.sectionCount,
    usedControls: first.usedControls,
    calls: written.calls,
    pulledCards: written.pulledCards,
    guide: entry.guide,
    componentNames: first.componentNames,
  }
}

function firstPassResult(
  entry: TrialCondition,
  first: Judgement,
  written: WrittenOnce,
): CaseResult {
  return { ...caseBaseOf(entry, first, written), retry: "none" }
}

function retriedResult(
  entry: TrialCondition,
  first: Judgement,
  retry: Judgement,
  written: WrittenOnce,
): CaseResult {
  return {
    ...caseBaseOf(entry, first, written),
    retry: "unmeasured",
    retryFaults: retry.faults,
  }
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

function readExamples(): {
  readonly plain: readonly unknown[]
  readonly control: readonly unknown[]
  readonly cardSources: readonly unknown[]
} {
  return {
    plain: componentsOf(PLAIN_EXAMPLE_FILE),
    control: componentsOf(CONTROL_EXAMPLE_FILE),
    cardSources: CARD_EXAMPLE_FILES.flatMap(componentsOf),
  }
}

function componentsOf(file: string): readonly unknown[] {
  const session: unknown = JSON.parse(readFileSync(path.join(FIXTURE_DIRECTORY, file), "utf8"))
  const parsed = z
    .object({ steps: z.array(z.object({ event: z.record(z.string(), z.unknown()) })) })
    .parse(session)
  const report = parsed.steps
    .map((step) => step.event)
    .find((event) => event["kind"] === "report" && Array.isArray(event["components"]))
  const components = report?.["components"]
  return Array.isArray(components) ? components : []
}

function exampleOf(name: string, cardSources: readonly unknown[]): unknown {
  return cardSources.find(
    (component) =>
      typeof component === "object" &&
      component !== null &&
      "component" in component &&
      component.component === name,
  )
}

function printToolDefinitions(): void {
  const labels = {
    full: "A 全部載せ",
    names: "B 名前の列挙＋引く口",
    mixed: "C 混ぜる形",
  } as const
  for (const loading of ["full", "names", "mixed"] as const) {
    const chars = toolDefinitionChars(loading)
    process.stdout.write(
      `ツール定義の字数 ${labels[loading]}:${String(chars.total)}（文法カード 平均 ${String(chars.cardAverage)}・最大 ${String(chars.cardMax)}）\n`,
    )
  }
}

function printSummary(out: string): void {
  const storedResults = readdirSync(out)
    .filter((file) => file.endsWith(".json"))
    .map((file) => storedResultSchema.parse(JSON.parse(readFileSync(path.join(out, file), "utf8"))))
  const charsById = new Map(storedResults.map((stored) => [stored.id, stored.outputs?.[0]?.length]))
  const results = storedResults.map((stored): CaseResult => {
    const base: CaseBase = {
      id: stored.id,
      loading: stored.loading,
      topic: stored.topic,
      sections: stored.sections,
      firstFaults: stored.firstFaults,
      firstSectionCount: stored.firstSectionCount,
      usedControls: stored.usedControls,
      calls: stored.calls,
      pulledCards: stored.pulledCards ?? 0,
      guide: stored.guide ?? "none",
      componentNames: stored.componentNames ?? [],
    }
    if (stored.retryFaults === undefined) {
      return { ...base, retry: "none" }
    }
    const firstChars = stored.outputs?.[0]?.length
    const retryChars = stored.outputs?.[1]?.length
    return firstChars === undefined || retryChars === undefined
      ? { ...base, retry: "unmeasured", retryFaults: stored.retryFaults }
      : { ...base, retry: "measured", retryFaults: stored.retryFaults, firstChars, retryChars }
  })
  printToolDefinitions()
  process.stdout.write(`最初の呼び出し ${String(results.length)} 件\n`)
  process.stdout.write(
    "載せ方\t題材\t件数\t一発\t直った\t直らない\t節の数の一致\tpath の整合の違反\t操作を使った\t呼び出し\tカードを引かずに書いた\tそのうち落ちた\t再試行が起きた件数\t再試行の呼び出し\t最初の出力の平均字数\t出し直しの平均字数\t出し直し/最初\t理由の内訳\n",
  )
  for (const row of summarizeCases(results.filter((result) => !isNeutralTopic(result.topic)))) {
    process.stdout.write(
      [
        row.loading,
        row.controls,
        row.count,
        row.firstPass,
        row.fixed,
        row.unfixed,
        row.sectionMatch,
        row.pathFaults,
        row.usedControls,
        row.calls,
        row.unpulled,
        row.unpulledFaults,
        row.retried,
        row.retryCalls,
        ...(row.measured
          ? [
              row.firstCharsAverage,
              row.retryCharsAverage,
              (row.retryCharsAverage / row.firstCharsAverage).toFixed(2),
            ]
          : ["-", "-", "-"]),
        row.reasons,
      ].join("\t") + "\n",
    )
  }
  printChoiceSummary(
    results
      .filter((result) => isNeutralTopic(result.topic))
      .map((result) => ({ ...result, firstChars: charsById.get(result.id) })),
  )
}

function printChoiceSummary(results: readonly ChoiceResult[]): void {
  if (results.length === 0) {
    return
  }
  process.stdout.write("\n部品の選び（形を指定しない題材）\n")
  process.stdout.write(
    "手引き\t件数\t配列として読めた\t一発\tTable を使った\t配置の部品を使った\t図・数の部品を使った\t部品の種類の平均\t最初の出力の平均字数\n",
  )
  for (const row of summarizeChoice(results)) {
    process.stdout.write(
      [
        row.guide,
        row.count,
        row.readable,
        row.firstPass,
        row.table,
        row.layout,
        row.figure,
        row.kinds,
        row.chars,
      ].join("\t") + "\n",
    )
  }
}

process.exitCode = await main(process.argv.slice(2))
