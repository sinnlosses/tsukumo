// `develop/tasks.json` と `docs/history/tasks.md` からタスクIDを読み、
// `scripts/task-id.ts` の純粋関数に渡す、という概念1つを持つ。`test/task-id.test.ts` が使う。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { readTaskSummaries } from "../../src/shared/task-summary.ts"
import { extractHeadingTaskIds } from "../task-id.ts"

/** `root` 以下の `develop/tasks.json` と `docs/history/tasks.md` から、タスクIDをすべて集める。 */
export function collectTaskIds(root: string): string[] {
  const current = readTaskSummaries(readFileSync(join(root, "develop/tasks.json"), "utf8"))
  // 読めないときに空の一覧で続けると、重複の検査が黙って効かなくなる
  if (current === undefined) {
    throw new Error("develop/tasks.json を読めない（JSON の配列ではない）")
  }
  const historyIds = extractHeadingTaskIds(
    readFileSync(join(root, "docs/history/tasks.md"), "utf8"),
  )
  return [...current.map((task) => task.id), ...historyIds]
}
