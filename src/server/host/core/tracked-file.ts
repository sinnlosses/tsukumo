// レポートに書かれたパスを開く前の門番。git 管理下の一覧にあるときだけホストへ渡す（`isTrackedPath`）。

import { isTrackedPath } from "../../core/tracked-path.ts"
import type { HostResult } from "./host.ts"

/**
 * `path` が `listFiles` の返す一覧にあれば `open` に渡し、成否を返す。
 * 一覧に無い・開けなかったときはどれも同じ `false`（区別しても利用者が打てる手は無いので、理由を書き分けない）。
 */
export async function openTrackedFile(
  path: string,
  listFiles: () => Promise<readonly string[]>,
  open: (path: string) => Promise<HostResult>,
): Promise<boolean> {
  if (!(await isTrackedPath(path, listFiles))) {
    return false
  }
  const result = await open(path)
  return result.ok
}
