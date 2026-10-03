// Beads 方式のタスクの読み元。`bd` の課題を一覧の要約に読み替える。
// 着手・完了は主ブランチを動かさず、課題は主ブランチの中身にも依らないので、主ブランチの先端は見ない。
// `bd list` は1回が `git rev-parse` より2桁重いので、課題の変化の印（`createBeadsStampReader`）が前回読んだときと同じなら打たない。印が取れないときは毎回打つ。
// `bd` が読めないとき（`.beads` が無い・`bd` が無い）は「不明」にし、タイムアウトしたときはその回を諦める。

import { taskSummaryItemsOfBeadsIssues } from "../../../shared/repository/beads-issue.ts"
import type { readBeadsIssues } from "./beads.ts"
import type { TaskSource } from "./task-source.ts"

export type TaskBeadsSourcePorts = {
  readonly readBeadsIssues: typeof readBeadsIssues
  /** 課題の変化の印。取れないときは `undefined`。 */
  readonly readBeadsStamp: () => Promise<string | undefined>
}

export function createTaskBeadsSource(cwd: string, ports: TaskBeadsSourcePorts): TaskSource {
  let readStamp: string | undefined = undefined

  return {
    read: async () => {
      // 印は `bd list` の前に読む（読んでいるあいだの更新を次の見回りで拾うため）。
      const stamp = await ports.readBeadsStamp()
      if (stamp !== undefined && stamp === readStamp) {
        return { kind: "unchanged" }
      }

      const beads = await ports.readBeadsIssues(cwd)
      if (beads.kind === "timed-out") {
        return { kind: "unchanged" }
      }
      readStamp = stamp
      return {
        kind: "read",
        result:
          beads.kind === "issues"
            ? { kind: "known", items: taskSummaryItemsOfBeadsIssues(beads.issues) }
            : { kind: "unknown" },
      }
    },
  }
}
