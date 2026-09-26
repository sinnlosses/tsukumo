// しおり（この日のいちばん。`docs/screen-design.md` 13.10「並べるもの」3）。日記が無い日・
// しおりの無い日記（終えたタスクが0の日）は区画ごと出さない——`bookmark` が `undefined`
// （日記が無い）か `{ kind: "none" }`（しおりが無い）のときは何も描かない。

import { type ReactElement } from "react"

import { type DiaryBookmark } from "../../../../../../shared/diary.ts"
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
