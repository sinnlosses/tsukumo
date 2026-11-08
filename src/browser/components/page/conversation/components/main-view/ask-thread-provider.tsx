// 出しているやり取りのレポートの部品へ、全やり取りの「聞く」の問いと答えを束ねて配る。

import type { ReactElement, ReactNode } from "react"

import type { MainViewTurn } from "../../../../../../shared/session/main-view-shape.ts"
import {
  AskThreadContext,
  askThreadSlotOf,
} from "../../../../../features/report/ask-thread-context.ts"

export function AskThreadProvider(props: {
  /** 画面に出しているやり取り。 */
  readonly turn: MainViewTurn
  /** 古い順の全やり取り。 */
  readonly turns: readonly MainViewTurn[]
  readonly children: ReactNode
}): ReactElement {
  return (
    <AskThreadContext value={askThreadSlotOf(props.turn, props.turns)}>
      {props.children}
    </AskThreadContext>
  )
}
