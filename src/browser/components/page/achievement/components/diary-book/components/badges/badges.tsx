import type { ReactElement } from "react"

import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { DiaryBookBadge } from "../../../../hooks/use-diary-book.ts"
import styles from "./badges.module.css"

const GRADUATION_LABEL = "卒業"

export function Badges(props: { readonly badges: readonly DiaryBookBadge[] }): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="md"
      align="stretch"
      justify="start"
      wrap="wrap"
      className={styles["diary-book-badges"]}
    >
      {props.badges.map((badge) => (
        <div key={badge.key} className={styles["diary-book-badge"]}>
          {badge.kind === "graduation" ? (
            <>
              <Text
                element="span"
                size="secondary"
                tone="inherit"
                weight="bold"
                className={styles["diary-book-badge-title"]}
              >
                {GRADUATION_LABEL}
              </Text>
              <Text
                element="span"
                size="label"
                tone="inherit"
                weight="inherit"
                className={styles["diary-book-badge-sub"]}
              >
                {badge.taskId}
              </Text>
            </>
          ) : (
            <>
              <Text
                element="span"
                size="secondary"
                tone="inherit"
                weight="bold"
                className={styles["diary-book-badge-title"]}
              >
                {badge.countLabel}
              </Text>
              <Text
                element="span"
                size="label"
                tone="inherit"
                weight="inherit"
                className={styles["diary-book-badge-sub"]}
              >
                {badge.unitLabel}
              </Text>
            </>
          )}
        </div>
      ))}
    </HStack>
  )
}
