// ソースの置き場の中身から、1つの指紋（ハッシュ）を作る。
// 開発サーバを差し込んだ起動で、画面にだけ差分を当ててよいかを決めるために使う。
//
// 時刻ではなく中身で見る。
// `git merge` で書き戻されただけのファイルや `touch` で、差分を当てるのを止めてしまわないため。

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, sep } from "node:path"

/**
 * `root` の下のファイルすべて（`excludedTopLevel` に挙げた直下の置き場を除く）の相対パスと中身を束ねたハッシュを返す。
 * 読めなかったときは `undefined`（呼び出し側が「分からない」を「変わった」に寄せないため）。
 */
export async function sourceFingerprint(
  root: string,
  excludedTopLevel: readonly string[],
): Promise<string | undefined> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    () => undefined,
  )
  if (entries === undefined) {
    return undefined
  }

  const relativePaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .filter((path) => !excludedTopLevel.includes(path.split(sep)[0] ?? ""))
    .toSorted()

  const contents = await Promise.all(
    relativePaths.map((path) => readFile(join(root, path)).catch(() => undefined)),
  )
  if (contents.includes(undefined)) {
    return undefined
  }

  const hash = createHash("sha256")
  relativePaths.forEach((path, index) => {
    hash
      .update(path)
      .update("\0")
      .update(contents[index] ?? "")
      .update("\0")
  })
  return hash.digest("hex")
}
