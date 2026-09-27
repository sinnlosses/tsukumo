// タスク一覧の要約（id・summary・status・difficulty・loopable・依存）を読む。「読む」層。
// develop/task/T-xxx.md の front matter（新形式）だけを読む。
//
// タスク一覧は Claude Code とサイドカーの進捗管理ファイルで、利用者との会話内容とは別物。
// ここは会話の内容を一切扱わない。
//
// ここはファイルI/Oを持たない。`main` の上のファイルを読み、`main` の先端が変わったら読み直すのは
// src/server/repository/adapter/task-summary.ts。

import { isIncludedIn } from "remeda"

/**
 * サイドバーのタスク一覧1件分。ファイルに出てくる順のまま持つ（status ごとにまとめない）。
 *
 * `difficulty`・`loopable`・`dependencies` は一覧の表（`src/browser/features/task-board/task-board.tsx`）が使う。
 * サイドバーの区画には出さないが、同じ読み取りから採れるものをここで揃えておく
 * （読み取りを2本に分けない）。
 */
export type TaskSummaryItem = {
  readonly id: string
  readonly summary: string
  readonly status: string | undefined
  readonly difficulty: string | undefined
  readonly loopable: string | undefined
  readonly dependencies: readonly string[]
}

/**
 * `develop/task/` の一覧が読めているかどうか。「まだ届いていない」（session-state.ts の
 * 初期値）と「読めない」（`develop/task/` が無い・front matter が INVALID）を
 * ここでは区別しない——`watchTaskSummary`（`src/server/repository/adapter/task-summary.ts`）は
 * `main` が最初から読めないときは初回の通知そのものを送らないので、その口だけでは
 * 「まだ確認していない」と「確認して無かった」を型で分けられない。画面側もどちらも同じ
 * 「不明」表示にしていて対処が変わらないため、分けても情報が増えない
 * （`docs/coding-standards.md`「「無いかもしれない」値」）。
 */
export type TaskSummaryResult =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly items: readonly TaskSummaryItem[] }

/**
 * 着手可否。`todo` のタスクだけが対象で、それ以外は判定しない（`taskReadiness` が undefined）。
 * `blockedBy` にはまだ完了していない依存のIDが、タスクに書かれた順で入る。
 */
export type TaskReadiness =
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly blockedBy: readonly string[] }

/**
 * 1件の着手可否。`task-workflow` の `status.py` と同じ規則にする: `todo` 以外は判定せず、
 * 止めているのは「一覧に存在していて、まだ `done` でない依存」だけ。
 * 一覧に無いIDは止めない（アーカイブ済み＝完了扱い）。
 *
 * 第2引数には一覧全体から一度だけ作った「まだ `done` でないタスクのID」の集合
 * （{@link unfinishedTaskIds}）を渡す（行ごとに呼ぶ側で毎回作り直さない）。
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

/** 一覧のうち、まだ `done` でないタスクのID集合。`taskReadiness` へ渡す前に一覧全体から1回だけ作る。 */
export function unfinishedTaskIds(tasks: readonly TaskSummaryItem[]): ReadonlySet<string> {
  return new Set(tasks.filter((task) => task.status !== "done").map((task) => task.id))
}

/**
 * `develop/task/T-xxx.md` の front matter（新形式）。文法は claude-skills の
 * `docs/task-workflow-redesign.md` 3.2 が正典で YAML ではない（`id` / `summary` / `status` /
 * `difficulty` / `loopable` / `dependencies` の6行、この順・この綴り）。着手中（旧 `doing`）は
 * ファイルに書かない（台帳の印が表す。3.2「着手中はファイルに書かない」）ので、この型の
 * `status` に `doing` は無い。
 */
export type NewTaskFile = {
  readonly id: string
  readonly summary: string
  readonly status: "todo" | "hold" | "done" | "dropped"
  readonly difficulty: "haiku" | "sonnet" | "opus"
  readonly loopable: "Y" | "N"
  readonly dependencies: readonly string[]
}

const NEW_TASK_ID_PATTERN = /^T-\d{3,}$/
const NEW_TASK_STATUS_VALUES = ["todo", "hold", "done", "dropped"] as const
const NEW_TASK_DIFFICULTY_VALUES = ["haiku", "sonnet", "opus"] as const
const NEW_TASK_LOOPABLE_VALUES = ["Y", "N"] as const

/** front matter を閉じる2つ目の `---` までの行数（`---` + 6フィールド + `---`）。 */
const NEW_TASK_HEADER_LINE_COUNT = 8

/**
 * 1件の `develop/task/T-xxx.md` を読む。壊れていれば `undefined`（呼び出し側はその1件だけ
 * 読み飛ばす）。行の位置で判定する（3.2 の文法は6行・この順・この綴りと決まっているので、
 * 欠け・重複・順の違い・知らないキーはどれも「その行が期待した接頭辞で始まらない」という
 * 1種類の失敗に落ちる。Python 側の読み手 `taskfile.py` の `parse` と同じ形）。
 *
 * `fileName` はファイル名（`T-xxx.md` の形。パスの区切りは呼び出し側が落とす）。front matter の
 * `id` と語幹が一致しないものは INVALID にする（3.4 の見本）。
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

  return { id, summary, status, difficulty, loopable, dependencies }
}

/**
 * 前段の `parseNewTaskFile` で読み終えた {@link NewTaskFile} の並びと、台帳の着手の印から
 * 一覧に出す要約を作る。着手中（台帳に印がある `todo`）は表示用の `status` を `"doing"` に
 * 読み替える（ファイルには書かれていないので、ここで初めて出てくる）。並びは ID の数字順
 * （claude-skills の `docs/task-workflow-redesign.md` 3.4 が正典）。
 *
 * ファイルを読み直さずに済む形で分けてある——`main` の先端が動いていなくても、共有の
 * `.git` の台帳（着手の印）だけは動く（`task claim` / `task release` は `main` を動かさない）ので、
 * `src/server/repository/adapter/task-summary.ts` は先端が同じ見回りでも `claimedIds` だけ読み直して
 * ここへ通す（`git cat-file --batch` はしない）。
 */
export function taskSummaryItemsOfNewTaskFiles(
  files: readonly NewTaskFile[],
  claimedIds: ReadonlySet<string>,
): readonly TaskSummaryItem[] {
  const items = files.map((task) => taskSummaryItemOfNewTaskFile(task, claimedIds))
  return [...items].sort((a, b) => newTaskIdNumber(a.id) - newTaskIdNumber(b.id))
}

function taskSummaryItemOfNewTaskFile(
  task: NewTaskFile,
  claimedIds: ReadonlySet<string>,
): TaskSummaryItem {
  return {
    id: task.id,
    summary: task.summary,
    status: task.status === "todo" && claimedIds.has(task.id) ? "doing" : task.status,
    difficulty: task.difficulty,
    loopable: task.loopable,
    dependencies: task.dependencies,
  }
}

/** `dependencies: [...]` の `[` の次から渡す。区切りは `", "` 固定で、閉じの `]` が無ければ
 * `undefined`（3.2）。 */
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

/** `T-NNN` → `NNN`。呼ぶ側で {@link NEW_TASK_ID_PATTERN} に通した値だけを渡す。 */
function newTaskIdNumber(id: string): number {
  return Number(id.slice("T-".length))
}
