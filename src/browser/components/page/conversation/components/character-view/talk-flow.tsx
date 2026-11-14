// 舞台のやり取りの流れの入口。行はキャラビューが組んで渡す（`CharacterViewModel` の `flow`）。
// 段を終えたセリフの行を押すと、紙のその段へ連れていく合図（`useStepJump`）を出す。別のターンの段なら先にそのターンへ切り替える。

import type { ReactElement } from "react"

import { useStepJump, type StepJumpTarget } from "../../stores/step-jump.ts"
import { useTurnSelection } from "../../stores/turn-selection.ts"
import type { TalkFlowRow } from "./domain/talk-flow.ts"
import { PresentationalTalkFlow } from "./presentational-talk-flow.tsx"

type TalkFlowProps = {
  readonly rows: readonly TalkFlowRow[]
  /** 「これまでのやり取り」の札を押したとき。セリフのログを開く。 */
  readonly onOpenSpeechLog: () => void
}

export function TalkFlow(props: TalkFlowProps): ReactElement {
  const { activeTurnId, selectTurn } = useTurnSelection()
  const requestJump = useStepJump((state) => state.requestJump)
  const jumpToStep = (target: StepJumpTarget): void => {
    if (target.turnId !== activeTurnId) {
      selectTurn(target.turnId)
    }
    requestJump(target)
  }
  return (
    <PresentationalTalkFlow
      rows={props.rows}
      onOpenSpeechLog={props.onOpenSpeechLog}
      onJumpToStep={jumpToStep}
    />
  )
}
