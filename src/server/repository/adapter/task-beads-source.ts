// Beads 方式のタスクの読み元。`bd` の課題を一覧の要約に読み替える。
// 着手・完了は主ブランチを動かさず、課題は主ブランチの中身にも依らないので、主ブランチの先端は見ない。
// `bd list` は1回が `git rev-parse` より2桁重いので、課題の変化の印（`createBeadsStampReader`）が前回読んだときと同じなら打たない。印が取れないときは毎回打つ。
// `.beads` が無いとき（印の読み手が `missing` を返す）は `bd list` を打たずに「Beads なし」にする。
// `.beads` があって `bd` が読めないとき（`bd` が無い含む）は「不明」にし、印は覚えず次の見回りで打ち直す。
// タイムアウトしたときはその回を諦める。

import { taskSummaryItemsOfBeadsIssues } from "./beads-task.ts"
import type { BeadsStamp, readBeadsIssues } from "./beads.ts"
import type { TaskSource } from "./task-source.ts"

export type TaskBeadsSourcePorts = {
  readonly readBeadsIssues: typeof readBeadsIssues
  /** `.beads` の有無と課題の変化の印。 */
  readonly readBeadsStamp: () => Promise<BeadsStamp>
}

export function createTaskBeadsSource(cwd: string, ports: TaskBeadsSourcePorts): TaskSource {
  let readStamp: string | undefined = undefined

  return {
    read: async () => {
      // 印は `bd list` の前に読む（読んでいるあいだの更新を次の見回りで拾うため）。
      const beadsStamp = await ports.readBeadsStamp()
      if (beadsStamp.kind === "missing") {
        readStamp = undefined
        return { kind: "read", result: { kind: "no-beads" } }
      }
      const stamp = beadsStamp.stamp
      if (stamp !== undefined && stamp === readStamp) {
        return { kind: "unchanged" }
      }

      const beads = await ports.readBeadsIssues(cwd)
      if (beads.kind === "timed-out") {
        return { kind: "unchanged" }
      }
      if (beads.kind === "failed") {
        return { kind: "read", result: { kind: "unknown" } }
      }
      readStamp = stamp
      return {
        kind: "read",
        result: { kind: "known", items: taskSummaryItemsOfBeadsIssues(beads.issues) },
      }
    },
  }
}
