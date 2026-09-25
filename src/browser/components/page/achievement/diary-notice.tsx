// 書き終わりの知らせ（`docs/screen-design.md` 13.10「書き終わりの知らせ」）。日記が書き上がったら
// **どの画面にいても**、画面の下の中央に浮く札で「<日付>のページができました」を知らせる。
// `main.tsx` の `<Root>` に常駐させる（`<ScreenNav>` と同じ、画面の入れ替えの外）。
//
// ロジックは `hooks/use-diary-notice.ts`（`docs/design.md` 2章「機能の中を分ける」）。ここは
// 受け取った値をそのまま並べるだけ。

import { type ReactElement } from "react"

import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
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
      <HStack
        element="span"
        gap="none"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["diary-notice-icon"] ?? ""}
      >
        <Bell size={18} />
      </HStack>
      <Text element="span" size="subheading" tone="ink" weight="inherit" className="">
        {`${view.dateLabel}のページができました`}
      </Text>
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
