// 架空の依頼を、`report` の規約の版2つで本物の SDK の駆動に書かせ、版を比べる対の材料を作る入口。
// 揃った対は疑似セッションの場面にして撮り、左右に並べた HTML 1枚と選択のひな形を書く。左右と版の対応は pairs.json だけに書く。
// 出力はリポジトリの外に置く。標準出力に出すのは依頼の ID・版・受け付けたか・差し戻しの理由の名前・秒数だけ。
//
// 使い方:
//   node scripts/runtime/variant-pair.ts
//   node scripts/runtime/variant-pair.ts --limit 1 --writer-model haiku --out-dir /tmp/variant-pair-check

import { execFile } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import process from "node:process"
import { parseArgs, promisify } from "node:util"

import {
  REPORT_SCHEMA_VARIANTS,
  type ReportSchemaVariant,
} from "../../src/server/core/schema-variant.ts"
import { isModelAlias, MODEL_ALIASES, type ModelAlias } from "../../src/shared/command.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { choiceTemplate, pairPage, pairScene, sideOf } from "./variant-pair-page.ts"
import { VARIANT_REQUESTS } from "./variant-request.ts"
import { type ReportWriter, writeVariantReport, type WrittenReport } from "./variant-writer.ts"

const USAGE = `使い方:
  node scripts/runtime/variant-pair.ts [--out-dir <dir>] [--variants <版>,<版>] [--writer-model <名前>] [--limit <n>]
    --out-dir       出力先（既定 /tmp/variant-pair/<今日の日付>。リポジトリの外）
    --variants      比べる版 2 つ（既定 json-schema,body-fence。${REPORT_SCHEMA_VARIANTS.join("・")} から違う 2 つ）
    --writer-model  書き手のモデル（既定 opus。${MODEL_ALIASES.join("・")}）
    --limit         先頭から n 本だけ書かせる（確かめ用）`

/** 受け付けた `report` が来なかったときに書き直させる回数。 */
const REWRITE_LIMIT = 2

/** 利用者に選んでもらう対の数。これに届かなければ終了コード 1。 */
const PAIRS_TO_CHOOSE = 20

const CAPTURE_VIEW_SCRIPT = join(REPOSITORY_ROOT, "scripts/capture/capture-view.ts")
const SHOT_SIZE = "900x2400"
const SHOT_TIMEOUT_MILLISECONDS = 180_000

/** 場面の前に流す `session-info`。版もモデルも画に出さない。 */
const OPENING_SESSION_INFO = {
  kind: "session-info",
  sessionId: "variant-pair",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
  skillNames: [],
  agentNames: [],
} as const satisfies SessionEvent

const runFile = promisify(execFile)

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

/** 依頼の ID と版（`reportKey`）から引ける、届いた `report`。 */
type WrittenReports = ReadonlyMap<string, ReportEvent>

type PairOptions = {
  readonly outDir: string
  readonly variants: readonly [ReportSchemaVariant, ReportSchemaVariant]
  readonly writerModel: ModelAlias
  readonly limit: number
}

type MissingReport = {
  readonly requestId: string
  readonly variant: ReportSchemaVariant
  readonly attempts: number
  readonly why: Extract<WrittenReport, { readonly kind: "missing" }>["why"]
}

const options = readOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}
const writtenReports = await writePairs(options)
const shotPairIds = await shootPairs(options, writtenReports)
if (shotPairIds.length < PAIRS_TO_CHOOSE) {
  process.stderr.write(`対が ${String(shotPairIds.length)} しか揃わなかった\n`)
  process.exit(1)
}

/** 依頼ごとに2版を書かせ、届いた `report` を書き出して、依頼の ID と版から引ける形で返す。 */
async function writePairs(pairOptions: PairOptions): Promise<WrittenReports> {
  const reports = new Map<string, ReportEvent>()
  const reportsDir = join(pairOptions.outDir, "reports")
  mkdirSync(reportsDir, { recursive: true })
  const writer: ReportWriter = {
    model: pairOptions.writerModel,
    workRoot: join(pairOptions.outDir, "work"),
    inheritedEnv: process.env,
    claudeConfigDir: process.env["CLAUDE_CONFIG_DIR"],
  }
  const missing: MissingReport[] = []
  for (const request of VARIANT_REQUESTS.slice(0, pairOptions.limit)) {
    for (const variant of pairOptions.variants) {
      const written = await writeWithRewrites(request, variant, writer)
      if (written.result.kind === "report") {
        writeJson(join(reportsDir, `${request.id}-${variant}.json`), written.result.event)
        reports.set(reportKey(request.id, variant), written.result.event)
      } else {
        missing.push({
          requestId: request.id,
          variant,
          attempts: written.attempts,
          why: written.result.why,
        })
      }
    }
  }
  writeJson(join(pairOptions.outDir, "missing.json"), missing)
  process.stdout.write(`書いた先: ${pairOptions.outDir}（欠け ${String(missing.length)}）\n`)
  return reports
}

/**
 * 両版が揃った依頼を対にし、左右の場面を撮って、HTML・左右と版の対応・選択のひな形を書く。
 * 撮れなかった側がある対は並べない。並べた対の ID を返す。
 */
async function shootPairs(
  pairOptions: PairOptions,
  reports: WrittenReports,
): Promise<readonly string[]> {
  const sessionDir = join(pairOptions.outDir, "session")
  const shotsDir = join(pairOptions.outDir, "shots")
  mkdirSync(sessionDir, { recursive: true })
  mkdirSync(shotsDir, { recursive: true })

  const pairs = VARIANT_REQUESTS.flatMap((request) => {
    const [firstVariant, secondVariant] = pairOptions.variants
    const first = reports.get(reportKey(request.id, firstVariant))
    const second = reports.get(reportKey(request.id, secondVariant))
    if (first === undefined || second === undefined) {
      return []
    }
    const leftIsFirst = sideOf(request.id) === "first"
    return [
      {
        pairId: request.id,
        requestText: request.text,
        left: leftIsFirst
          ? { variant: firstVariant, event: first }
          : { variant: secondVariant, event: second },
        right: leftIsFirst
          ? { variant: secondVariant, event: second }
          : { variant: firstVariant, event: first },
      },
    ]
  })
  const scenes = pairs.flatMap((pair) => [
    pairScene(pair.pairId, "left", pair.left.event),
    pairScene(pair.pairId, "right", pair.right.event),
  ])
  for (const scene of scenes) {
    writeJson(join(sessionDir, `${scene.name}.json`), scene)
  }
  const indexPath = join(sessionDir, "index.json")
  writeJson(indexPath, {
    opening: [{ afterMs: 0, event: OPENING_SESSION_INFO }],
    turns: scenes.map((scene) => scene.name),
  })

  const shot: string[] = []
  for (const pair of pairs) {
    const left = await shootScene(indexPath, `${pair.pairId}-left`, shotsDir)
    const right = await shootScene(indexPath, `${pair.pairId}-right`, shotsDir)
    if (left && right) {
      shot.push(pair.pairId)
    }
  }
  const shownPairs = pairs.filter((pair) => shot.includes(pair.pairId))

  writeFileSync(
    join(pairOptions.outDir, "index.html"),
    pairPage(shownPairs.map((pair) => ({ pairId: pair.pairId, requestText: pair.requestText }))),
  )
  writeJson(
    join(pairOptions.outDir, "pairs.json"),
    Object.fromEntries(
      shownPairs.map((pair) => [
        pair.pairId,
        { requestId: pair.pairId, left: pair.left.variant, right: pair.right.variant },
      ]),
    ),
  )
  writeJson(join(pairOptions.outDir, "choices.json"), choiceTemplate(shot))
  process.stdout.write(
    `並べた対: ${String(shot.length)}（${join(pairOptions.outDir, "index.html")}）\n`,
  )
  return shot
}

/** 場面1つを撮る。撮れなかったら標準エラーに場面の名前だけ出して `false`。 */
async function shootScene(indexPath: string, scene: string, shotsDir: string): Promise<boolean> {
  try {
    await runFile(
      "node",
      [
        CAPTURE_VIEW_SCRIPT,
        "--session",
        indexPath,
        "--scene",
        scene,
        "--size",
        SHOT_SIZE,
        "--out",
        join(shotsDir, `${scene}.png`),
      ],
      { cwd: REPOSITORY_ROOT, timeout: SHOT_TIMEOUT_MILLISECONDS },
    )
    return true
  } catch {
    process.stderr.write(`撮れなかった: ${scene}\n`)
    return false
  }
}

function reportKey(requestId: string, variant: ReportSchemaVariant): string {
  return `${requestId}-${variant}`
}

async function writeWithRewrites(
  request: (typeof VARIANT_REQUESTS)[number],
  variant: ReportSchemaVariant,
  writer: ReportWriter,
): Promise<{ readonly result: WrittenReport; readonly attempts: number }> {
  const attempt = async (count: number): Promise<{ result: WrittenReport; attempts: number }> => {
    const result = await writeVariantReport(request, variant, writer)
    process.stdout.write(`${attemptLine(request.id, variant, count, result)}\n`)
    if (result.kind === "report" || count > REWRITE_LIMIT) {
      return { result, attempts: count }
    }
    return attempt(count + 1)
  }
  return attempt(1)
}

function attemptLine(
  requestId: string,
  variant: ReportSchemaVariant,
  count: number,
  result: WrittenReport,
): string {
  const outcome = result.kind === "report" ? "受け付けた" : `来なかった（${result.why}）`
  const rejected =
    result.rejectedReasons.length === 0 ? "" : ` 差し戻し: ${result.rejectedReasons.join(",")}`
  return `${requestId} ${variant} ${String(count)}回目 ${outcome} ${String(result.seconds)}秒${rejected}`
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`)
}

function readOptions(argv: readonly string[]): PairOptions | "invalid" {
  const parsed = parseArgsSafely(argv)
  if (parsed === "invalid") {
    return "invalid"
  }
  const outDir = resolve(
    parsed["out-dir"] ?? join("/tmp/variant-pair", Temporal.Now.plainDateISO().toString()),
  )
  const variants = readVariants(parsed.variants ?? "json-schema,body-fence")
  const writerModel = parsed["writer-model"] ?? "opus"
  const limit = readLimit(parsed.limit)
  if (
    isInsideRepository(outDir) ||
    variants === "invalid" ||
    !isModelAlias(writerModel) ||
    limit === "invalid"
  ) {
    return "invalid"
  }
  return { outDir, variants, writerModel, limit }
}

function parseArgsSafely(argv: readonly string[]):
  | {
      readonly "out-dir": string | undefined
      readonly variants: string | undefined
      readonly "writer-model": string | undefined
      readonly limit: string | undefined
    }
  | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        "out-dir": { type: "string" },
        variants: { type: "string" },
        "writer-model": { type: "string" },
        limit: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    })
    return {
      "out-dir": values["out-dir"],
      variants: values.variants,
      "writer-model": values["writer-model"],
      limit: values.limit,
    }
  } catch {
    return "invalid"
  }
}

function readVariants(
  text: string,
): readonly [ReportSchemaVariant, ReportSchemaVariant] | "invalid" {
  const names = text.split(",").map((name) => name.trim())
  const variants = names.map((name) => REPORT_SCHEMA_VARIANTS.find((variant) => variant === name))
  const [first, second] = variants
  if (variants.length !== 2 || first === undefined || second === undefined || first === second) {
    return "invalid"
  }
  return [first, second]
}

function readLimit(text: string | undefined): number | "invalid" {
  if (text === undefined) {
    return VARIANT_REQUESTS.length
  }
  const limit = Number(text)
  return Number.isInteger(limit) && limit > 0 ? limit : "invalid"
}

function isInsideRepository(path: string): boolean {
  const fromRoot = relative(REPOSITORY_ROOT, path)
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
}
