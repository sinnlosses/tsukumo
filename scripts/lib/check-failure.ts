// `pnpm run check` の重い段の結果から、落ちた段と落ちたテストを名指しする行を組み立てる。

import { relative } from "node:path"

export type StageOutcome = {
  readonly name: string
  readonly status: number
  /** `parseFailedTests` の結果。JSON が読めなかった段は空。 */
  readonly failedTests: readonly string[]
}

/**
 * 終了コードが 0 でない段ごとに、段の名前と終了コードの1行と、
 * 続けて落ちたテストの `<段>: <ファイル> > <テスト名>` を1件1行で、入力の順に返す。
 */
export function describeFailedStages(outcomes: readonly StageOutcome[]): readonly string[] {
  return outcomes
    .filter((outcome) => outcome.status !== 0)
    .flatMap((outcome) => [
      `${outcome.name} が終了コード ${outcome.status} で落ちた`,
      ...outcome.failedTests.map((test) => `${outcome.name}: ${test}`),
    ])
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
