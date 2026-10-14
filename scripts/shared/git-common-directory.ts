// 作業ツリーをまたいで共有される git の共通ディレクトリを答える、という概念1つを持つ。`git` だけを呼ぶ。

import { execFileSync } from "node:child_process"

/** `cwd` から見た git の共通ディレクトリの絶対パス。git で引けなければ例外を投げる。 */
export function readGitCommonDirectory(cwd: string): string {
  return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
}
