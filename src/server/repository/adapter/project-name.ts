// 作業ディレクトリの名前（帯に出すプロジェクト名）。

import path from "node:path"

/** 末尾のディレクトリ名。`/` のように名前が取れないときは、渡されたパスをそのまま返す。 */
export function projectNameOf(cwd: string): string {
  const name = path.basename(cwd)
  return name === "" ? cwd : name
}
