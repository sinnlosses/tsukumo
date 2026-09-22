// 答え待ちの箱の**器だけ**（<PresentationalPendingAnswer>。docs/design.md 6.1）。答え待ちが無い
// ときは何も描かず、許可要求は「許可」「拒否」を置き、質問は `<QuestionAsk>` に任せる。フックも
// 算出も持たず、`hooks/use-pending-answer.ts` が畳んだ値をそのまま置く（docs/design.md 2章
// 「機能の中を分ける」）。

import { type ReactElement } from "react"

import styles from "./dispatch.module.css"
import { type PendingAnswerModel } from "./hooks/use-pending-answer.ts"
import { QuestionAsk } from "./question-ask.tsx"

export type PresentationalPendingAnswerProps = PendingAnswerModel

export function PresentationalPendingAnswer(
  props: PresentationalPendingAnswerProps,
): ReactElement | null {
  switch (props.kind) {
    case "none":
      return null
    case "question":
      return <QuestionAsk pending={props.pending} />
    case "permission":
      return (
        <div className={`${styles["pending-answer"]} ${styles["pending-permission"]}`}>
          <p className={styles["pending-summary"]}>
            <span className={styles["pending-tool"]}>{props.toolName}</span>
            {props.summaryText}
          </p>
          <div className={styles["pending-actions"]}>
            <button
              type="button"
              className={`${styles["pending-action"]} ${styles["pending-allow"]}`}
              onClick={props.onAllow}
            >
              許可
            </button>
            <button
              type="button"
              className={`${styles["pending-action"]} ${styles["pending-deny"]}`}
              onClick={props.onDeny}
            >
              拒否
            </button>
          </div>
        </div>
      )
  }
}
