// レポートに書かれたパスを開く前の門番。**git 管理下の一覧にあるときだけ**ホストへ渡す
// （任意の文字列を外部コマンドへ渡さない。docs/display.md 4.2「各表示物」）。

import { type HostResult } from "./host.ts"

/**
 * `path` が `listFiles` の返す一覧にあれば `open` に渡し、成否を返す。一覧に無い・開けなかった
 * ときはどれも同じ `false`（呼び出し側は定型文の理由だけを返す。区別しても利用者が打てる手は
 * 無いので、理由を書き分けない）。一覧は押されるたびに取り直す（起動後に足したファイルも開ける）。
 */
export async function openTrackedFile(
  path: string,
  listFiles: () => Promise<readonly string[]>,
  open: (path: string) => Promise<HostResult>,
): Promise<boolean> {
  const files = await listFiles()
  if (!files.includes(path)) {
    return false
  }
  const result = await open(path)
  return result.ok
}
