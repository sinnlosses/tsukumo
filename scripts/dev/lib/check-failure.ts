// `pnpm run check` の重い段の結果から、落ちた段と落ちたテストを名指しする行を組み立てる。

import { relative } from "node:path"

export type StageOutcome = {
  readonly name: string
  readonly status: number
  /** `parseFailedTests` の結果。JSON が読めなかった段は空。 */
  readonly failedTests: readonly string[]
  /** 別の段が落ちたため、走っている途中で止めた段。 */
  readonly stopped: boolean
}

/**
 * 終わった段のどれかが自分で落ちたなら、走っている段のうち重い段だけを止める対象にする。
 * 数秒で終わる軽い段は止めず、落ちを1回の出力に並べる。
 */
export function pickStagesToStop<T extends { readonly heavy: boolean }>(
  running: readonly T[],
  finished: readonly StageOutcome[],
): readonly T[] {
  return shouldStopRunningStages(finished) ? running.filter((stage) => stage.heavy) : []
}

/**
 * 自分で落ちた段（止めた段を除く終了コードが 0 でない段）ごとに、段の名前と終了コードの1行と、
 * 続けて落ちたテストの `<段>: <ファイル> > <テスト名>` を1件1行で、入力の順に返す。
 * 止めた段があれば、最後に `止めた段: <段>, …` の1行を足す。
 */
export function describeFailedStages(outcomes: readonly StageOutcome[]): readonly string[] {
  const failed = outcomes
    .filter((outcome) => outcome.status !== 0 && !outcome.stopped)
    .flatMap((outcome) => [
      `${outcome.name} が終了コード ${outcome.status} で落ちた`,
      ...outcome.failedTests.map((test) => `${outcome.name}: ${test}`),
    ])
  const stopped = outcomes.filter((outcome) => outcome.stopped).map((outcome) => outcome.name)
  return stopped.length === 0 ? failed : [...failed, `止めた段: ${stopped.join(", ")}`]
}

/**
 * vitest の JSON レポーターの出力から、落ちたテストを `<ルートからの相対ファイル> > <テスト名>` の列にする。
 * 落ちたファイルに落ちたテストが無いとき（読み込みの失敗など）はファイル名だけの1行。
 * 読めない・形が違う JSON は空の列。
 */
export function parseFailedTests(json: string, root: string): readonly string[] {
  const report = parseJson(json)
  if (!isRecord(report) || !Array.isArray(report.testResults)) {
    return []
  }
  return report.testResults.flatMap((file: unknown): readonly string[] => {
    if (!isRecord(file) || file.status !== "failed" || typeof file.name !== "string") {
      return []
    }
    const path = relative(root, file.name)
    const titles = Array.isArray(file.assertionResults)
      ? file.assertionResults.flatMap((test: unknown): readonly string[] =>
          isRecord(test) && test.status === "failed" && typeof test.fullName === "string"
            ? [test.fullName]
            : [],
        )
      : []
    return titles.length === 0 ? [path] : titles.map((title) => `${path} > ${title}`)
  })
}

export type FailedFiles = {
  /** 落ちたファイルのルートからの相対パス。 */
  readonly files: readonly string[]
  /** レポートの `numFailedTests`。`--bail` が発火したかをこの数で見る。 */
  readonly failedTestCount: number
}

/**
 * vitest の JSON レポーターの出力から、落ちたファイルと落ちたテストの数を読む。
 * bail で打ち切られたファイルは `passed` と書かれるので、落ちたファイルには入らない。
 * 読めない・形が違う JSON は空の列と 0。
 */
export function parseFailedFiles(json: string, root: string): FailedFiles {
  const report = parseJson(json)
  if (!isRecord(report) || !Array.isArray(report.testResults)) {
    return { files: [], failedTestCount: 0 }
  }
  const files = report.testResults.flatMap((file: unknown): readonly string[] =>
    isRecord(file) && file.status === "failed" && typeof file.name === "string"
      ? [relative(root, file.name)]
      : [],
  )
  const failedTestCount = typeof report.numFailedTests === "number" ? report.numFailedTests : 0
  return { files, failedTestCount }
}

/** 止められた段は数えない。 */
function shouldStopRunningStages(finished: readonly StageOutcome[]): boolean {
  return finished.some((outcome) => outcome.status !== 0 && !outcome.stopped)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
