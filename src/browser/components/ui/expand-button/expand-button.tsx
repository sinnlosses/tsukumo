// 画面いっぱいの板に開く「広げる」の口。印と字の1つの形で、開閉（`Disclosure`）とは別の操作。
// 置き方（位置・margin）は呼び出し側が `className` で渡す。

import type { ReactElement } from "react"

import { Button } from "../button/button.tsx"
import { MaximizeIcon } from "../icon/icon.tsx"
import styles from "./expand-button.module.css"

const EXPAND_LABEL = "広げる"

export type ExpandButtonProps = {
  readonly className: string
  readonly onClick: () => void
}

export function ExpandButton(props: ExpandButtonProps): ReactElement {
  return (
    <span className={props.className}>
      <Button
        variant="ghost-hover-rule-soft"
        size="label"
        pressed="none"
        disabled={false}
        disclosure={{ kind: "dialog" }}
        className={styles["target"]}
        onClick={props.onClick}
      >
        <span className={styles["content"]}>
          <MaximizeIcon />
          {EXPAND_LABEL}
        </span>
      </Button>
    </span>
  )
}
