// 帯の仕事 / 雑談のトグル。2つの `<button>` を1つの枠に並べ、いまの側に `aria-pressed="true"`。
// 何を送るか（いまの側を押したとき・ターン進行中は送らない）は `onChange` が決め、ここは押した事実を渡すだけ。
//
// 絵（かばん・湯のみ）は帯の道具の絵で、キャラクターの中身ではないのでコードに置く。
// 字（「仕事」「雑談」）はいまの側にだけ添え、反対側は絵だけにして名前を `aria-label` に渡す。

import clsx from "clsx"
import { Briefcase, Coffee } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import type { ScreenNavChatMode } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-chat-mode.module.css"

export type ScreenNavChatModeProps = {
  readonly chatMode: ScreenNavChatMode
}

export function ScreenNavChatModeToggle(props: ScreenNavChatModeProps): ReactElement {
  const { chat } = props.chatMode

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div
      className={clsx(styles["screen-nav-chat-mode"], shellStyles["screen-nav-chat-mode"])}
      role="group"
      aria-label="モード"
    >
      <ChatModeButton chatMode={props.chatMode} chat={false} pressed={!chat} label="仕事">
        <Briefcase size={16} strokeWidth={1.9} />
      </ChatModeButton>
      <ChatModeButton chatMode={props.chatMode} chat={true} pressed={chat} label="雑談">
        <Coffee size={16} strokeWidth={1.9} />
      </ChatModeButton>
    </div>
  )
}

/**
 * トグルの片側。いまの側だけ字を添え、反対側は絵だけにする（名前は `aria-label` と `title` で渡す）。
 * 押せないときの `title` は、名前ではなく押せない理由。
 */
function ChatModeButton(props: {
  readonly chatMode: ScreenNavChatMode
  readonly chat: boolean
  readonly pressed: boolean
  readonly label: string
  readonly children: ReactElement
}): ReactElement {
  const { disabled, title, onChange } = props.chatMode
  return (
    <Button
      type="button"
      variant="ghost"
      size="secondary"
      pressed={props.pressed ? "on" : "off"}
      disabled={disabled}
      ariaLabel={props.pressed ? undefined : props.label}
      disclosure={{ kind: "none" }}
      ariaHasPopup={undefined}
      title={disabled ? title : props.pressed ? undefined : props.label}
      className={styles["screen-nav-chat-mode-button"]}
      onClick={() => onChange(props.chat)}
    >
      {props.children}
      {props.pressed && props.label}
    </Button>
  )
}
