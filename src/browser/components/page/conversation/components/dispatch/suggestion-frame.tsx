// 補完の候補一覧（`/` のコマンド・`@` のファイル）の枠。
// 外側の `div` が置き方、`Surface` が顔、`ul` が転がる一覧を持つ。`Card` の `overflow: clip` は顔の角を切るだけで、一覧の転がりを止めない。

import type { ReactElement, ReactNode } from "react"

import { Surface } from "../../../../ui/surface/surface.tsx"
import styles from "./dispatch.module.css"

export function SuggestionFrame(props: { readonly children: ReactNode }): ReactElement {
  return (
    <div className={styles["dispatch-suggestions"]}>
      <Surface
        element="div"
        tone="ground"
        space="none"
        radius="md"
        shadow="none"
        className={styles["dispatch-suggestions-face"]}
      >
        <ul className={styles["dispatch-suggestions-list"]}>{props.children}</ul>
      </Surface>
    </div>
  )
}
