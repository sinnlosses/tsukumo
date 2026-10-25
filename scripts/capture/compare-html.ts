// HTML 版とレポート版を同じ幅で続けて撮り、穴ドラフトの本文の下書きを標準出力に出す。
// 撮るのは `--text-length` と `--paper-metric` を足した撮影の道具に任せる。ドラフトの課題は積まない（採否は人が決める）。
//
// 使い方:
//   node scripts/capture/compare-html.ts --html /tmp/page.html --scene <場面> \
//     --topic <題材名> --date <YYYY-MM-DD> [--session <ファイル>] [--widths 390,1400] [--out-dir <dir>]
//
// 画像は会話の内容が写るので、既定の出力先は /tmp（リポジトリに置かない）。
// 疑似セッションの架空の会話と、Claude に書かせた架空の題材だけを渡す。

import { execFile } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import { parseArgs, promisify } from "node:util"

import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { MAIN_REGION_SELECTOR } from "./lib/capture-page.ts"
import {
  formatDraft,
  readOverflow,
  readPaperMetricBlock,
  readTextLength,
  type VersionCapture,
  type WidthComparison,
} from "./lib/comparison-draft.ts"

const DEFAULT_WIDTHS = [390, 1400] as const
const WINDOW_HEIGHT = 900
const DEFAULT_OUT_DIR = "/tmp/html-comparison"
const CAPTURE_TIMEOUT_MS = 180_000
const CAPTURE_VIEW = path.join(REPOSITORY_ROOT, "scripts/capture/capture-view.ts")

const USAGE = `使い方:
  node scripts/capture/compare-html.ts --html <ファイル> --scene <場面> --topic <題材名> --date <YYYY-MM-DD>
    [--session <ファイル>] [--widths <幅,幅,…>（既定 ${DEFAULT_WIDTHS.join(",")}）] [--out-dir <dir>（既定 ${DEFAULT_OUT_DIR}）]
`

type Arguments = {
  readonly html: string
  readonly scene: string
  readonly topic: string
  readonly date: string
  readonly session: string | undefined
  readonly widths: readonly number[]
  readonly outDir: string
}

const execFileAsync = promisify(execFile)

async function main(argv: readonly string[]): Promise<number> {
  const given = readArguments(argv)
  if (given === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const widths: WidthComparison[] = []
  for (const width of given.widths) {
    widths.push(await compareAt(given, width))
  }
  process.stdout.write(
    formatDraft({
      topic: given.topic,
      date: given.date,
      htmlPath: given.html,
      scene: given.scene,
      session: given.session,
      widths,
    }),
  )
  return 0
}

/** 1つの幅で2版を続けて撮る。撮れなかった版は理由を残して続ける。 */
async function compareAt(given: Arguments, width: number): Promise<WidthComparison> {
  const size = `${String(width)}x${String(WINDOW_HEIGHT)}`
  const reportImage = path.join(given.outDir, `report-${String(width)}.png`)
  const htmlImage = path.join(given.outDir, `html-${String(width)}.png`)

  const report = await runCapture([
    "--scene",
    given.scene,
    ...(given.session === undefined ? [] : ["--session", given.session]),
    "--size",
    size,
    "--full",
    "--out",
    reportImage,
    "--text-length",
    MAIN_REGION_SELECTOR,
    "--paper-metric",
    "--viewport",
    size,
  ])
  const html = await runCapture([
    pathToFileURL(path.resolve(given.html)).href,
    "--size",
    size,
    "--full",
    "--out",
    htmlImage,
    "--text-length",
    "body",
  ])

  return {
    width,
    report: toVersionCapture(report, reportImage),
    html: toVersionCapture(html, htmlImage),
    paperMetric: report.kind === "ran" ? readPaperMetricBlock(report.stdout) : undefined,
  }
}

type CaptureRun =
  | { readonly kind: "ran"; readonly stdout: string }
  | { readonly kind: "failed"; readonly reason: string }

async function runCapture(args: readonly string[]): Promise<CaptureRun> {
  try {
    const { stdout } = await execFileAsync("node", [CAPTURE_VIEW, ...args], {
      cwd: REPOSITORY_ROOT,
      timeout: CAPTURE_TIMEOUT_MS,
    })
    return { kind: "ran", stdout }
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : ""
    const firstLine = stderr.split("\n").find((line) => line.trim() !== "")
    return {
      kind: "failed",
      reason: firstLine ?? (error instanceof Error ? error.message : String(error)),
    }
  }
}

function toVersionCapture(run: CaptureRun, image: string): VersionCapture {
  return run.kind === "failed"
    ? { kind: "failed", reason: run.reason }
    : {
        kind: "captured",
        image,
        overflow: readOverflow(run.stdout),
        length: readTextLength(run.stdout),
      }
}

/** 崩れた引数・足りない必須の引数・読めない幅や日付は undefined（呼び出し側が使い方を出す）。 */
function readArguments(argv: readonly string[]): Arguments | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      options: {
        html: { type: "string" },
        scene: { type: "string" },
        topic: { type: "string" },
        date: { type: "string" },
        session: { type: "string" },
        widths: { type: "string" },
        "out-dir": { type: "string" },
      },
    })
    const parsedWidths = values.widths
      ?.split(",")
      .map((value) => positiveIntegerArgument.safeParse(value))
    if (
      parsedWidths?.some((width) => !width.success) === true ||
      positionals.length > 0 ||
      values.html === undefined ||
      values.scene === undefined ||
      values.topic === undefined ||
      values.date === undefined ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(values.date)
    ) {
      return undefined
    }
    return {
      html: values.html,
      scene: values.scene,
      topic: values.topic,
      date: values.date,
      session: values.session === undefined ? undefined : path.resolve(values.session),
      widths:
        parsedWidths?.flatMap((width) => (width.success ? [width.data] : [])) ?? DEFAULT_WIDTHS,
      outDir: path.resolve(values["out-dir"] ?? DEFAULT_OUT_DIR),
    }
  } catch {
    return undefined
  }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
