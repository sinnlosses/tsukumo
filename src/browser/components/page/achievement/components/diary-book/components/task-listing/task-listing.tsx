import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import type { DiaryBookTaskList } from "../../../../hooks/use-diary-book.ts"
import styles from "./task-listing.module.css"

const DONE_HEADING = "この日に終えたこと"

export function TaskListing(props: { readonly tasks: DiaryBookTaskList }): ReactElement {
  const { tasks } = props
  return (
    <div>
      <Text
        element="p"
        size="secondary"
        tone="ink-quiet"
        weight="inherit"
        className={styles["diary-book-tasks-heading"]}
      >
        {DONE_HEADING}
      </Text>
      <ul className={styles["diary-book-task-list"]}>
        {tasks.items.map((task) => (
          <li key={task.id} className={styles["diary-book-task-row"]}>
            <Text
              element="span"
              size="label"
              tone="ink-quiet"
              weight="inherit"
              className={styles["diary-book-task-id"]}
            >
              {task.id}
            </Text>
            <Text
              element="span"
              size="secondary"
              tone="ink"
              weight="inherit"
              className={styles["diary-book-task-summary"]}
            >
              {task.summary}
            </Text>
          </li>
        ))}
      </ul>
      {tasks.moreCount > 0 && (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-tasks-footer"]}
        >
          {`ほか ${String(tasks.moreCount)} 件`}
        </Text>
      )}
    </div>
  )
}
