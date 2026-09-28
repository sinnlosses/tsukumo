// あるコミットの上の設定ファイル（AGENTS.md → CLAUDE.md）から、タスクの置き場（`taskStoreOf`）を読む。
// タスクの一覧と成果の集計が同じ規則で方式を決めるための1つの口。

import { taskStoreOf, type TaskStore } from "../../../shared/repository/task-store.ts"
import { runGitCatFileBatch } from "./git.ts"

/** 方式の行を探す設定ファイル。この順で探す（`taskStoreOf`）。 */
const CONFIG_FILE_PATHS = ["AGENTS.md", "CLAUDE.md"]

/** {@link readTaskStoreAt} の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが呼び出し側で変わるため。 */
export type TaskStoreOutcome =
  | { readonly kind: "read"; readonly store: TaskStore }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** `commit` の木にある設定ファイルを1回の `git cat-file --batch` で読み、方式を決める。 */
export async function readTaskStoreAt(cwd: string, commit: string): Promise<TaskStoreOutcome> {
  const batch = await runGitCatFileBatch(
    cwd,
    CONFIG_FILE_PATHS.map((path) => `${commit}:${path}`),
  )
  if (batch.kind !== "output") {
    return batch
  }
  return {
    kind: "read",
    store: taskStoreOf(batch.contents.filter((content) => content !== undefined)),
  }
}
