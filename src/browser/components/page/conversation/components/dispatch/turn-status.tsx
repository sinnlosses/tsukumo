// 送信⇄中断のボタンと経過/所要の表示の入口。

import type { ReactElement, ReactNode } from "react"

import { usePhoneTurnAction } from "./hooks/use-phone-turn-action.ts"
import { type TurnStatusPlace, useTurnStatus } from "./hooks/use-turn-status.ts"
import {
  PresentationalPhoneTurnAction,
  PresentationalTurnStatus,
} from "./presentational-turn-status.tsx"

/** 入力欄に置く進み具合。`paper` の `lamps` は経過の左に置く段の狐火の並び。 */
export type DispatchProgress =
  | { readonly kind: "strip" }
  | { readonly kind: "paper"; readonly lamps: ReactNode }

export function TurnStatus({
  betweenElapsedAndAction,
  progress,
}: {
  readonly betweenElapsedAndAction: ReactNode
  readonly progress: DispatchProgress
}): ReactElement {
  const place: TurnStatusPlace = progress.kind
  return (
    <PresentationalTurnStatus
      {...useTurnStatus(place)}
      betweenElapsedAndAction={betweenElapsedAndAction}
      lamps={progress.kind === "paper" && progress.lamps}
    />
  )
}

/** 狭い画面（760px 以下）の入力欄の右の丸ボタン（■ か ↑）。 */
export function PhoneTurnAction(): ReactElement {
  return <PresentationalPhoneTurnAction {...usePhoneTurnAction()} />
}
