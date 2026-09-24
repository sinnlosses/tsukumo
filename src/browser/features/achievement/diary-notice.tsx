// 書き終わりの知らせ（`docs/screen-design.md` 13.10「書き終わりの知らせ」）。日記が書き上がったら
// **どの画面にいても**、画面の下の中央に浮く札で「<日付>のページができました」を知らせる。
// `main.tsx` の `<Root>` に常駐させる（`<ScreenNav>` と同じ、画面の入れ替えの外）。
//
// ロジックは `hooks/use-diary-notice.ts`（`docs/design.md` 2章「機能の中を分ける」）。ここは
// 受け取った値をそのまま並べるだけ。

import { type ReactElement } from "react"

import styles from "./diary-notice.module.css"
import { useDiaryNotice } from "./hooks/use-diary-notice.ts"
import { Bell } from "./lantern-calendar.tsx"

const OPEN_LABEL = "日記帳で開く"
const DISMISS_LABEL = "×"
const DISMISS_SR_LABEL = "知らせを消す"

export function DiaryNotice(): ReactElement | null {
  const view = useDiaryNotice()
  if (view.kind !== "shown") {
    return null
  }

  return (
    <div role="status" className={styles["diary-notice"]}>
      <span className={styles["diary-notice-icon"]}>
        <Bell size={18} />
      </span>
      <span className={styles["diary-notice-text"]}>{`${view.dateLabel}のページができました`}</span>
      <button type="button" className={styles["diary-notice-open"]} onClick={view.onOpen}>
        {OPEN_LABEL}
      </button>
      <button
        type="button"
        className={styles["diary-notice-dismiss"]}
        onClick={view.onDismiss}
        aria-label={DISMISS_SR_LABEL}
      >
        {DISMISS_LABEL}
      </button>
    </div>
  )
}
