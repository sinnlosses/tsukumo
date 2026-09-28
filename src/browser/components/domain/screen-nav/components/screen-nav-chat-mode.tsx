// 帯の仕事 / 雑談のトグル。2つの `<button>` を1つの枠に並べ、いまの側に `aria-pressed="true"`。
// 何を送るか（いまの側を押したとき・ターン進行中は送らない）は `onChange` が決め、ここは押した事実を渡すだけ。
//
// 絵（かばん・湯のみ）は帯の道具の絵で、キャラクターの中身ではないのでコードに置く。
// 字（「仕事」「雑談」）は必ず残す。

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
  const { chat, disabled, title, onChange } = props.chatMode

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div
      className={clsx(styles["screen-nav-chat-mode"], shellStyles["screen-nav-chat-mode"])}
      role="group"
      aria-label="モード"
    >
      <Button
        type="button"
        variant="ghost"
        size="subheading"
        pressed={chat ? "off" : "on"}
        disabled={disabled}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={disabled ? title : undefined}
        className={styles["screen-nav-chat-mode-button"]}
        onClick={() => onChange(false)}
      >
        <Briefcase size={15} strokeWidth={1.8} />
        仕事
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="subheading"
        pressed={chat ? "on" : "off"}
        disabled={disabled}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={disabled ? title : undefined}
        className={styles["screen-nav-chat-mode-button"]}
        onClick={() => onChange(true)}
      >
        <Coffee size={15} strokeWidth={1.8} />
        雑談
      </Button>
    </div>
  )
}
