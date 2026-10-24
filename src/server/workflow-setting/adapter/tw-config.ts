// ワークフローの設定コマンド（`tw config --schema`・`tw config --json`・`tw config set`）を起こす口。
// シェルを通さずに起こし、例外を投げない。

import { execFile } from "node:child_process"

import { isMissingFileError } from "../../adapter/lib/missing-file-error.ts"
import type { TwConfigPort, TwOutcome } from "../core/workflow-setting-reading.ts"

const TW_TIMEOUT_MS = 5000
const MAX_OUTPUT_BYTES = 1024 * 1024

/** `tw`（パスか、PATH から引く名前）を作業先 `cwd` で打つ口。 */
export function twConfigPort(tw: string, cwd: string): TwConfigPort {
  return {
    schema: () => runTw(tw, cwd, ["config", "--schema"]),
    entries: () => runTw(tw, cwd, ["config", "--entries"]),
    config: () => runTw(tw, cwd, ["config", "--json"]),
    set: (key, value) => runTw(tw, cwd, ["config", "set", key, value]),
  }
}

/** 起動できない（ENOENT）ときだけ `missing`。タイムアウト・シグナルで止まったときは終了コード -1 の `ran`。 */
function runTw(tw: string, cwd: string, args: readonly string[]): Promise<TwOutcome> {
  return new Promise((resolve) => {
    execFile(
      tw,
      args,
      { cwd, timeout: TW_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ kind: "ran", exitCode: 0, stdout, stderr })
        } else if (isMissingFileError(error)) {
          resolve({ kind: "missing" })
        } else {
          resolve({
            kind: "ran",
            exitCode: typeof error.code === "number" ? error.code : -1,
            stdout,
            stderr,
          })
        }
      },
    )
  })
}
