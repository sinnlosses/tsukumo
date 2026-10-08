// タスク一般の形（一覧の要約と、終えたタスク）。
// タスク一覧は進捗管理のファイルで、利用者との会話内容とは別物。ここは会話の内容を一切扱わない。
// ここはファイルI/Oを持たない。

/** タスク一覧1件分。一覧は読み元が並べた順（作った時刻の順）のまま持つ（status ごとにまとめない）。 */
export type TaskSummaryItem = {
  readonly id: string
  readonly summary: string
  readonly status: string | undefined
  readonly dependencies: readonly string[]
  /**
   * 依存のうち、まだ済んでいないもの（`dependencies` の順）。止めるかどうかは読み元が判定して載せる。
   * 済んだタスクでは空。
   */
  readonly waitingFor: readonly string[]
  /** ラベル（Beads の `labels` の字のまま）。無い課題では空。 */
  readonly labels: readonly string[]
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
 * - `known`: 読めた
 */
export type TaskSummaryResult =
  | { readonly kind: "no-beads" }
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly items: readonly TaskSummaryItem[] }

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
  if (task.status !== "todo") {
    return undefined
  }
  return task.waitingFor.length === 0
    ? { kind: "ready" }
    : { kind: "blocked", blockedBy: task.waitingFor }
}
