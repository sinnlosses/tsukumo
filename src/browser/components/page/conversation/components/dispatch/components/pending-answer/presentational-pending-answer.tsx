// 答え待ちの箱の器。答え待ちが無いときと質問のときは何も描かず、許可要求だけ「許可」「拒否」を置く。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { PendingAnswerModel } from "./hooks/use-pending-answer.ts"
import styles from "./pending-answer.module.css"

export type PresentationalPendingAnswerProps = PendingAnswerModel

export function PresentationalPendingAnswer(
  props: PresentationalPendingAnswerProps,
): ReactElement | null {
  switch (props.kind) {
    case "none":
      return null
    case "permission":
      return (
        <div className={clsx(styles["pending-answer"], styles["pending-permission"])}>
          <Text
            element="p"
            size="inherit"
            tone="inherit"
            weight="inherit"
            className={styles["pending-summary"]}
          >
            <Text
              element="span"
              size="inherit"
              tone="inherit"
              weight="bold"
              className={styles["pending-tool"]}
            >
              {props.toolName}
            </Text>
            {props.summaryText}
          </Text>
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="sm"
            align="stretch"
            justify="start"
            wrap="nowrap"
            className={styles["pending-actions"]}
          >
            <Button
              type="button"
              variant="outline-ok-surface"
              size="body"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["pending-action"]}
              onClick={props.onAllow}
            >
              許可
            </Button>
            <Button
              type="button"
              variant="outline-danger-surface"
              size="body"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["pending-action"]}
              onClick={props.onDeny}
            >
              拒否
            </Button>
          </HStack>
        </div>
      )
  }
}
