// `<AnswerPost>` のロジック。
// 札と本文は `answerPostOf`。「答え直す」は訂正の補足の下書きを入力欄へ足すだけで、送らない。

import type { MainViewQuestion } from "../../../../../../../shared/session/main-view-shape.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { answerPostOf, redoDraftOf, type AnswerPost } from "../domain/question-answer-post.ts"

export type AnswerPostProps = {
  readonly entry: MainViewQuestion
  /** いちばん新しいやり取りの、いちばん新しい答えか。 */
  readonly redo: boolean
}

export type AnswerPostModel = {
  readonly post: AnswerPost
  readonly redo:
    | { readonly kind: "none" }
    | { readonly kind: "offered"; readonly onRedo: () => void }
}

export function useAnswerPost(props: AnswerPostProps): AnswerPostModel {
  const appendToDraft = useComposerDraft((state) => state.appendToDraft)
  return {
    post: answerPostOf(props.entry),
    redo: props.redo
      ? { kind: "offered", onRedo: () => appendToDraft(redoDraftOf(props.entry)) }
      : { kind: "none" },
  }
}
