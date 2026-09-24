// `develop/task/*.md`（新形式。front matter の `id:`）と `docs/history/tasks.md`
// （行頭 `## T-<数字>` の見出し）からタスクIDを読み、`scripts/task-id.ts` の純粋関数に渡す、
// という概念1つを持つ。`test/task-id.test.ts` が使う。読み元は新形式のみ（旧形式の
// `develop/tasks.json` は移行済み。経緯は `docs/history/direction.md`「タスク運用の作り直し」）。

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { parseNewTaskFile } from "../../src/shared/task-summary.ts"
import { extractHeadingTaskIds } from "../task-id.ts"

/** `root` 以下の `develop/task/*.md` と `docs/history/tasks.md` から、タスクIDをすべて集める。 */
export function collectTaskIds(root: string): string[] {
  const taskDir = join(root, "develop/task")
  const fileNames = readdirSync(taskDir).filter((name) => name.endsWith(".md"))
  const current = fileNames.flatMap((name) => {
    const task = parseNewTaskFile(name, readFileSync(join(taskDir, name), "utf8"))
    // 読めない1件を読み飛ばすと、重複の検査が黙って効かなくなる
    if (task === undefined) {
      throw new Error(`develop/task/${name} を読めない（front matter が壊れている）`)
    }
    return [task.id]
  })
  const historyIds = extractHeadingTaskIds(
    readFileSync(join(root, "docs/history/tasks.md"), "utf8"),
  )
  return [...current, ...historyIds]
}
