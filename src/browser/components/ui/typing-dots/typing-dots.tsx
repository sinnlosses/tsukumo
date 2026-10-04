// 書いているあいだ出す点3つ（Discord などと同じ typing indicator）。語彙を持たない。

import type { ReactElement } from "react"

import styles from "./typing-dots.module.css"

export function TypingDots(): ReactElement {
  return (
    <span className={styles["typing-dots"]}>
      <span className={styles["typing-dots-dot"]} />
      <span className={styles["typing-dots-dot"]} />
      <span className={styles["typing-dots-dot"]} />
    </span>
  )
}
