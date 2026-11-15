// `Report.favorOptions`（お願いの選択肢）の、形では言えない2つの規約の検査。
// 勧める印は1つまで、選択肢は `favor` があるときだけ。4つ以上は欄の形（`.max(3)`）で拒まれる。

import { isPlainObject } from "remeda"

export type FavorOptionsFaultKind = "favor-options-recommended" | "favor-options-without-favor"

export type FavorOptionsFault = {
  readonly kind: FavorOptionsFaultKind
  readonly pointer: string
}

/** 根の `Report`（`index` 番目）の `favorOptions` の違反。`favorOptions` が無ければ空。 */
export function favorOptionsFaults(
  report: Readonly<Record<string, unknown>>,
  index: number,
): readonly FavorOptionsFault[] {
  const { favorOptions, favor } = report
  if (!Array.isArray(favorOptions) || favorOptions.length === 0) {
    return []
  }
  const pointer = `/components/${String(index)}/favorOptions`
  const faults: FavorOptionsFault[] = []
  if (typeof favor !== "string" || favor.trim() === "") {
    faults.push({ kind: "favor-options-without-favor", pointer })
  }
  const recommended = favorOptions.filter(
    (option: unknown) => isPlainObject(option) && option.recommended === true,
  )
  if (recommended.length >= 2) {
    faults.push({ kind: "favor-options-recommended", pointer })
  }
  return faults
}
