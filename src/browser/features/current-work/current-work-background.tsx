// 一覧の「背景で動いているもの」の区画。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Text } from "../../components/ui/text/text.tsx"
import styles from "./current-work-background.module.css"
import type { CurrentWorkBackgroundList, RunningMark } from "./current-work-step.ts"

export function CurrentWorkBackground(props: {
  readonly list: CurrentWorkBackgroundList
  readonly runningMark: RunningMark
}): ReactElement | undefined {
  const { list, runningMark } = props
  if (list.kind === "none") {
    return undefined
  }
  return (
    <>
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["current-work-background-heading"]}
      >
        {list.headingLabel}
      </Text>
      <ul className={styles["current-work-background"]}>
        {list.tasks.map((task) => (
          <li key={task.key}>
            <span
              className={clsx(
                styles["current-work-background-mark"],
                runningMark === "spin" && styles["current-work-background-mark-spinning"],
              )}
              aria-hidden="true"
            >
              …
            </span>{" "}
            <Text
              element="span"
              size="inherit"
              tone="inherit"
              weight="inherit"
              className={styles["current-work-background-kind"]}
            >
              {task.kindLabel}
            </Text>
            {task.description !== "" && ` ${task.description}`}
          </li>
        ))}
      </ul>
    </>
  )
}
