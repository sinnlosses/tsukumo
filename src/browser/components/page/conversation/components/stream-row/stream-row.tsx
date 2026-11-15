// 会話の流れの行（セリフの行・投稿の行・「...」）。
// 雑談のログ（`chat-view/`）と仕事のメインビュー（`main-view/`）が同じ見た目で共用する。
//
// 時刻は発言の脇に添える（`HH:MM`。秒は出さない）。
// 吹き出しの外、下端の内側に置く（キャラクターの行は右脇、利用者の行は左脇）。
// 時刻が分からない発言（前のセッションを組み直したもの）には何も出さない。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { TypingDots } from "../../../../ui/typing-dot-list/typing-dot-list.tsx"
import type { ClockStamp } from "../../domain/clock-stamp.ts"
import { useSpeechPress } from "../hooks/use-speech-press.ts"
import styles from "./stream-row.module.css"

type StreamSpeechRowProps = {
  readonly text: string
  readonly time: ClockStamp
  readonly selected: boolean
  readonly pop: boolean
  /** 渡すと押せる行になる（雑談）。渡さなければ押せない行（仕事のメインビュー）。 */
  readonly onToggle?: () => void
  /** 行の外側に重ねる class（狭い画面で隠すときなど）。 */
  readonly className: string
}

/** 左寄せのキャラクターのセリフ1件と、その脇の時刻。現れたばかりの1件（`pop`）は短く弾む。 */
export function StreamSpeechRow(props: StreamSpeechRowProps): ReactElement {
  return (
    <div className={clsx(styles["stream-row"], styles["stream-row-character"], props.className)}>
      <StreamSpeech
        text={props.text}
        selected={props.selected}
        pop={props.pop}
        {...(props.onToggle === undefined ? {} : { onToggle: props.onToggle })}
      />
      <StreamTime time={props.time} />
    </div>
  )
}

type StreamPostRowProps = {
  readonly time: ClockStamp
  /** 吹き出しに重ねる class。 */
  readonly className: string
  readonly children: ReactNode
}

/** 右寄せの利用者の投稿1件と、その脇の時刻。押せない（遡る先の表情を持たない）。 */
export function StreamPostRow(props: StreamPostRowProps): ReactElement {
  return (
    <div className={clsx(styles["stream-row"], styles["stream-row-user"])}>
      <div
        className={clsx(styles["stream-entry"], styles["stream-entry-user"], props.className)}
        data-speaker="user"
      >
        {props.children}
      </div>
      <StreamTime time={props.time} />
    </div>
  )
}

/**
 * 返事を待っている間・出していない吹き出しが控えている間、流れの末尾に出す「...」（キャラクター側の吹き出しとしての typing indicator）。
 * 押せる行にしない（遡る先の表情を持たないので `role="button"` も `tabIndex` も付けない）。
 * ドット3つは装飾で、待っていること自体は経過表示が文字で伝えているので、支援技術の木からは `aria-hidden` で外す。
 */
export function StreamTyping(): ReactElement {
  return (
    <div
      className={clsx(styles["stream-entry"], styles["stream-entry-typing"])}
      data-speaker="typing"
      aria-hidden="true"
    >
      <TypingDots />
    </div>
  )
}

type StreamSpeechProps = {
  readonly text: string
  readonly selected: boolean
  readonly pop: boolean
  readonly onToggle?: () => void
}

/**
 * セリフ1件の吹き出し。押し方の読み替え（ドラッグとの見分け・キー）は `useSpeechPress` が持つ。
 *
 * 押せる行は `<button>` ではなく `role="button"` の `<div>`。
 * ブラウザは `<button>` の中の文字をドラッグで掴ませず（`user-select` を何にしても選べないことを実機の Chrome で確認した）、セリフをコピーできない。
 * 押せることは role と `aria-pressed` で表し、キーの受けだけ自前で足す。
 */
function StreamSpeech(props: StreamSpeechProps): ReactElement {
  const speech = useSpeechPress(props.onToggle ?? ignorePress)
  const className = clsx(
    styles["stream-entry"],
    styles["stream-entry-character"],
    props.onToggle !== undefined && styles["stream-entry-pressable"],
    props.selected && styles["is-selected"],
    props.pop && styles["stream-entry-pop"],
  )

  if (props.onToggle === undefined) {
    return (
      <div className={className} data-speaker="character">
        {props.text}
      </div>
    )
  }

  return (
    <div
      className={className}
      data-speaker="character"
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onMouseDown={speech.onMouseDown}
      onClick={speech.onClick}
      onKeyDown={speech.onKeyDown}
    >
      {props.text}
    </div>
  )
}

function StreamTime(props: { readonly time: ClockStamp }): ReactElement | undefined {
  if (props.time.kind === "unknown") {
    return undefined
  }
  return (
    <time className={styles["stream-time"]} dateTime={props.time.dateTime}>
      {props.time.text}
    </time>
  )
}

function ignorePress(): void {}
