// develop/tasks.json の内容から、タスクの進捗（status が done / todo の件数）を数える。「読む」層。
//
// develop/tasks.json は Claude Code とサイドカーの進捗管理ファイルで、利用者との会話内容とは
// 別物（`docs/workflow.md`「tasks.json のフィールド」）。ここは会話の内容を一切扱わない。
//
// transcript.ts と同じく、ここはファイルI/Oを持たない。ファイルを読むのは src/index.ts。

export type TaskStatusCounts = {
  readonly done: number
  readonly todo: number
}

/**
 * develop/tasks.json の内容から、`status` が `"done"` / `"todo"` の件数を数える。
 * JSON として不正、またはトップレベルが配列でないときは undefined を返す
 * （ファイルの形そのものが信用できないと判断する）。配列の要素のうち、
 * オブジェクトでない・`status` が文字列でない要素は、その要素だけ数えずに読み飛ばす
 * （`docs/coding-standards.md`「型を迂回するキャストを使わない」）。
 */
export function countTaskStatuses(content: string): TaskStatusCounts | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed)) {
    return undefined
  }

  const statuses = parsed.map((task) => statusOf(task))
  return {
    done: statuses.filter((status) => status === "done").length,
    todo: statuses.filter((status) => status === "todo").length,
  }
}

function statusOf(task: unknown): string | undefined {
  return isRecord(task) && typeof task.status === "string" ? task.status : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
