// `<TurnFailureBlock>` のロジック。理由の語と次の手を、セッションの状態から用意する。

import type { TurnFailure } from "../../../../../../../shared/session-driver/turn-failure.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { turnFailureBlockOf, type TurnFailureBlockModel } from "../domain/turn-failure-block.ts"

type TurnFailureBlockView = TurnFailureBlockModel & {
  /** 依頼の文を入力欄の下書きの末尾に足す。送らない。 */
  readonly onRetry: (request: string) => void
}

export function useTurnFailureBlock(props: {
  readonly failure: TurnFailure
  readonly requestText: string
  readonly newest: boolean
}): TurnFailureBlockView {
  const rateLimit = useSession((session) => session.state.rateLimit)
  const appendToDraft = useComposerDraft((state) => state.appendToDraft)
  const now = useNowWhile(false)

  return {
    ...turnFailureBlockOf({
      failure: props.failure,
      requestText: props.requestText,
      rateLimit,
      newest: props.newest,
      now,
    }),
    onRetry: appendToDraft,
  }
}
