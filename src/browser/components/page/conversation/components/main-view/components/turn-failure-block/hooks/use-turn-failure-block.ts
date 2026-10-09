// `<TurnFailureBlock>` のロジック。理由の語と次の手を、セッションの姿といちばん新しい依頼の手順から用意する。

import type { TurnFailure } from "../../../../../../../../../shared/session-driver/turn-failure.ts"
import { useNowWhile } from "../../../../../../../../hooks/use-now-while.ts"
import { useComposerDraft } from "../../../../../../../../stores/composer-draft.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useMainViewContent } from "../../../../../../../../stores/main-view-content.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useWorkStripSteps } from "../../../../../../../../stores/work-strip-steps.ts"
import { turnFailureBlockOf, type TurnFailureBlockModel } from "../domain/turn-failure-block.ts"

export type TurnFailureBlockView = TurnFailureBlockModel & {
  /** 依頼の文を入力欄の下書きの末尾に足す。送らない。 */
  readonly onRetry: (request: string) => void
  /** 進み具合の帯の手順の一覧を、失敗した手順を指して開く。 */
  readonly onShowFailedSteps: () => void
}

export function useTurnFailureBlock(props: {
  readonly failure: TurnFailure
  readonly requestText: string
  readonly newest: boolean
}): TurnFailureBlockView {
  const rateLimit = useSession((session) => session.state.rateLimit)
  const content = useMainViewContent((state) => state.content)
  const turnStepList = useCurrentTurnSteps()
  const appendToDraft = useComposerDraft((state) => state.appendToDraft)
  const openAtFailure = useWorkStripSteps((state) => state.openAtFailure)
  const now = useNowWhile(false)

  const stripShown = turnStepList.kind === "turn" && turnStepList.plan.kind === "planned"
  const hasFailedStep =
    stripShown && turnStepList.steps.some((step) => step.status.kind === "failed")

  return {
    ...turnFailureBlockOf({
      failure: props.failure,
      requestText: props.requestText,
      rateLimit,
      newest: props.newest,
      hasFailedStep: content.kind !== "welcome" && hasFailedStep,
      now,
    }),
    onRetry: appendToDraft,
    onShowFailedSteps: () => {
      if (content.kind !== "welcome") {
        openAtFailure(content.exchange)
      }
    },
  }
}
