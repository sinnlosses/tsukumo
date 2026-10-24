// `git submodule status` の出力を、行頭の印で揃える対象・止める対象・揃っているものに分ける。

/** `git submodule status` の1行。`sha` は行に出た版（`+` は作業ツリーにある版、`-` は未取り込み）。 */
export type SubmoduleEntry = {
  readonly path: string
  readonly sha: string
}

type SubmoduleClassification = {
  /** 行頭 `+`（記録と違う版）・`-`（未取り込み）。揃える対象。 */
  readonly drifted: readonly SubmoduleEntry[]
  /** 行頭 `U`（衝突）。揃えずに止める対象。 */
  readonly conflicted: readonly SubmoduleEntry[]
  /** 行頭が空白（揃っている）。 */
  readonly aligned: readonly SubmoduleEntry[]
}

/** `git submodule status` の出力を、行頭の印で揃える対象・止める対象・揃っているものに分ける。 */
export function classifySubmoduleStatus(output: string): SubmoduleClassification {
  const drifted: SubmoduleEntry[] = []
  const conflicted: SubmoduleEntry[] = []
  const aligned: SubmoduleEntry[] = []
  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      continue
    }
    const [sha = "", submodulePath = ""] = line.slice(1).split(/\s+/, 2)
    const entry = { path: submodulePath, sha }
    const marker = line[0]
    if (marker === "+" || marker === "-") {
      drifted.push(entry)
    } else if (marker === "U") {
      conflicted.push(entry)
    } else {
      aligned.push(entry)
    }
  }
  return { drifted, conflicted, aligned }
}
