// タスク一覧の要約（id・summary・status・difficulty・loopable・依存・着手した作業ツリー）の形と、主ブランチの履歴に残る develop/task/T-xxx.md の front matter の読み方。
// タスク一覧は進捗管理のファイルで、利用者との会話内容とは別物。ここは会話の内容を一切扱わない。
// ここはファイルI/Oを持たない。

import { isIncludedIn } from "remeda"

/** タスク一覧1件分。ファイルに出てくる順のまま持つ（status ごとにまとめない）。 */
export type TaskSummaryItem = {
  readonly id: string
  readonly summary: string
  readonly status: string | undefined
  readonly difficulty: string | undefined
  readonly loopable: string | undefined
  readonly dependencies: readonly string[]
  /**
   * 着手した作業ツリーの名前（Beads の `assignee`）。着手していない・持ち主の無い課題では `undefined`。
   */
  readonly assignee: string | undefined
  /**
   * タスクの本文（Markdown）。
   * `composeBeadsBody` が組んだもの。本文が無い課題でも空文字列で持つ（`undefined` にしない）。
   */
  readonly body: string
  readonly location: TaskLocation
}

/**
 * タスクの置き場所。ファイル方式は `develop/task/<ID>.md` のパス、Beads 方式は課題の
 * `external_ref` が `https://` で始まる URL のときだけその URL。どちらも無ければ `none`。
 */
export type TaskLocation =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "issue"; readonly url: string }
  | { readonly kind: "none" }

/**
 * タスクの一覧が読めているかどうか。
 * - `settings-invalid`: プロジェクトの設定が読めない（JSON が壊れている・形が違う）
 * - `unknown`: 読めない（`.beads` が無い・`bd` が読めない）か、まだ届いていない
 * - `known`: 読めた
 *
 * 「まだ届いていない」（状態の初期値）と「読めない」は区別しない。
 * `watchTaskSummary` は前回知らせた結果と同じものを知らせないので、最初から読めないときは初回の通知そのものが来ず、画面の対処も変わらない。
 */
export type TaskSummaryResult =
  | { readonly kind: "settings-invalid" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      readonly items: readonly TaskSummaryItem[]
      /** 「tsukumo に頼む」で送る文面のひな形（プロジェクトの設定の `tasks.runPrompt`。`{id}` はタスクIDに置き換える）。 */
      readonly runPrompt: string
    }

/**
 * 着手可否。`todo` のタスクだけが対象で、それ以外は判定しない（`taskReadiness` が undefined）。
 * `blockedBy` にはまだ完了していない依存のIDが、タスクに書かれた順で入る。
 */
export type TaskReadiness =
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly blockedBy: readonly string[] }

/**
 * 1件の着手可否。`task-workflow` の `status.py` と同じ規則に揃える。
 * `todo` 以外は判定せず、止めているのは「一覧に存在していて、まだ `done` でない依存」だけ。
 * 一覧に無いIDは止めない（アーカイブ済み＝完了扱い）。
 *
 * 第2引数には一覧全体から一度だけ作った集合（{@link unfinishedTaskIds}）を渡す（行ごとに作り直さない）。
 */
export function taskReadiness(
  task: TaskSummaryItem,
  unfinished: ReadonlySet<string>,
): TaskReadiness | undefined {
  if (task.status !== "todo") {
    return undefined
  }

  const blockedBy = task.dependencies.filter((id) => unfinished.has(id))
  return blockedBy.length === 0 ? { kind: "ready" } : { kind: "blocked", blockedBy }
}

/**
 * 一覧のうち、まだ完了していないタスクのID集合。
 * `done` と `dropped` はどちらも閉じたタスクとして依存を止めない（task-workflow の `task.py` の `_is_resolved` と同じ規則に揃える）。
 */
export function unfinishedTaskIds(tasks: readonly TaskSummaryItem[]): ReadonlySet<string> {
  return new Set(
    tasks
      .filter((task) => task.status !== "done" && task.status !== "dropped")
      .map((task) => task.id),
  )
}

/**
 * `develop/task/T-xxx.md` の front matter。
 * 文法は claude-skills の task-workflow-redesign.md「front matter の文法」が正典で、YAML ではない（`id` / `summary` / `status` / `difficulty` / `loopable` / `dependencies` の6行、この順・この綴り）。
 * 着手中はファイルに書かない（台帳の印が表す）ので、この型の `status` に `doing` は無い。
 */
export type NewTaskFile = {
  readonly id: string
  readonly summary: string
  readonly status: "todo" | "hold" | "done" | "dropped"
  readonly difficulty: "haiku" | "sonnet" | "opus"
  readonly loopable: "Y" | "N"
  readonly dependencies: readonly string[]
  /** front matter を閉じる2つ目の `---` の行より後ろ（そのまま。空なら空文字列）。 */
  readonly body: string
}

/**
 * ファイル方式のタスクファイルの置き場所。`main` からの相対パス。
 * 末尾の `/` を付けて `git ls-tree` に渡すと、そのディレクトリ自身の1行ではなく直下の一覧になる。
 */
export const TASK_DIR_PATH = "develop/task/"

const NEW_TASK_ID_PATTERN = /^T-\d{3,}$/
const NEW_TASK_STATUS_VALUES = ["todo", "hold", "done", "dropped"] as const
const NEW_TASK_DIFFICULTY_VALUES = ["haiku", "sonnet", "opus"] as const
const NEW_TASK_LOOPABLE_VALUES = ["Y", "N"] as const

/** front matter を閉じる2つ目の `---` までの行数（`---` + 6フィールド + `---`）。 */
const NEW_TASK_HEADER_LINE_COUNT = 8

/**
 * 1件の `develop/task/T-xxx.md` を読む。壊れていれば `undefined`（呼び出し側はその1件だけ読み飛ばす）。
 * 行の位置で判定する（文法は6行・この順・この綴りと決まっているので、欠け・重複・順の違い・知らないキーはどれも「その行が期待した接頭辞で始まらない」という1種類の失敗に落ちる）。
 *
 * `fileName` はファイル名（`T-xxx.md` の形。パスの区切りは呼び出し側が落とす）。front matter の `id` と語幹が一致しないものは INVALID にする。
 */
export function parseNewTaskFile(fileName: string, content: string): NewTaskFile | undefined {
  if (content.includes("\r")) {
    return undefined
  }

  const lines = content.split("\n")
  if (lines.length < NEW_TASK_HEADER_LINE_COUNT || lines[0] !== "---") {
    return undefined
  }

  const field = (index: number, prefix: string): string | undefined => {
    const line = lines[index]
    return line !== undefined && line.startsWith(prefix) ? line.slice(prefix.length) : undefined
  }

  const id = field(1, "id: ")
  if (id === undefined || !NEW_TASK_ID_PATTERN.test(id)) {
    return undefined
  }

  const summaryRaw = field(2, "summary: ")
  const summary = summaryRaw?.trim()
  if (summary === undefined || summary === "") {
    return undefined
  }

  const status = field(3, "status: ")
  if (status === undefined || !isIncludedIn(status, NEW_TASK_STATUS_VALUES)) {
    return undefined
  }

  const difficulty = field(4, "difficulty: ")
  if (difficulty === undefined || !isIncludedIn(difficulty, NEW_TASK_DIFFICULTY_VALUES)) {
    return undefined
  }

  const loopable = field(5, "loopable: ")
  if (loopable === undefined || !isIncludedIn(loopable, NEW_TASK_LOOPABLE_VALUES)) {
    return undefined
  }

  const dependencies = newTaskDependenciesOf(field(6, "dependencies: ["))
  if (dependencies === undefined) {
    return undefined
  }

  if (lines[7] !== "---") {
    return undefined
  }

  if (fileNameStem(fileName) !== id) {
    return undefined
  }

  const body = lines.slice(NEW_TASK_HEADER_LINE_COUNT).join("\n")
  return { id, summary, status, difficulty, loopable, dependencies, body }
}

/** `dependencies: [...]` の `[` の次から渡す。区切りは `", "` 固定で、閉じの `]` が無ければ `undefined`。 */
function newTaskDependenciesOf(depsField: string | undefined): readonly string[] | undefined {
  if (depsField === undefined || !depsField.endsWith("]")) {
    return undefined
  }

  const content = depsField.slice(0, -1)
  if (content === "") {
    return []
  }

  const parts = content.split(", ")
  if (parts.join(", ") !== content || parts.some((id) => !NEW_TASK_ID_PATTERN.test(id))) {
    return undefined
  }

  return parts
}

/** ファイル名の語幹（`T-xxx.md` → `T-xxx`）。パスの区切りは呼び出し側で落としてから渡す前提。 */
function fileNameStem(fileName: string): string {
  return fileName.endsWith(".md") ? fileName.slice(0, -".md".length) : fileName
}
