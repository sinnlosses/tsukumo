// `git diff --name-status`・`git show --name-status` の出力を、触ったファイルの一覧に読む。

import type { ChangedFile } from "../../../shared/report/changed-file.ts"

const NAME_STATUS_LINE = /^([A-Z])\d*\t(.+)$/

type Change = ChangedFile["change"]

/**
 * 古い順に並べた出力を重ねて、パスごとの最終の変更にする。読めない行があれば undefined。
 * 追加して消したパスは出さない。
 */
export function foldNameStatus(texts: readonly string[]): readonly ChangedFile[] | undefined {
  const byPath = new Map<string, Change>()
  for (const line of texts.flatMap((text) => text.split("\n")).filter((entry) => entry !== "")) {
    const match = NAME_STATUS_LINE.exec(line)
    if (match === null) {
      return undefined
    }
    const path = match[2] ?? ""
    const next = changeOf(match[1] ?? "")
    const stacked = stack(byPath.get(path), next)
    if (stacked === undefined) {
      byPath.delete(path)
    } else {
      byPath.set(path, stacked)
    }
  }
  return [...byPath].map(([path, change]) => ({ path, change }))
}

function changeOf(letter: string): Change {
  if (letter === "A") {
    return "added"
  }
  return letter === "D" ? "deleted" : "modified"
}

function stack(previous: Change | undefined, next: Change): Change | undefined {
  if (previous === undefined) {
    return next
  }
  if (next === "deleted") {
    return previous === "added" ? undefined : "deleted"
  }
  if (next === "added") {
    return previous === "deleted" ? "modified" : "added"
  }
  return previous === "added" ? "added" : "modified"
}
