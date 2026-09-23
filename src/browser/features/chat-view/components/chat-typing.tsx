// 返事を待っている間、ログの末尾に出す「...」（docs/screen-design.md 13.7「返事を待つ間の「...」」。
// Discord などと同じ、キャラクター側の吹き出しとしての typing indicator）。
//
// **育つ吹き出し（`chat-speech.tsx`）の初期状態ではなく、別の行**——セリフの文字がまだ
// 無いので育てようが無い。そのターンの `speech` が届くと `showTyping` が下りてこの行は消え、
// 入れ替わりに届いたセリフの行が育ち始める。
//
// **押せる行にしない**（利用者の発言の行と同じ立場。遡る先の表情を持たないので `role="button"`
// も `tabIndex` も付けない）。ドット3つは装飾で、待っていること自体は `<TurnStatus>` の経過
// 表示（`features/dispatch/turn-status.tsx`）が文字で伝えているので、支援技術の木からは
// `aria-hidden` で外す。

import { type ReactElement } from "react"

import styles from "../chat-view.module.css"

export function ChatTyping(): ReactElement {
  return (
    <div
      className={`${styles["chat-entry"]} ${styles["chat-entry-typing"]}`}
      data-speaker="typing"
      aria-hidden="true"
    >
      <span className={styles["chat-typing-dot"]} />
      <span className={styles["chat-typing-dot"]} />
      <span className={styles["chat-typing-dot"]} />
    </div>
  )
}
