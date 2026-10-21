// モデル名の照合。SDK が返すモデルの表（`ModelEffortSupport`）で名前を引いて照合する。

import type { ModelEffortSupport } from "./session-event-setting.ts"

/** 2つのモデル名が同じモデルかどうか。文字列が等しいか、表で引けた行の `resolvedModel` が等しいときだけ真。 */
export function sameModel(
  support: readonly ModelEffortSupport[],
  left: string,
  right: string,
): boolean {
  if (left === right) {
    return true
  }
  const leftEntry = findModelSupport(support, left)
  const rightEntry = findModelSupport(support, right)
  return (
    leftEntry !== undefined &&
    rightEntry !== undefined &&
    leftEntry.resolvedModel === rightEntry.resolvedModel
  )
}

/** 名前に当たる表の行。`model` が等しい行を先に、無ければ `resolvedModel` が等しい行。 */
export function findModelSupport(
  support: readonly ModelEffortSupport[],
  name: string,
): ModelEffortSupport | undefined {
  return (
    support.find((entry) => entry.model === name) ??
    support.find((entry) => entry.resolvedModel === name)
  )
}
