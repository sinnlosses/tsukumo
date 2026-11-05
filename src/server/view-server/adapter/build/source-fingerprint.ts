// ソースの置き場の中身から、1つの指紋（ハッシュ）を作る。
// ソースが変わったかを、時刻ではなく中身で決める。
// `git merge` で書き戻されただけのファイルや `touch` で、変わったと見なさないため。

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, sep } from "node:path"

/** 指紋。読めなかったときは `unavailable`（呼び出し側が「分からない」を「変わった」に寄せないため）。 */
export type SourceFingerprint =
  | { readonly kind: "known"; readonly hash: string }
  | { readonly kind: "unavailable" }

/**
 * `root` の下のファイルすべて（`excludedTopLevel` に挙げた直下の置き場を除く）の相対パスと中身を束ねたハッシュを返す。
 */
export async function sourceFingerprint(
  root: string,
  excludedTopLevel: readonly string[],
): Promise<SourceFingerprint> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    const relativePaths = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
      .filter((path) => !excludedTopLevel.includes(path.split(sep)[0] ?? ""))
      .toSorted()

    const contents = await Promise.all(relativePaths.map((path) => readFile(join(root, path))))

    const hash = createHash("sha256")
    relativePaths.forEach((path, index) => {
      hash
        .update(path)
        .update("\0")
        .update(contents[index] ?? "")
        .update("\0")
    })
    return { kind: "known", hash: hash.digest("hex") }
  } catch {
    return { kind: "unavailable" }
  }
}
