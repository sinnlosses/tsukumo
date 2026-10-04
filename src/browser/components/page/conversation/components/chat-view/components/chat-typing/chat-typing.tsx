// 返事を待っている間・出していない吹き出しが控えている間、ログの末尾に出す「...」（キャラクター側の吹き出しとしての typing indicator）。
//
// セリフの吹き出しの初期状態ではなく、別の行。
// 控えている吹き出しの文字は `useSpeechReveal` が持っていて、ここには渡さない。
// 控えていた吹き出しが出ると `showTyping` が下りてこの行は消え、入れ替わりにその行が現れる。
//
// 押せる行にしない（遡る先の表情を持たないので `role="button"` も `tabIndex` も付けない）。
// ドット3つは装飾で、待っていること自体は `<TurnStatus>` の経過表示が文字で伝えているので、支援技術の木からは `aria-hidden` で外す。

import clsx from "clsx"
import type { ReactElement } from "react"

import { TypingDots } from "../../../../../../ui/typing-dots/typing-dots.tsx"
import chatViewStyles from "../../chat-view.module.css"

export function ChatTyping(): ReactElement {
  return (
    <div
      className={clsx(chatViewStyles["chat-entry"], chatViewStyles["chat-entry-typing"])}
      data-speaker="typing"
      aria-hidden="true"
    >
      <TypingDots />
    </div>
  )
}
