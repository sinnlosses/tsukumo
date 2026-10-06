// `git` を起こす口。`git` のために `node:child_process` を直に触るのはここだけ（検査の「子プロセスを起こしてよい箇所」の許可はこのファイル）。
//
// 例外を投げない。呼び出し側が「不明」にするか、その回を諦めるかを決める。

import { execFile } from "node:child_process"

/** `git` の応答を待つ上限。超えたら呼び出し側がその回を諦める。 */
export const GIT_TIMEOUT_MS = 5000

/** 受け取る標準出力の上限。超えると `git` の呼び出しごと失敗する。 */
export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** `git` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが呼び出し側で変わるため。 */
export type GitOutcome =
  | { readonly kind: "output"; readonly stdout: string }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** `git` を起こす。例外を投げない（失敗は `failed` / `timed-out` として返す）。 */
export function runGit(cwd: string, args: readonly string[]): Promise<GitOutcome> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve({ kind: "output", stdout })
        } else {
          // `timeout` で打ち切られたときだけ `killed` が立つ（終了コードが 0 でないときは立たない）。
          resolve({ kind: error.killed === true ? "timed-out" : "failed" })
        }
      },
    )
  })
}
