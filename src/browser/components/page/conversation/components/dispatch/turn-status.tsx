// 送信⇄中断のボタンと経過/所要の表示の入口。

import type { ReactElement, ReactNode } from "react"

import { usePhoneTurnAction } from "./hooks/use-phone-turn-action.ts"
import { useTurnStatus } from "./hooks/use-turn-status.ts"
import {
  PresentationalPhoneTurnAction,
  PresentationalTurnStatus,
} from "./presentational-turn-status.tsx"

export function TurnStatus({
  betweenElapsedAndAction,
}: {
  readonly betweenElapsedAndAction: ReactNode
}): ReactElement {
  return (
    <PresentationalTurnStatus
      {...useTurnStatus()}
      betweenElapsedAndAction={betweenElapsedAndAction}
    />
  )
}

/** 狭い画面（760px 以下）の入力欄の右の丸ボタン（■ か ↑）。 */
export function PhoneTurnAction(): ReactElement {
  return <PresentationalPhoneTurnAction {...usePhoneTurnAction()} />
}
