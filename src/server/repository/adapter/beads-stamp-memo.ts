// 課題の変化の印が続く間、Beads の課題を読み直さずに前の結果を渡す覚え。
//
// ここはファイルI/Oも `bd` も持たない。

import type { BeadsIssuesReader, BeadsOutcome } from "./beads.ts"

/**
 * `read` を、同じ `cwd` に同じ `stamp` が続く間は読み直さない形にする。
 * 同時に来た読みにも同じ結果を渡す。`stamp` が `undefined` のときと、読めなかった（`issues` でない）ときは覚えない。
 */
export function memoizeByStamp(read: (cwd: string) => Promise<BeadsOutcome>): BeadsIssuesReader {
  const remembered = new Map<
    string,
    { readonly stamp: string; readonly outcome: Promise<BeadsOutcome> }
  >()

  return (cwd, stamp) => {
    if (stamp === undefined) {
      remembered.delete(cwd)
      return read(cwd)
    }
    const previous = remembered.get(cwd)
    if (previous?.stamp === stamp) {
      return previous.outcome
    }
    const entry = { stamp, outcome: read(cwd) }
    remembered.set(cwd, entry)
    const forgetUnless = (outcome: BeadsOutcome | undefined): void => {
      if (outcome?.kind !== "issues" && remembered.get(cwd) === entry) {
        remembered.delete(cwd)
      }
    }
    entry.outcome.then(forgetUnless, () => {
      forgetUnless(undefined)
    })
    return entry.outcome
  }
}
