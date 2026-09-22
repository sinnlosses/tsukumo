// develop/tasks.json を見張る。ファイルの mtime が変わったときだけ読み直し、`onChange` を呼ぶ
// （docs/design.md 5章「task-summary.ts」）。呼び出し側（src/session-start.ts）がこれを
// `tasks-changed` イベントに変えて、他のセッションのイベントと同じ経路へ流す。
//
// develop/tasks.json はセッションに依存しない、tsukumo 自身の進捗管理ファイルなので、
// **cwd 相対**で読む。中身の解釈は src/shared/task-summary.ts の `readTaskSummaries` の仕事で、
// ここは読み直すかどうかの判断とファイルの読み取りだけを持つ。
//
// **`fs.watch` は使わない**（macOS でも取りこぼすことがある）。ポーリングで mtime を見る。

import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { readTaskSummaries, type TaskSummaryItem } from "../../shared/task-summary.ts"

const TASKS_FILE_RELATIVE_PATH: readonly string[] = ["develop", "tasks.json"]

/** mtime を見に行く間隔。develop/tasks.json は利用者の手作業やタスク実行が書き換えるだけなので、
 * 秒単位の反映で十分（`docs/requirements.md`「5. 実行環境・非機能要件」の1秒目安とは別枠）。 */
export const TASK_SUMMARY_POLL_INTERVAL_MS = 1500

export type TaskSummaryWatcher = {
  /** ポーリングを止める。 */
  readonly close: () => void
}

/**
 * develop/tasks.json を見張り始める。**呼んだ時点で1回読み、以後はポーリングで mtime を見る。**
 * ファイルが元々無い（`undefined` のまま）ときは最初の呼び出しでは `onChange` を呼ばない
 * （mtime が「無い→無い」で変わっていないため。`INITIAL_SESSION_STATE.tasks` の既定値
 * `undefined` と一致するので、呼ばなくても見た目は変わらない）。
 *
 * `pollIntervalMs` は既定 {@link TASK_SUMMARY_POLL_INTERVAL_MS}。テストが実際の間隔を待たずに
 * 済むよう、`src/server/core/session-manager.ts` の `batchIntervalMs` と同じ形で差し替えられるようにしてある。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (tasks: readonly TaskSummaryItem[] | undefined) => void,
  pollIntervalMs = TASK_SUMMARY_POLL_INTERVAL_MS,
): TaskSummaryWatcher {
  const path = join(cwd, ...TASKS_FILE_RELATIVE_PATH)
  let cachedMtimeMs: number | undefined = undefined

  const poll = (): void => {
    const mtimeMs = readOptionalMtimeMs(path)
    if (mtimeMs === cachedMtimeMs) {
      return
    }
    cachedMtimeMs = mtimeMs
    onChange(mtimeMs === undefined ? undefined : readOptionalTaskSummaries(path))
  }

  poll()
  const timer = setInterval(poll, pollIntervalMs)
  timer.unref()

  return { close: () => clearInterval(timer) }
}

function readOptionalMtimeMs(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

function readOptionalTaskSummaries(path: string): readonly TaskSummaryItem[] | undefined {
  const content = readOptionalFile(path)
  return content === undefined ? undefined : readTaskSummaries(content)
}

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
