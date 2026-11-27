// 箱の entrypoints のうち、paths の glob のどれかに当たるものだけを元の順で残す。
// 地図の外のパスを開く口へ渡さないため、当たらないものは読み捨てる。

import type { GlobMatches } from "./report-map.ts"

export function entrypointsWithin(
  globs: readonly string[],
  entrypoints: readonly string[],
  matches: GlobMatches,
): readonly string[] {
  return entrypoints.filter((path) => globs.some((glob) => matches(path, glob)))
}
