// `pnpm run check` を同じ木で打ち直すときに、前回の控えから段を飛ばす・E2E を落ちたファイルに絞る判定と、
// 走らせた結果から次の控えを組むこと、という概念1つを持つ。
// 段の鍵は名前と計画の引数（絞る前の args）で、飛ばすのは同じ木で通った段を1回だけ。

import { isDeepEqual } from "remeda"

import type { FailedFiles } from "./check-failure.ts"
import { E2E_BAIL_COUNT, e2eStage, type Stage } from "./check-stage.ts"

/** `carried` は控えで飛ばした段か、落ちたファイルだけに絞って通した段。次の回は計画どおり流す。 */
export type RecordedResult = "passed" | "carried" | "failed"

export type RecordedStage = {
  readonly name: string
  /** 計画の引数（絞る前）。 */
  readonly args: readonly string[]
  readonly result: RecordedResult
  /** 次の回に絞って流すファイル。空なら絞らない。 */
  readonly retryFiles: readonly string[]
  /** 落ちたテストの `<ファイル> > <テスト名>`。次の回で通ったら flaky として台帳に残す。 */
  readonly failedTests: readonly string[]
}

export type CheckRecord = {
  /** 控えを取った作業ツリーの木の SHA。空なら控えが無い。 */
  readonly tree: string
  readonly stages: readonly RecordedStage[]
}

export const EMPTY_CHECK_RECORD = { tree: "", stages: [] } as const satisfies CheckRecord

export type PlannedStage =
  | { readonly kind: "run"; readonly planned: Stage }
  | { readonly kind: "skip"; readonly planned: Stage }
  | {
      readonly kind: "narrowed"
      readonly planned: Stage
      readonly run: Stage
      readonly files: readonly string[]
    }

export type RerunPlan = {
  readonly stages: readonly PlannedStage[]
  /** 飛ばした段・絞った E2E を知らせる行（無ければ空）。 */
  readonly notices: readonly string[]
}

/** 走らせた段の結果。`failed` は JSON レポートを書かない段では空の列と 0。 */
export type StageRunResult = {
  readonly name: string
  readonly status: number
  /** 別の段が落ちたため、走っている途中で止めた段。 */
  readonly stopped: boolean
  readonly failed: FailedFiles
  /** `parseFailedTests` の結果。 */
  readonly failedTests: readonly string[]
  /** `parsePassedTests` の結果。 */
  readonly passedTests: readonly string[]
}

/** 同じ木で前回落ちて今回通ったテスト。台帳の1行になる。 */
export type FlakyTest = { readonly stage: string; readonly test: string }

/** `--bail` が発火した回は、全件を見ていない。 */
export function isBailed(result: Pick<StageRunResult, "name" | "failed">): boolean {
  return result.name === "test:e2e" && result.failed.failedTestCount >= E2E_BAIL_COUNT
}

/** 控えの木が `tree` と違えば（控えが無ければ）空。飛ばした段・止めた段は見ない。 */
export function findFlakyTests(
  record: CheckRecord,
  tree: string,
  planned: readonly PlannedStage[],
  results: readonly StageRunResult[],
): readonly FlakyTest[] {
  if (record.tree === "" || record.tree !== tree) {
    return []
  }
  return planned.flatMap((entry): readonly FlakyTest[] => {
    const recorded = entry.kind === "skip" ? undefined : findRecorded(record, entry.planned)
    const result = results.find((candidate) => candidate.name === entry.planned.name)
    if (recorded?.result !== "failed" || result === undefined || result.stopped) {
      return []
    }
    return recorded.failedTests
      .filter((test) => result.passedTests.includes(test))
      .map((test) => ({ stage: entry.planned.name, test }))
  })
}

/** 台帳（JSON Lines）の1行。 */
export function formatLedgerLine(flaky: FlakyTest, tree: string, at: Temporal.Instant): string {
  return JSON.stringify({ at: at.toString(), tree, stage: flaky.stage, test: flaky.test })
}

/** 控えの木が `tree` と違えば、計画の段をすべてそのまま流す。 */
export function planRerun(stages: readonly Stage[], record: CheckRecord, tree: string): RerunPlan {
  const sameTree = record.tree !== "" && record.tree === tree
  const planned = stages.map((stage): PlannedStage => {
    const recorded = sameTree ? findRecorded(record, stage) : undefined
    if (recorded?.result === "passed") {
      return { kind: "skip", planned: stage }
    }
    if (recorded?.result === "failed" && recorded.retryFiles.length > 0) {
      return {
        kind: "narrowed",
        planned: stage,
        run: e2eStage(recorded.retryFiles),
        files: recorded.retryFiles,
      }
    }
    return { kind: "run", planned: stage }
  })
  return { stages: planned, notices: describeRerun(planned) }
}

/** 止めた段と、走らなかった段（`results` に無い段）は控えに入れない。 */
export function nextRecord(
  tree: string,
  planned: readonly PlannedStage[],
  results: readonly StageRunResult[],
): CheckRecord {
  const stages = planned.flatMap((entry): readonly RecordedStage[] => {
    const key = { name: entry.planned.name, args: entry.planned.args }
    if (entry.kind === "skip") {
      return [{ ...key, result: "carried", retryFiles: [], failedTests: [] }]
    }
    const result = results.find((candidate) => candidate.name === entry.planned.name)
    if (result === undefined || result.stopped) {
      return []
    }
    if (result.status === 0) {
      return [
        {
          ...key,
          result: entry.kind === "narrowed" ? "carried" : "passed",
          retryFiles: [],
          failedTests: [],
        },
      ]
    }
    return [
      {
        ...key,
        result: "failed",
        retryFiles: retryFilesOf(result),
        failedTests: result.failedTests,
      },
    ]
  })
  return { tree, stages }
}

function findRecorded(record: CheckRecord, stage: Stage) {
  return record.stages.find(
    (recorded) => recorded.name === stage.name && isDeepEqual(recorded.args, stage.args),
  )
}

/** bail が発火した回は、打ち切られたファイルが通ったと書かれるので絞らない。 */
function retryFilesOf(result: StageRunResult): readonly string[] {
  return result.name === "test:e2e" && !isBailed(result) ? result.failed.files : []
}

function describeRerun(planned: readonly PlannedStage[]): readonly string[] {
  const skipped = planned
    .filter((entry) => entry.kind === "skip")
    .map((entry) => entry.planned.name)
  const narrowedFiles = planned.flatMap((entry) => (entry.kind === "narrowed" ? entry.files : []))
  return [
    ...(skipped.length > 0
      ? [`同じ木で前回通った段を飛ばす（次の回は流す）: ${skipped.join(", ")}`]
      : []),
    ...(narrowedFiles.length > 0
      ? [`E2E は同じ木で前回落ちたファイルだけ流す: ${narrowedFiles.join(", ")}`]
      : []),
  ]
}
