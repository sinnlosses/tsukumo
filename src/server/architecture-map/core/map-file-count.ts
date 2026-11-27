// 箱の paths の glob に当たるファイルの数。どれかの glob に当たるファイルを1回ずつ数える。

import type { GlobMatches } from "./report-map.ts"

export function fileCountOf(
  globs: readonly string[],
  files: readonly string[],
  matches: GlobMatches,
): number {
  if (globs.length === 0) {
    return 0
  }
  return files.filter((file) => globs.some((glob) => matches(file, glob))).length
}
