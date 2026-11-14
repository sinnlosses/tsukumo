// 失敗で終わったやり取りのレポートの頭に出す失敗の表示。
// 見出しの字が失敗を言い、理由は型の決まった語だけ（SDK の自由文は出さない）。内部の綴りは `title` にだけ出す。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TurnFailure } from "../../../../../../shared/session-driver/turn-failure.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { useTurnFailureBlock } from "./hooks/use-turn-failure-block.ts"
import styles from "./main-view.module.css"

const HEADING = "失敗で終わった"

export function TurnFailureBlock(props: {
  readonly failure: TurnFailure
  /** 戻す依頼の文。記録に依頼が無ければ空。 */
  readonly requestText: string
  /** いちばん新しいやり取りか。 */
  readonly newest: boolean
}): ReactElement {
  const block = useTurnFailureBlock(props)
  const { retry } = block

  return (
    <section
      className={clsx(styles["main-step"], styles["is-failed"])}
      role="note"
      aria-label={HEADING}
    >
      <Text element="p" size="label" tone="state-ng" weight="inherit" className={styles["heading"]}>
        {HEADING}
      </Text>
      <Text element="p" size="inherit" tone="inherit" weight="inherit" className={styles["reason"]}>
        <span title={block.detail}>{block.reason}</span>
      </Text>
      {retry.kind !== "none" && (
        <div className={styles["doors"]}>
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
        </div>
      )}
    </section>
  )
}
