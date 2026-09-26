// 帯の仕事 / 雑談のトグル（docs/screen-design.md 13.9「動き方の操作子」）。2つの `<button>` を
// 1つの枠に並べ、いまの側に `aria-pressed="true"`。反対側を押すと `session.setChatMode` を1回送って
// 起こし直す（確かめの一言は挟まない。いまの側を押しても・ターン進行中は何も送らない —
// その判定は `hooks/use-screen-nav.ts` の `onChange` が持っていて、ここは押した事実を渡すだけ）。
//
// ターン進行中は `disabled` にせず `aria-disabled` + `title`（`disabled` だとフォーカスも
// 通らず理由の字にも辿り着けない。`chat-view/components/nudge-portrait.tsx` と同じ扱い）。
//
// 絵（かばん・湯のみ）は帯の道具の絵なのでコードに置く（キャラクターの中身ではないので
// 原則4 の対象外）。絵は lucide-react で、字（「仕事」「雑談」）は必ず残す。

import clsx from "clsx"
import { Briefcase, Coffee } from "lucide-react"
import { type ReactElement } from "react"

import { Button } from "../../../../components/ui/button/button.tsx"
import { type ScreenNavChatMode } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-chat-mode.module.css"

export type ScreenNavChatModeProps = {
  readonly chatMode: ScreenNavChatMode
}

export function ScreenNavChatModeToggle(props: ScreenNavChatModeProps): ReactElement {
  const { chat, disabled, title, onChange } = props.chatMode

  // `shellStyles["screen-nav-chat-mode"]` は見た目を持たない（広い画面から隠す規則
  // `.screen-nav > .screen-nav-chat-mode` のためだけの参照。CSS Modules は class 名を
  // ファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるにはこのファイル
  // 自身の class も要る。docs/design.md 6.6）。
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
        className={styles["screen-nav-chat-mode-button"] ?? ""}
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
        className={styles["screen-nav-chat-mode-button"] ?? ""}
        onClick={() => onChange(true)}
      >
        <Coffee size={15} strokeWidth={1.8} />
        雑談
      </Button>
    </div>
  )
}
