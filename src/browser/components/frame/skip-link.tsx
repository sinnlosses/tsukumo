// 帯より先に届くスキップリンク。画面の切り替えが `location.hash` なので、`href` ではなくボタンで入力欄へ移す。

import type { ReactElement } from "react"

import { useComposerFocus } from "../../stores/composer-focus.ts"
import styles from "./skip-link.module.css"

export function SkipLink(): ReactElement {
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  return (
    <button type="button" className={styles["skip-link"]} onClick={requestFocus}>
      入力欄へ移る
    </button>
  )
}
