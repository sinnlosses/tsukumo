// 吹き出し1件。
//
// 最新かどうかの見た目の強弱は `data-latest` を読む CSS（`character-view.module.css` の `.balloon[data-latest="true"]`）が担う。
// 並びの中の位置では決めない（セリフのログでは吹き出しが1件ずつ行に包まれている）。
//
// 話し手の名前は最新の1件にだけ添える（どれを誰が言ったかは尻尾が結ぶので、過去の分に繰り返さない）。
//
// `interaction` が `toggleable` のときは押せる（押すとそのセリフの表情へ立ち絵が遡る）。
// 押し方の読み替え（ドラッグとの見分け・キー）は `useSpeechPress` が持つ。
// `<button>` ではなく `role="button"` の `<div>` にするのは、ブラウザが `<button>` の中の文字をドラッグで掴ませないため。

import type { ReactElement } from "react"

import type { ReactionKind } from "../../../../../../../../shared/recommendation/reaction.ts"
import { Text } from "../../../../../../ui/text/text.tsx"
import { TypingDots } from "../../../../../../ui/typing-dot-list/typing-dot-list.tsx"
import type { ClockStamp } from "../../../../domain/clock-stamp.ts"
import { useSpeechPress } from "../../../hooks/use-speech-press.ts"
import characterViewStyles from "../../character-view.module.css"
import type { SpeechTarget } from "../../domain/pinned-speech.ts"
import styles from "./balloon.module.css"

/**
 * 押せるか（押せるなら、印の状態と押されたときの呼び先を持つ）。
 * `reaction` は反応の吹き出しで、記録に無いので押せない（`data-reaction` に出来事を出す）。
 * `writing` は迎えの挨拶を書いている途中の吹き出しで、`props.text` を使わず点3つを出す。
 */
type BalloonInteraction =
  | { readonly kind: "reaction"; readonly reaction: ReactionKind }
  | { readonly kind: "writing" }
  | {
      readonly kind: "toggleable"
      readonly selected: boolean
      /** 押したときに遡る先。特定できないセリフは undefined で、押しても何もしない。 */
      readonly target: SpeechTarget | undefined
      readonly onToggleSpeech: (turnId: number, index: number) => void
    }

type BalloonProps = {
  /** `interaction.kind === "writing"` のときは使わない。 */
  readonly text: string
  /** 並びの中でいちばん新しいセリフか（`data-latest` に出し、CSS が最新の見た目を当てる）。 */
  readonly latest: boolean
  /** 本文の上に添える話し手の名前。添えないなら undefined。 */
  readonly speaker: string | undefined
  /** 話し手の名前の隣に添える時刻。名前を添えないときは出さない。 */
  readonly time: ClockStamp
  readonly interaction: BalloonInteraction
}

export function Balloon(props: BalloonProps): ReactElement {
  const { interaction } = props
  const press = useSpeechPress(() => {
    if (interaction.kind === "toggleable" && interaction.target !== undefined) {
      interaction.onToggleSpeech(interaction.target.turnId, interaction.target.index)
    }
  })
  const speakerLabel = props.speaker !== undefined && (
    <span className={styles["balloon-head"]}>
      <Text
        element="span"
        size="label"
        tone="accent"
        weight="bold"
        className={styles["balloon-speaker"]}
      >
        {props.speaker}
      </Text>
      {props.time.kind === "known" && (
        <time className={styles["balloon-time"]} dateTime={props.time.dateTime}>
          {props.time.text}
        </time>
      )}
    </span>
  )
  const body = (
    <>
      {speakerLabel}
      <Text
        element="span"
        size="inherit"
        tone="inherit"
        weight="inherit"
        className={styles["balloon-text"]}
      >
        {props.text}
      </Text>
    </>
  )

  if (interaction.kind === "writing") {
    return (
      <div
        className={characterViewStyles["balloon"]}
        data-latest={props.latest}
        data-writing="true"
      >
        {speakerLabel}
        <TypingDots />
      </div>
    )
  }

  if (interaction.kind === "reaction") {
    return (
      <div
        className={characterViewStyles["balloon"]}
        data-latest={props.latest}
        data-reaction={interaction.reaction}
      >
        {body}
      </div>
    )
  }

  return (
    <div
      className={characterViewStyles["balloon"]}
      data-latest={props.latest}
      data-interactive="true"
      data-selected={interaction.selected}
      role="button"
      tabIndex={0}
      aria-pressed={interaction.selected}
      onMouseDown={press.onMouseDown}
      onClick={press.onClick}
      onKeyDown={press.onKeyDown}
    >
      {body}
    </div>
  )
}
