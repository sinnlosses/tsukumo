// 帯の仕事 / 雑談のトグル（docs/design.md 13.9「動き方の操作子」）。**2つの `<button>` を
// 1つの枠に並べ、いまの側に `aria-pressed="true"`**。反対側を押すと `set-chat-mode` を1回送って
// 起こし直す（確かめの一言は挟まない。いまの側を押しても・ターン進行中は何も送らない —
// その判定は `hooks/use-screen-nav.ts` の `onChange` が持っていて、ここは押した事実を渡すだけ）。
//
// **ターン進行中は `disabled` にせず `aria-disabled` + `title`**（`disabled` だとフォーカスも
// 通らず理由の字にも辿り着けない。`chat-view/components/nudge-portrait.tsx` と同じ扱い）。
//
// **絵（かばん・湯のみ）は帯の道具の絵**なのでコードに置く（キャラクターの中身ではないので
// 原則4 の対象外）。`aria-hidden` のインライン SVG + `currentColor` で、字（「仕事」「雑談」）は
// 必ず残す。アイコンのライブラリは入れない（絵は2つだけ）。

import { type ReactElement } from "react"

import { type ScreenNavChatMode } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavChatModeProps = {
  readonly chatMode: ScreenNavChatMode
}

/** かばんの絵（仕事）。 */
function WorkIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect
        x="1.5"
        y="5.5"
        width="13"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 10.5 4v1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="1.5" y1="9" x2="14.5" y2="9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** 湯のみの絵（雑談）。 */
function ChatIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M2.5 6.5h8v3a4 4 0 0 1-4 4v0a4 4 0 0 1-4-4v-3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M10.5 7.5h1a1.8 1.8 0 0 1 0 3.6h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="2" y1="13.5" x2="11" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function ScreenNavChatModeToggle(props: ScreenNavChatModeProps): ReactElement {
  const { chat, disabled, title, onChange } = props.chatMode

  return (
    <div className={styles["screen-nav-chat-mode"]} role="group" aria-label="モード">
      <button
        type="button"
        className={styles["screen-nav-chat-mode-button"]}
        aria-pressed={!chat}
        aria-disabled={disabled}
        title={disabled ? title : undefined}
        onClick={() => onChange(false)}
      >
        <WorkIcon />
        仕事
      </button>
      <button
        type="button"
        className={styles["screen-nav-chat-mode-button"]}
        aria-pressed={chat}
        aria-disabled={disabled}
        title={disabled ? title : undefined}
        onClick={() => onChange(true)}
      >
        <ChatIcon />
        雑談
      </button>
    </div>
  )
}
