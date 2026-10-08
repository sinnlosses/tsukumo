// 知らせの行。やり取りの列の頭に、いま見ている中身の外で起きたことを1つだけ押せる行で出す。
// 開いた列では列の幅いっぱいの1行（収まらない字は末尾を切り、全文は `title`）、畳んだ列では印だけの口にする。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import styles from "./head-notice.module.css"

const NOTICE_ARROW = "→"
const NOTICE_MARK = "!"

export type HeadNoticeProps = {
  readonly text: string
  readonly form: "row" | "mark"
  readonly onPress: () => void
}

export function HeadNotice(props: HeadNoticeProps): ReactElement {
  if (props.form === "mark") {
    return (
      <Button
        variant="outline-warn"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={props.text}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={props.text}
        className={styles["head-notice-mark"]}
        onClick={props.onPress}
      >
        <span className={styles["head-notice-mark-glyph"]} aria-hidden="true">
          {NOTICE_MARK}
        </span>
      </Button>
    )
  }
  return (
    <Button
      variant="outline-warn"
      size="secondary"
      pressed="none"
      disabled={false}
      ariaLabel={undefined}
      disclosure={{ kind: "none" }}
      ariaHasPopup={undefined}
      title={props.text}
      className={styles["head-notice"]}
      onClick={props.onPress}
    >
      <span className={styles["head-notice-text"]}>{props.text}</span>
      <span aria-hidden="true">{NOTICE_ARROW}</span>
    </Button>
  )
}
