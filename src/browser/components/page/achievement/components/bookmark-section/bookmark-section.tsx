// しおり（この日のいちばん）の区画。
// 日記が無い日と、しおりの無い日記（終えたタスクが0の日）では区画ごと出さない。

import type { ReactElement } from "react"

import type { DiaryBookmark } from "../../../../../../shared/diary/diary.ts"
import styles from "../../achievement.module.css"

export type BookmarkSectionProps = {
  /** 日記が無い日は `undefined`。 */
  readonly bookmark: DiaryBookmark | undefined
  /** 書いたパックの名前（見出しの「<名前>が選んだ」に使う）。 */
  readonly writerName: string
}

export function BookmarkSection(props: BookmarkSectionProps): ReactElement | null {
  const { bookmark } = props
  if (bookmark === undefined || bookmark.kind === "none") {
    return null
  }

  return (
    <section aria-label="この日のいちばん" className={styles["achievement-bookmark"]}>
      <p className={styles["achievement-bookmark-heading"]}>
        {props.writerName}が選んだ この日のいちばん
      </p>
      <p className={styles["achievement-bookmark-task"]}>
        <span className={styles["achievement-bookmark-task-id"]}>{bookmark.taskId}</span>
        {bookmark.summary}
      </p>
      <p className={styles["achievement-bookmark-reason"]}>「{bookmark.reason}」</p>
    </section>
  )
}
