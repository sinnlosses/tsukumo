// `rtk rewrite` を子として走らせ、Bash のコマンドを出力の短い `rtk` 版へ書き換えてもらう。`rtk` を起こすのはここだけ。
// `rtk` が無い・失敗・タイムアウト・書き換えの対象外のときは何も返さない（元のコマンドを通す側）。

import { execFile } from "node:child_process"

const RTK_TIMEOUT_MS = 2000
const MAX_OUTPUT_BYTES = 1024 * 1024

// 書き換えを標準出力へ出す終了コード。0 は許可の規則が全コマンドを覆う場合、3 は覆わない場合（許可の判定はホストに任せる）。
// 1（書き換えなし）・2（拒否）とそれ以外は書き換えない。
const REWRITTEN_EXIT_CODES = new Set<unknown>([0, 3])

/** 書き換えたコマンド。書き換えが無ければ `undefined`。例外を投げない。 */
export function rewriteWithRtk(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "rtk",
      ["rewrite", command],
      { timeout: RTK_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        const code = error === null ? 0 : error.code
        const rewritten = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout
        resolve(REWRITTEN_EXIT_CODES.has(code) && rewritten !== "" ? rewritten : undefined)
      },
    )
  })
}
