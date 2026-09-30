import type { ReactElement } from "react"

import styles from "../../../../achievement.module.css"
import type { DiaryBookPage } from "../../../../hooks/use-diary-book.ts"
import { Badges } from "../badges/badges.tsx"
import { Bookmark } from "../bookmark/bookmark.tsx"
import { TaskListing } from "../task-listing/task-listing.tsx"

export function LeftPage(props: {
  readonly page: Extract<DiaryBookPage, { readonly kind: "ready" }>
}): ReactElement {
  const { page } = props
  return (
    <div className={styles["diary-book-left"]}>
      <Bookmark bookmark={page.bookmark} writerName={page.portraitName} />
      <TaskListing tasks={page.tasks} />
      {page.badges.length > 0 && <Badges badges={page.badges} />}
    </div>
  )
}
