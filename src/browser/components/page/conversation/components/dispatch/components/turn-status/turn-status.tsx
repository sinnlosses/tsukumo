// 送信⇄中断のボタンと経過/所要の表示の入口。

import type { ReactElement } from "react"

import { useTurnStatus } from "./hooks/use-turn-status.ts"
import { PresentationalTurnStatus } from "./presentational-turn-status.tsx"

export function TurnStatus(): ReactElement {
  return <PresentationalTurnStatus {...useTurnStatus()} />
}
