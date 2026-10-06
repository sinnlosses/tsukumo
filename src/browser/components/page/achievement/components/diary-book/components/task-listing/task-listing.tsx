import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import { UNKNOWN_TASKS_NOTE } from "../../../../domain/review-note.ts"
import type { DiaryBookTaskList } from "../../../../hooks/use-diary-book.ts"
import styles from "./task-listing.module.css"

const DONE_HEADING = "この日に終えたこと"

export function TaskListing(props: { readonly tasks: DiaryBookTaskList }): ReactElement {
  const { tasks } = props
  const footer = footerOf(tasks)
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
      {tasks.tasksKnown ? (
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
      ) : (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          {UNKNOWN_TASKS_NOTE}
        </Text>
      )}
      {footer !== "" && (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-tasks-footer"]}
        >
          {footer}
        </Text>
      )}
    </div>
  )
}

/** 下の行。「ほか n 件」と「コミット n」のあるものだけをつなぐ。どちらも無ければ空文字。 */
function footerOf(tasks: DiaryBookTaskList): string {
  return [
    ...(tasks.moreCount > 0 ? [`ほか ${String(tasks.moreCount)} 件`] : []),
    ...(tasks.commits.kind === "known" ? [`コミット ${String(tasks.commits.count)}`] : []),
  ].join(" · ")
}
