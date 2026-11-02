// Beads の課題を読む口の型。

import type {
  TaskDifficulty,
  TaskImportance,
  TaskLoopable,
  TaskUrgency,
} from "../../../../shared/repository/task-summary.ts"

/**
 * `bd list --json` の1件のうち、Beads の組み込みの欄でこの読み手が使うものだけ。
 * `closedAtEpochMilliseconds`・`externalRef` は Beads の側で無ければ `undefined`、`labels` は無ければ空、本文の3欄は無ければ空文字列。
 * 閉じた課題は閉じた時刻の新しい `CLOSED_TASK_DISPLAY_LIMIT` 件と、閉じていない課題の `blockedBy` に入っているものだけ本文を付け、
 * ほかは本文の3欄が空文字列。
 */
export type BeadsIssue = {
  readonly id: string
  readonly title: string
  readonly status: string
  /** `blocks` の依存先の Beads ID。 */
  readonly blockedBy: readonly string[]
  readonly labels: readonly string[]
  /** metadata の `difficulty`。無い・表に無い値は `undefined`。 */
  readonly difficulty: TaskDifficulty | undefined
  /** metadata の `loopable`。無い・表に無い値は `undefined`。 */
  readonly loopable: TaskLoopable | undefined
  /** metadata の `importance`。無い・表に無い値は `normal`。 */
  readonly importance: TaskImportance
  /** metadata の `urgency`。無い・表に無い値は `normal`。 */
  readonly urgency: TaskUrgency
  /** metadata の `draft` が `"Y"`（エージェントが積んだドラフトの印）。それ以外・無いときは偽。 */
  readonly draft: boolean
  readonly createdAtEpochMilliseconds: number
  readonly closedAtEpochMilliseconds: number | undefined
  readonly description: string
  readonly acceptanceCriteria: string
  readonly notes: string
  readonly externalRef: string | undefined
}

/** `bd` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが呼び出し側で変わるため。 */
export type BeadsOutcome =
  | { readonly kind: "issues"; readonly issues: readonly BeadsIssue[] }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** `cwd` の課題を読む。`stamp` は呼ぶ側が先に読んだ課題の変化の印で、取れないときは `undefined`。 */
export type BeadsIssuesReader = (cwd: string, stamp: string | undefined) => Promise<BeadsOutcome>
