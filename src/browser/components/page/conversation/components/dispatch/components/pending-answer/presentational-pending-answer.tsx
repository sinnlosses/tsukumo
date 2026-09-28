// 答え待ちの箱の器。答え待ちが無いときと質問のときは何も描かず、許可要求だけ「許可」「拒否」を置く。

import clsx from "clsx"
import type { ReactElement } from "react"

import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../dispatch.module.css"
import type { PendingAnswerModel } from "./hooks/use-pending-answer.ts"

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
            <button
              type="button"
              className={clsx(styles["pending-action"], styles["pending-allow"])}
              onClick={props.onAllow}
            >
              許可
            </button>
            <button
              type="button"
              className={clsx(styles["pending-action"], styles["pending-deny"])}
              onClick={props.onDeny}
            >
              拒否
            </button>
          </HStack>
        </div>
      )
  }
}
