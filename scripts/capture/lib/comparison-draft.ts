// 2版（レポート版と HTML 版）の撮影の出力から、穴ドラフトの本文の下書きを組む。
// 本文の型は docs/architecture/display/block-criteria.md「穴ドラフトの本文の型」。

/** 1つの版を1つの幅で撮った結果。 */
export type VersionCapture =
  | {
      readonly kind: "captured"
      readonly image: string
      readonly overflow: number | undefined
      readonly length: number | undefined
    }
  | { readonly kind: "failed"; readonly reason: string }

export type WidthComparison = {
  readonly width: number
  readonly report: VersionCapture
  readonly html: VersionCapture
  /** レポート版の `--paper-metric` の表。撮れなかったときは undefined。 */
  readonly paperMetric: string | undefined
}

export type ComparisonDraftInput = {
  readonly topic: string
  readonly date: string
  readonly htmlPath: string
  readonly scene: string
  readonly session: string | undefined
  readonly widths: readonly WidthComparison[]
}

/** `横のはみ出し: <n>px` の数。読めなければ undefined。 */
export function readOverflow(stdout: string): number | undefined {
  return readNumber(stdout, /^横のはみ出し: (-?\d+)px$/mu)
}

/** `字数 <selector>: <n>` の数。`無し`・読めない行は undefined。 */
export function readTextLength(stdout: string): number | undefined {
  return readNumber(stdout, /^字数 .*: (\d+)$/mu)
}

/** `紙面の物差し` の見出し行から終わりまでを、表のまま返す。無ければ undefined。 */
export function readPaperMetricBlock(stdout: string): string | undefined {
  const start = stdout.search(/^紙面の物差し /mu)
  return start === -1 ? undefined : stdout.slice(start).trimEnd()
}

/** 穴ドラフトの本文の下書き。梯子の段・候補と採らない理由・足す基準の数は人が書く欄として空で出す。 */
export function formatDraft(input: ComparisonDraftInput): string {
  const lines = [
    "見比べで見つかった穴（梯子の段: （人が決める））。",
    "",
    `- 比べた題材と日付: ${input.topic}（${input.date}）`,
    `- Claude 側の部品: ${input.htmlPath}（HTML のどの部分かは人が書く）`,
    `- tsukumo で試した書き方: 場面 ${input.scene}${
      input.session === undefined ? "" : `（疑似セッション ${input.session}）`
    }`,
    "- 起きたこと:",
    ...input.widths.flatMap(formatWidth),
    "- 候補と採らない理由: （人が書く）",
    "- 足す基準の数: （人が書く）",
  ]
  return `${lines.join("\n")}\n`
}

function formatWidth(comparison: WidthComparison): readonly string[] {
  return [
    `  - 幅 ${String(comparison.width)}`,
    `    - レポート版: ${describeCapture(comparison.report)}`,
    `    - HTML 版: ${describeCapture(comparison.html)}`,
    ...(comparison.paperMetric === undefined
      ? []
      : ["    - レポート版の紙面の物差し:", ...indent(comparison.paperMetric, "      ")]),
  ]
}

function describeCapture(capture: VersionCapture): string {
  if (capture.kind === "failed") {
    return `撮れなかった（${capture.reason}）`
  }
  return `画像 ${capture.image} / 横のはみ出し ${describeNumber(capture.overflow, "px")} / 字数 ${describeNumber(capture.length, "")}`
}

function describeNumber(value: number | undefined, unit: string): string {
  return value === undefined ? "読めず" : `${String(value)}${unit}`
}

function indent(block: string, prefix: string): readonly string[] {
  return block.split("\n").map((line) => `${prefix}${line}`)
}

function readNumber(stdout: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(stdout)?.[1]
  return matched === undefined ? undefined : Number(matched)
}
