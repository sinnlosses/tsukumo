// 会話の流れの行（セリフの行・投稿の行・「...」）。
// 雑談のログ（`chat-view/`）と仕事のメインビュー（`main-view/`）が同じ見た目で共用する。
//
// 時刻は発言の脇に添える（`HH:MM`。秒は出さない）。
// 吹き出しの外、下端の内側に置く（キャラクターの行は右脇、利用者の行は左脇）。
// 時刻が分からない発言（前のセッションを組み直したもの）には何も出さない。

import clsx from "clsx"
import type { KeyboardEvent, ReactElement, ReactNode } from "react"

import { isOverlayOpen } from "../../../../../hooks/open-overlay.ts"
import { TypingDots } from "../../../../ui/typing-dot-list/typing-dot-list.tsx"
import { VisuallyHidden } from "../../../../ui/visually-hidden/visually-hidden.tsx"
import type { ClockStamp } from "../../domain/clock-stamp.ts"
import type { SpeechArrivalBubble } from "../../domain/speech-arrival.ts"
import { useSpeechPress } from "../hooks/use-speech-press.ts"
import styles from "./stream-row.module.css"

type StreamSpeechRowProps = {
  readonly text: string
  readonly time: ClockStamp
  readonly selected: boolean
  readonly pop: boolean
  /** 届いたばかりのセリフの出方。付けなければ省く（雑談・届いた瞬間でない行）。 */
  readonly arrival?: SpeechArrivalBubble
  /** 明るさ（仕事のメインビューのいまの一言）。雑談は `plain`。 */
  readonly liveness: "plain" | "live"
  /** 吹き出しの形の一部として付ける尾（立ち絵が従っているセリフだけ）。付けなければ `undefined`。 */
  readonly aim: ReactNode
  /** 読み上げ用の話し手の名前。空なら付けない（雑談）。 */
  readonly speakerName: string
  /** 時刻を見える字で出すか。出さなければ、触れるかフォーカスが入ったときだけ見える。 */
  readonly timeShown: boolean
  /** 渡すと押せる行になる（雑談・仕事のメインビューのセリフ）。渡さなければ押せない行。 */
  readonly onToggle?: () => void
  /** `selected` の行にフォーカスがあるときの Esc で呼ぶ（留めを解く）。渡さなければ Esc は何もしない。 */
  readonly onRelease?: () => void
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
        {...(props.arrival === undefined ? {} : { arrival: props.arrival })}
        liveness={props.liveness}
        aim={props.aim}
        speakerName={props.speakerName}
        {...(props.onToggle === undefined ? {} : { onToggle: props.onToggle })}
        {...(props.onRelease === undefined ? {} : { onRelease: props.onRelease })}
      />
      <StreamTime time={props.time} shown={props.timeShown} />
    </div>
  )
}

type StreamPostRowProps = {
  readonly time: ClockStamp
  readonly timeShown: boolean
  /** 読み上げ用の話し手の名前。空なら付けない（雑談）。 */
  readonly speakerName: string
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
        <SpeakerName name={props.speakerName} />
        {props.children}
      </div>
      <StreamTime time={props.time} shown={props.timeShown} />
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
  readonly arrival?: SpeechArrivalBubble
  readonly liveness: "plain" | "live"
  readonly aim: ReactNode
  readonly speakerName: string
  readonly onToggle?: () => void
  readonly onRelease?: () => void
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
    props.liveness !== "plain" && styles["stream-entry-live"],
    props.aim !== undefined && styles["stream-entry-aimed"],
  )

  const arrivalAttribute = {
    ...(props.arrival === undefined ? {} : { "data-arrival": props.arrival }),
    ...(props.aim === undefined ? {} : { "data-followed": "" }),
  }

  if (props.onToggle === undefined) {
    return (
      <div className={className} data-speaker="character" {...arrivalAttribute}>
        <SpeakerName name={props.speakerName} />
        {props.text}
        {props.aim}
      </div>
    )
  }

  return (
    <div
      className={className}
      data-speaker="character"
      {...arrivalAttribute}
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onMouseDown={speech.onMouseDown}
      onClick={speech.onClick}
      onKeyDown={(event) => {
        if (releasesOnEscape(event, props.selected) && props.onRelease !== undefined) {
          props.onRelease()
          return
        }
        speech.onKeyDown(event)
      }}
    >
      <SpeakerName name={props.speakerName} />
      {props.text}
      {props.aim}
    </div>
  )
}

function StreamTime(props: { readonly time: ClockStamp; readonly shown: boolean }): ReactNode {
  return (
    props.time.kind === "known" && (
      <time
        className={clsx(styles["stream-time"], !props.shown && styles["stream-time-quiet"])}
        dateTime={props.time.dateTime}
        {...(props.shown ? {} : { "data-quiet": "" })}
      >
        {props.time.text}
      </time>
    )
  )
}

function SpeakerName(props: { readonly name: string }): ReactNode {
  return props.name !== "" && <VisuallyHidden element="span">{props.name}</VisuallyHidden>
}

function ignorePress(): void {}

/** 留めた行にフォーカスがある Esc か。変換中・修飾キーつき・重なる面が開いているあいだは譲る。 */
function releasesOnEscape(event: KeyboardEvent, selected: boolean): boolean {
  return (
    selected &&
    event.key === "Escape" &&
    !event.nativeEvent.isComposing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !isOverlayOpen()
  )
}
