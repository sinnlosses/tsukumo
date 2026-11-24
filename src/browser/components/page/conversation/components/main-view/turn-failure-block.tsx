// 失敗で終わったやり取りのレポートの頭に出す失敗の表示。
// 見出しの字が失敗を言い、理由は型の決まった語だけ（SDK の自由文は出さない）。内部の綴りは `title` にだけ出す。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { FailureEnding, FailureRemains } from "./domain/stream-item-list.ts"
import { useTurnFailureBlock } from "./hooks/use-turn-failure-block.ts"
import styles from "./main-view.module.css"
import { StepFace } from "./step-face.tsx"

export function TurnFailureBlock(props: {
  readonly ending: FailureEnding
  readonly remains: FailureRemains
  /** 戻す依頼の文。記録に依頼が無ければ空。 */
  readonly requestText: string
  /** いちばん新しいやり取りか。 */
  readonly newest: boolean
}): ReactElement {
  const block = useTurnFailureBlock(props)
  const { retry, failedSteps } = block

  return (
    <section
      className={clsx(styles["main-step"], props.ending.kind === "failed" && styles["is-failed"])}
      role="note"
      aria-label={block.heading}
    >
      <StepFace>
        <Text
          element="p"
          size="label"
          tone={props.ending.kind === "failed" ? "state-ng" : "ink"}
          weight="inherit"
          className={styles["heading"]}
        >
          {block.heading}
        </Text>
        {block.reason !== "" && (
          <Text
            element="p"
            size="inherit"
            tone="inherit"
            weight="inherit"
            className={styles["reason"]}
          >
            {block.reason}
          </Text>
        )}
        {block.detail !== "" && (
          <Text element="p" size="label" tone="ink" weight="normal" className={styles["detail"]}>
            {block.detail}
          </Text>
        )}
        {block.remains !== "" && (
          <Text element="p" size="label" tone="ink" weight="normal" className={styles["kept"]}>
            {block.remains}
          </Text>
        )}
        {(retry.kind !== "none" || failedSteps.kind === "shown") && (
          <div className={styles["doors"]}>
            {retry.kind !== "none" && (
              <Button
                variant="outline-surface"
                size="secondary"
                pressed="none"
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["door"]}
                onClick={() => {
                  block.onRetry(retry.request)
                }}
              >
                {retry.label}
              </Button>
            )}
            {failedSteps.kind === "shown" && (
              <Button
                variant="outline-surface"
                size="secondary"
                pressed="none"
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["door"]}
                onClick={block.onShowFailedSteps}
              >
                {failedSteps.label}
              </Button>
            )}
          </div>
        )}
      </StepFace>
    </section>
  )
}
