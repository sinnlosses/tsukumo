// `<TurnFailureBlock>` のロジック。理由の語と次の手を、セッションの状態といちばん新しい依頼の手順から用意する。

import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"
import type { FailureEnding, FailureRemains } from "../domain/stream-item-list.ts"
import { turnFailureBlockOf, type TurnFailureBlockModel } from "../domain/turn-failure-block.ts"

type TurnFailureBlockView = TurnFailureBlockModel & {
  /** 依頼の文を入力欄の下書きの末尾に足す。送らない。 */
  readonly onRetry: (request: string) => void
  /** 進み具合のプログレスバーの手順の一覧を、失敗した手順を指して開く。 */
  readonly onShowFailedSteps: () => void
}

export function useTurnFailureBlock(props: {
  readonly ending: FailureEnding
  readonly remains: FailureRemains
  readonly requestText: string
  readonly newest: boolean
}): TurnFailureBlockView {
  const rateLimit = useSession((session) => session.state.rateLimit)
  const content = useMainViewContent((state) => state.content)
  const turnStepList = useCurrentTurnSteps()
  const appendToDraft = useComposerDraft((state) => state.appendToDraft)
  const openAtFailure = useWorkStripSteps((state) => state.openAtFailure)
  const openAtTop = useWorkStripSteps((state) => state.openAtTop)
  const now = useNowWhile(false)

  const stripShown = turnStepList.kind === "turn" && turnStepList.plan.kind === "planned"
  const hasFailedStep =
    stripShown && turnStepList.steps.some((step) => step.status.kind === "failed")

  return {
    ...turnFailureBlockOf({
      ending: props.ending,
      remains: props.remains,
      requestText: props.requestText,
      rateLimit,
      newest: props.newest,
      hasFailedStep: content.kind !== "welcome" && hasFailedStep,
      hasSteps: content.kind !== "welcome" && stripShown,
      now,
    }),
    onRetry: appendToDraft,
    onShowFailedSteps: () => {
      if (content.kind === "welcome") {
        return
      }
      if (props.ending.kind === "failed") {
        openAtFailure(content.exchange)
      } else {
        openAtTop(content.exchange)
      }
    },
  }
}
