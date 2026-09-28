// ターンの札の頭の入口。

import type { ReactElement } from "react"

import { useTurnHeader, type TurnHeaderProps } from "./hooks/use-turn-header.ts"
import { PresentationalTurnHeader } from "./presentational-turn-header.tsx"

export type { TurnHeaderEntry, TurnHeaderProps } from "./hooks/use-turn-header.ts"

export function TurnHeader(props: TurnHeaderProps): ReactElement {
  return <PresentationalTurnHeader {...useTurnHeader(props)} />
}
