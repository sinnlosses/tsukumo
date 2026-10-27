// 狭い画面の「済んだ段 · 中間レポート」の入口。

import type { ReactElement } from "react"

import { usePhaseList, type PhaseListProps } from "./hooks/use-phase-list.ts"
import { PresentationalPhaseList } from "./presentational-phase-list.tsx"

export function PhaseList(
  props: PhaseListProps & { readonly turnId: number },
): ReactElement | null {
  const { turnId, ...listProps } = props
  return <PresentationalPhaseList list={usePhaseList(listProps)} turnId={turnId} />
}
