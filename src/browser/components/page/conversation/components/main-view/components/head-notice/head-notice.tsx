// 知らせの行。札の頭の右端の席に、いま見ている中身の外で起きたことを1つだけ押せる字で出す。
// 札の頭の高さを変えないよう1行に収め、収まらない字は末尾を切って全文を `title` に入れる。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import styles from "./head-notice.module.css"

export type HeadNoticeProps = {
  readonly text: string
  readonly onPress: () => void
}

export function HeadNotice(props: HeadNoticeProps): ReactElement {
  return (
    <Button
      variant="tinted-accent"
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
    </Button>
  )
}
