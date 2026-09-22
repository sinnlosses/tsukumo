// 答え待ちの質問の箱の**器だけ**（<PresentationalQuestionAsk>。docs/design.md 6.1）。いま何問目か
// と「戻る」、質問1問ぶんの札、箱の下の進むボタンを置く。フックも算出も持たず、
// `hooks/use-question-ask.ts` が畳んだ値をそのまま置く（docs/design.md 2章「機能の中を分ける」）。
//
// **比べる面はメインビューが出す**（`features/main-view/pending-question.tsx`）。ここは狭いので
// 押す場所に徹する。

import { type ReactElement } from "react"

import { QuestionCard } from "./components/question-card.tsx"
import styles from "./dispatch.module.css"
import { type QuestionAskModel } from "./hooks/use-question-ask.ts"

export type PresentationalQuestionAskProps = QuestionAskModel

export function PresentationalQuestionAsk(
  props: PresentationalQuestionAskProps,
): ReactElement | null {
  if (props.kind === "hidden") {
    return null
  }

  return (
    <div className={`${styles["pending-answer"]} ${styles["pending-question"]}`}>
      {props.progress.kind === "shown" ? (
        <div className={styles["question-progress"]}>
          <span>{props.progress.label}</span>
          {props.progress.showBack ? (
            <button type="button" className={styles["pending-answer-back"]} onClick={props.onBack}>
              戻る
            </button>
          ) : null}
        </div>
      ) : null}
      <QuestionCard card={props.card} />
      {props.advance.kind === "shown" ? (
        <div className={styles["pending-answer-actions"]}>
          <button
            type="button"
            className={styles["pending-action"]}
            disabled={props.advance.disabled}
            onClick={props.onAdvance}
          >
            {props.advance.label}
          </button>
        </div>
      ) : null}
    </div>
  )
}
