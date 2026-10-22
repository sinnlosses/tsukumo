// Beads 方式のタスクの読み元。`bd` の課題を一覧の要約に読み替える。
// 着手・完了は主ブランチを動かさず、課題は主ブランチの中身にも依らないので、主ブランチの先端は見ない。
// `bd list` は1回が `git rev-parse` より2桁重いので、課題の変化の印（`createBeadsStampReader`）が前回読んだときと同じなら打たない。印が取れないときは毎回打つ。
// 印が同じでも、前回読んでから `BEADS_REREAD_INTERVAL_MS` 経っていれば読み直す。
// `.beads` が無いとき（印の読み手が `missing` を返す）は `bd list` を打たずに「Beads なし」にする。
// `.beads` があって `bd` が読めないとき（`bd` が無い含む）は「不明」にし、印は覚えず次の見回りで打ち直す。
// タイムアウトしたときはその回を諦める。

import { knownTaskSummaryOfBeadsIssues } from "./beads-task.ts"
import type { BeadsIssuesReader, BeadsStamp } from "./beads.ts"
import type { TaskSource } from "./task-source.ts"

/** 印が動かなくても読み直す間隔。印が書き込みを取りこぼしたときに一覧が古いまま残る長さの上限になる。 */
const BEADS_REREAD_INTERVAL_MS = 60_000

export type TaskBeadsSourcePorts = {
  readonly readBeadsIssues: BeadsIssuesReader
  /** `.beads` の有無と課題の変化の印。 */
  readonly readBeadsStamp: () => Promise<BeadsStamp>
  /** いまの時刻（ミリ秒）。 */
  readonly now: () => number
}

/** 前回 `bd list` を読めたときの印と、読み始めた時刻。 */
type LastRead = { readonly stamp: string | undefined; readonly at: number }

export function createTaskBeadsSource(cwd: string, ports: TaskBeadsSourcePorts): TaskSource {
  let lastRead: LastRead | undefined = undefined

  return {
    read: async () => {
      // 印は `bd list` の前に読む（読んでいるあいだの更新を次の見回りで拾うため）。
      const beadsStamp = await ports.readBeadsStamp()
      if (beadsStamp.kind === "missing") {
        lastRead = undefined
        return { kind: "read", result: { kind: "no-beads" } }
      }
      const stamp = beadsStamp.stamp
      const at = ports.now()
      const rereadDue = lastRead !== undefined && !isWithinRereadInterval(at - lastRead.at)
      if (stamp !== undefined && stamp === lastRead?.stamp && !rereadDue) {
        return { kind: "unchanged" }
      }

      // 読み直しの回は印を渡さない（印ごとに覚えた結果を使い回させない）。
      const beads = await ports.readBeadsIssues(cwd, rereadDue ? undefined : stamp)
      if (beads.kind === "timed-out") {
        return { kind: "unchanged" }
      }
      if (beads.kind === "failed") {
        return { kind: "read", result: { kind: "unknown" } }
      }
      lastRead = { stamp, at }
      return {
        kind: "read",
        result: knownTaskSummaryOfBeadsIssues(beads.issues),
      }
    },
  }
}

/** 時計が戻ったとき（負の経過）も間隔の外として読み直す。 */
function isWithinRereadInterval(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs < BEADS_REREAD_INTERVAL_MS
}
