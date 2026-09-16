// develop/tasks.json の内容から、タスク一覧の要約（id・summary・status・difficulty・loopable・依存）を読む。「読む」層。
//
// develop/tasks.json は Claude Code とサイドカーの進捗管理ファイルで、利用者との会話内容とは
// 別物（`docs/workflow.md`「tasks.json のフィールド」）。ここは会話の内容を一切扱わない。
//
// ここはファイルI/Oを持たない。ファイルを読み、mtime を見て読み直すのは src/adapter/task-summary.ts。

/**
 * サイドバーのタスク一覧1件分。ファイルに出てくる順のまま持つ（status ごとにまとめない）。
 *
 * `difficulty`・`loopable`・`dependencies` は**一覧の表（`src/ui/features/sidebar/task-board.tsx`）が使う**。
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
 * 着手可否。`todo` のタスクだけが対象で、それ以外は判定しない（`taskReadiness` が undefined）。
 * `blockedBy` には**まだ完了していない依存のID**が、タスクに書かれた順で入る。
 */
export type TaskReadiness =
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly blockedBy: readonly string[] }

/**
 * develop/tasks.json の内容から、一覧に出すフィールドをファイルの順で取り出す。**status ごとにまとめない**（サイドバーの決定。ファイルの順のまま出す）。
 *
 * `summary` が無い・空文字の要素は `task` フィールドの先頭行で代用する。`id` が文字列でない、
 * どちらも代用できない（`summary` も `task` も無い）要素は、その要素だけ読み飛ばす
 * （`docs/coding-standards.md`「型を迂回するキャストを使わない」と同じ、要素単位の安全側の判断）。
 * ファイル全体が JSON として不正、またはトップレベルが配列でないときは undefined を返す
 * （ファイルの形そのものが信用できないと判断する）。
 */
export function readTaskSummaries(content: string): readonly TaskSummaryItem[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed)) {
    return undefined
  }

  return parsed.flatMap((task) => taskSummaryItem(task))
}

/**
 * 1件の着手可否。**`task-workflow` の `status.py` と同じ規則**にする: `todo` 以外は判定せず、
 * 止めているのは「一覧に存在していて、まだ `done` でない依存」だけ。
 * **一覧に無いIDは止めない**（アーカイブ済み＝完了扱い）。
 */
export function taskReadiness(
  task: TaskSummaryItem,
  tasks: readonly TaskSummaryItem[],
): TaskReadiness | undefined {
  if (task.status !== "todo") {
    return undefined
  }

  const unfinished = new Set(
    tasks.filter((other) => other.status !== "done").map((other) => other.id),
  )
  const blockedBy = task.dependencies.filter((id) => unfinished.has(id))
  return blockedBy.length === 0 ? { kind: "ready" } : { kind: "blocked", blockedBy }
}

function taskSummaryItem(task: unknown): readonly TaskSummaryItem[] {
  if (!isRecord(task) || typeof task.id !== "string") {
    return []
  }

  const summary =
    typeof task.summary === "string" && task.summary !== "" ? task.summary : firstLineOf(task.task)
  if (summary === undefined) {
    return []
  }

  return [
    {
      id: task.id,
      summary,
      status: optionalStringOf(task.status),
      difficulty: optionalStringOf(task.difficulty),
      loopable: optionalStringOf(task.loopable),
      dependencies: dependenciesOf(task.dependencies),
    },
  ]
}

function optionalStringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

/** 依存は**文字列の配列のときだけ**受け取る。壊れていたら「依存なし」に倒す（表の1列が空になるだけ）。 */
function dependenciesOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((id: unknown) => (typeof id === "string" ? [id] : []))
}

function firstLineOf(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined
  }

  return value.split("\n")[0]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
