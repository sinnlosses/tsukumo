// develop/tasks.json を読む。ファイルの mtime を見て、変わったときだけ読み直す
// （配信のたびに JSON をパースし直さないため）。中身の解釈は src/domain/task-summary.ts の
// `readTaskSummaries` の仕事で、ここは読み直すかどうかの判断とファイルの読み取りだけを持つ
// （決定。分けると同じ概念が2箇所に散るので割らない）。

import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { readTaskSummaries, type TaskSummaryItem } from "../domain/task-summary.ts"

// develop/tasks.json はセッションに依存しない、tsukumo 自身の進捗管理ファイルなので、
// **cwd 相対**で読む（bundledFilePath は使わない）。
const TASKS_FILE_RELATIVE_PATH: readonly string[] = ["develop", "tasks.json"]

/**
 * develop/tasks.json を読む係を作る。ファイルが消えた・読めなくなったらキャッシュも捨てて
 * undefined に落ちる（次に読めるようになったら追従する）。
 */
export function createTaskSummaryReader(cwd: string): () => readonly TaskSummaryItem[] | undefined {
  const path = join(cwd, ...TASKS_FILE_RELATIVE_PATH)
  let cachedMtimeMs: number | undefined = undefined
  let cached: readonly TaskSummaryItem[] | undefined = undefined

  return () => {
    const mtimeMs = readOptionalMtimeMs(path)
    if (mtimeMs === undefined) {
      cachedMtimeMs = undefined
      cached = undefined
      return undefined
    }
    if (mtimeMs === cachedMtimeMs) {
      return cached
    }

    const content = readOptionalFile(path)
    cached = content === undefined ? undefined : readTaskSummaries(content)
    cachedMtimeMs = mtimeMs
    return cached
  }
}

function readOptionalMtimeMs(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
