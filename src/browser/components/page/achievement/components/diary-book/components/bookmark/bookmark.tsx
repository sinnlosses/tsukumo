import type { ReactElement } from "react"

import type { DiaryBookBookmark } from "../../../../hooks/use-diary-book.ts"
import styles from "./bookmark.module.css"

const BOOKMARK_HEADING = "しおり ── この日のいちばん"

export function Bookmark(props: {
  readonly bookmark: DiaryBookBookmark
  readonly writerName: string
}): ReactElement | null {
  const { bookmark } = props
  if (bookmark.kind === "none") {
    return null
  }
  return (
    <div className={styles["diary-book-bookmark"]}>
      <span className={styles["diary-book-ribbon"]} data-state={bookmark.kind} aria-hidden="true" />
      <p className={styles["diary-book-bookmark-heading"]}>{BOOKMARK_HEADING}</p>
      {bookmark.kind === "pending" ? (
        <p className={styles["diary-book-bookmark-pending"]}>
          振り返りのあとに、{props.writerName}が挟みます。
        </p>
      ) : (
        <>
          <p className={styles["diary-book-bookmark-task"]}>
            <span className={styles["diary-book-bookmark-task-id"]}>{bookmark.taskId}</span>
            {bookmark.summary}
          </p>
          <p className={styles["diary-book-bookmark-reason"]}>「{bookmark.reason}」</p>
        </>
      )}
    </div>
  )
}
