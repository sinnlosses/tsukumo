// タスク一般の形（一覧の要約と、終えたタスク）。
// タスク一覧は進捗管理のファイルで、利用者との会話内容とは別物。ここは会話の内容を一切扱わない。
// ここはファイルI/Oを持たない。

export const TASK_DIFFICULTIES = ["haiku", "sonnet", "opus"] as const
export type TaskDifficulty = (typeof TASK_DIFFICULTIES)[number]

export const TASK_LOOPABLES = ["Y", "N"] as const
export type TaskLoopable = (typeof TASK_LOOPABLES)[number]

export const TASK_IMPORTANCES = ["high", "normal", "low"] as const
export type TaskImportance = (typeof TASK_IMPORTANCES)[number]

export const TASK_URGENCIES = ["high", "normal", "low"] as const
export type TaskUrgency = (typeof TASK_URGENCIES)[number]

export const TASK_STATUSES = ["todo", "doing", "hold", "draft", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * タスクの状態。
 * - `known`: 語彙（{@link TaskStatus}）の中の状態
 * - `other`: 読み元の語が語彙に無い。読み元の語を `raw` のまま持つ
 * - `none`: 状態を持たない課題
 */
export type TaskSummaryStatus =
  | { readonly kind: "known"; readonly status: TaskStatus }
  | { readonly kind: "other"; readonly raw: string }
  | { readonly kind: "none" }

/** タスクの状態が `status` か。語彙の外（`other`・`none`）はどの `status` でもない。 */
export function hasTaskStatus(
  task: { readonly status: TaskSummaryStatus },
  status: TaskStatus,
): boolean {
  return task.status.kind === "known" && task.status.status === status
}

/** タスク一覧1件分。一覧は読み元が並べた順（ID の番号の昇順）のまま持つ（status ごとにまとめない）。 */
export type TaskSummaryItem = {
  readonly id: string
  readonly summary: string
  readonly status: TaskSummaryStatus
  readonly dependencies: readonly string[]
  /**
   * 依存のうち、まだ済んでいないもの（`dependencies` の順）。止めるかどうかは読み元が判定して載せる。
   * 済んだタスクでは空。
   */
  readonly waitingFor: readonly string[]
  /** ラベル（Beads の `labels` の字のまま）。無い課題では空。属性（下の2欄）とは別。 */
  readonly labels: readonly string[]
  readonly difficulty: TaskDifficulty | undefined
  readonly loopable: TaskLoopable | undefined
  /** 重要度。読み元に無い・語彙の外は `normal`。 */
  readonly importance: TaskImportance
  /** 緊急度。読み元に無い・語彙の外は `normal`。 */
  readonly urgency: TaskUrgency
  /** タスクの本文（Markdown）。本文が無い課題でも空文字列で持つ（`undefined` にしない）。 */
  readonly body: string
  readonly location: TaskLocation
}

/** タスクの置き場所。課題の URL が分かるときだけ `issue`。 */
export type TaskLocation =
  | { readonly kind: "issue"; readonly url: string }
  | { readonly kind: "none" }

/**
 * タスクの一覧が読めているかどうか。
 * - `no-beads`: 起動先に `.beads` が無い（タスク運用なし）。Beads は読まない
 * - `loading`: 最初の見回りの結果がまだ届いていない（状態の初期値。見張りは1回目に必ず `loading` 以外を知らせる）
 * - `unknown`: 読めない（`.beads` はあるが `bd` が読めない）
 * - `known`: 読めた。閉じた課題を件数の上限で切ったときの、落とした件数を `omittedClosedCount` に持つ（切っていなければ 0）
 */
export type TaskSummaryResult =
  | { readonly kind: "no-beads" }
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      readonly items: readonly TaskSummaryItem[]
      readonly omittedClosedCount: number
    }

/** 終えたタスク1件。時刻はエポックミリ秒。 */
export type DoneTask = {
  readonly id: string
  readonly summary: string
  readonly createdAtEpochMilliseconds: number
  readonly closedAtEpochMilliseconds: number
}

/**
 * 着手可否。`todo` のタスクだけが対象で、それ以外は判定しない（`taskReadiness` が undefined）。
 * `blockedBy` にはまだ済んでいない依存のIDが、タスクに書かれた順で入る。
 */
export type TaskReadiness =
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly blockedBy: readonly string[] }

/** 1件の着手可否。`todo` 以外は判定せず、止めるのは `waitingFor` に残る依存だけ。 */
export function taskReadiness(task: TaskSummaryItem): TaskReadiness | undefined {
  if (!hasTaskStatus(task, "todo")) {
    return undefined
  }
  return task.waitingFor.length === 0
    ? { kind: "ready" }
    : { kind: "blocked", blockedBy: task.waitingFor }
}
