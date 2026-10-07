// 脇の話の欄の器。破線の枠の `<details>` に、利用者の言葉と答えの対を古い順に1行ずつ並べる。

import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "./aside-thread.module.css"
import type { AsideThreadModel } from "./hooks/use-aside-thread.ts"

/** 開閉の印。ブラウザ既定の三角の代わりに、見出しの字の後ろに置く。 */
const OPEN_MARK = "▾"
const CLOSED_MARK = "▸"

export type PresentationalAsideThreadProps = AsideThreadModel

export function PresentationalAsideThread(props: PresentationalAsideThreadProps): ReactElement {
  return (
    <details className={styles["aside-thread"]} open={props.open} onToggle={props.onToggle}>
      <Text element="summary" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {props.summary} <span aria-hidden="true">{props.open ? OPEN_MARK : CLOSED_MARK}</span>
      </Text>
      <ul className={styles["aside-rows"]}>
        {props.rows.map((row) => (
          <li className={styles["aside-row"]} title={`${row.text} → ${row.answer}`} key={row.key}>
            <Text element="span" size="inherit" tone="ink-quiet" weight="inherit" className="">
              きみ:
            </Text>{" "}
            {row.text}{" "}
            <Text element="span" size="inherit" tone="ink-quiet" weight="inherit" className="">
              →
            </Text>{" "}
            {row.answer}
          </li>
        ))}
      </ul>
    </details>
  )
}
