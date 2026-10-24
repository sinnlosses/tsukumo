// git への問い合わせを1回打つ、という概念1つを持つ。答えが取れなければ undefined に畳むか、共通ディレクトリだけ例外に畳む。`git` だけを呼ぶ。

import { execFileSync } from "node:child_process"

const COMMON_DIRECTORY_ARGS = ["rev-parse", "--path-format=absolute", "--git-common-dir"] as const

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

/** `cwd` から見た git の共通ディレクトリの絶対パス。git で引けなければ例外を投げる。 */
export function readGitCommonDirectory(cwd: string): string {
  const output = queryGit(cwd, COMMON_DIRECTORY_ARGS)
  if (output === undefined) {
    throw new Error(`git ${COMMON_DIRECTORY_ARGS.join(" ")} が失敗した`)
  }
  return output.trim()
}
