// いま立ち絵のそばに出す相づちの札（`shownAizuchi`）を、中身が同じなら同じ参照で返す場所。
// 姿の参照がイベントごとに替わっても、札が変わらなければ購読している部品を描き直さない。

import { replaceEqualDeep } from "@tanstack/react-query"

import { shownAizuchi, type ShownAizuchiChip } from "../../../../../shared/session/shown-aizuchi.ts"
import { useSession } from "../../../../stores/session.ts"

let latest: readonly ShownAizuchiChip[] = []

export function useShownAizuchi(): readonly ShownAizuchiChip[] {
  return useSession((session) => {
    latest = replaceEqualDeep(latest, shownAizuchi(session.state))
    return latest
  })
}
