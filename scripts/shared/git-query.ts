// git への問い合わせを1回打ち、答えが取れなければ undefined に畳む、という概念1つを持つ。`git` だけを呼ぶ。

import { execFileSync } from "node:child_process"

/** `cwd` で git を打って stdout を返す。失敗は undefined（stderr は捨てる）。 */
export function queryGit(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return undefined
  }
}
