// 作業ツリー固有の git dir を答える、という概念1つを持つ。`git` だけを呼ぶ。

import { queryGit } from "./git-query.ts"

/** `cwd` から見た、その作業ツリー固有の git dir の絶対パス。引けなければ `undefined`。 */
export function readGitDirectory(cwd: string): string | undefined {
  return queryGit(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"])?.trim()
}
