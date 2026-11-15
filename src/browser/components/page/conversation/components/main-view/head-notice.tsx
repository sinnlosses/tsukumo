// 知らせの行。狭い画面（760px 以下）の本文の上端に、いま見ている中身の外で起きたことを1つだけ押せる行で出す。
// 広い画面では会話の流れの下端の口（`<StreamFloat>`）が同じ知らせを出す。
// 収まらない字は末尾を切り、全文は `title`。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import styles from "./main-view.module.css"

const NOTICE_ARROW = "→"

type HeadNoticeProps = {
  readonly text: string
  readonly onPress: () => void
}

export function HeadNotice(props: HeadNoticeProps): ReactElement {
  return (
    <Button
      variant="outline-warn"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      title={props.text}
      className={styles["head-notice"]}
      onClick={props.onPress}
    >
      <span className={styles["head-notice-text"]}>{props.text}</span>
      <span aria-hidden="true">{NOTICE_ARROW}</span>
    </Button>
  )
}
