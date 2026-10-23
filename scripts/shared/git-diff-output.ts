// `git diff --name-status -z` と `--numstat -z` の出力を読む、という概念1つを持つ。git には触らない。

export type ChangedEntry = {
  /** 追加 `A`・変更 `M`・名前変更 `R`・コピー `C` の1文字。 */
  readonly status: string
  readonly path: string
  /** 名前変更・コピーは元のパス。それ以外は `path` と同じ。 */
  readonly previousPath: string
}

/** 追加・変更・名前変更・コピーだけを返す。 */
export function parseNameStatus(nameStatus: string): readonly ChangedEntry[] {
  const tokens = nameStatus.split("\0")
  const entries: ChangedEntry[] = []
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index] ?? ""
    if (status === "") {
      break
    }
    const moves = status.startsWith("R") || status.startsWith("C")
    const previousPath = tokens[index + 1] ?? ""
    const path = moves ? (tokens[index + 2] ?? "") : previousPath
    index += moves ? 3 : 2
    if (path !== "" && /^[AMRC]/.test(status)) {
      entries.push({ status: status.slice(0, 1), path, previousPath })
    }
  }
  return entries
}

/** バイナリ（`-\t-\t`）のファイルの新しいパスを集める。 */
export function parseBinaryPaths(numstat: string): ReadonlySet<string> {
  const tokens = numstat.split("\0")
  const binaryPaths = new Set<string>()
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index] ?? ""
    if (token === "") {
      break
    }
    const [added = "", deleted = "", path = ""] = token.split("\t")
    const moves = path === ""
    const newPath = moves ? (tokens[index + 2] ?? "") : path
    index += moves ? 3 : 1
    if (added === "-" && deleted === "-") {
      binaryPaths.add(newPath)
    }
  }
  return binaryPaths
}
