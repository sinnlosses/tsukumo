// 書き終わりの知らせ。
// 日記が書き上がったら、成果の画面の下の中央に浮く札で「<日付>のページができました」を知らせる。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { Bell } from "../bell/bell.tsx"
import styles from "./diary-notice.module.css"
import { useDiaryNotice } from "./hooks/use-diary-notice.ts"

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
        name={{ kind: "none" }}
        ref={undefined}
        gap="none"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["diary-notice-icon"]}
      >
        <Bell size={18} />
      </HStack>
      <Text element="span" size="subheading" tone="ink" weight="inherit" className="">
        {`${view.dateLabel}のページができました`}
      </Text>
      <Button
        variant="solid-accent"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-notice-open"]}
        onClick={view.onOpen}
      >
        <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
          {OPEN_LABEL}
        </Text>
      </Button>
      <Button
        variant="ghost"
        size="body"
        pressed="none"
        disabled={false}
        ariaLabel={DISMISS_SR_LABEL}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-notice-dismiss"]}
        onClick={view.onDismiss}
      >
        {DISMISS_LABEL}
      </Button>
    </div>
  )
}
