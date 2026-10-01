// 吹き出しの並び。吹き出しはセリフ1件につき1つ、DOM は新しい順（先頭が最新）に並べる。
// CSS の `.balloon-track`（`column-reverse`。`character-view.module.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる。
//
// 吹き出しに出るのは `speak` で来たセリフと、反応の1行だけ。
// 反応はセリフより新しい位置（最新）に出す。
// セリフも反応も無ければ吹き出しを出さず、並びの器だけを残す（セリフのログが `anchor-name` で器に重なる）。

import type { ReactElement } from "react"

import styles from "../../character-view.module.css"
import type { BalloonReaction, CharacterViewSpeech } from "../../hooks/use-character-view.ts"
import { Balloon } from "../balloon/balloon.tsx"

export type BalloonTrackProps = {
  /** 古い→新しいの順（`SessionState.speeches` と同じ並び）。 */
  readonly speeches: readonly CharacterViewSpeech[]
  readonly reaction: BalloonReaction
  /**
   * 最新の吹き出しに添える話し手の名前（キャラクターの名前）。キャラクターが届いていない・名前が
   * 無いときは undefined で、名前を出さない。
   */
  readonly speakerName: string | undefined
}

export function BalloonTrack(props: BalloonTrackProps): ReactElement {
  const { reaction } = props
  const reacting = reaction.kind === "shown"

  // key は props.speeches の古い側から数えた位置（＝配列に足される前からの通し番号）。
  // speeches はターンの中で末尾へ積むだけ（`applySessionEvent`）なので、この番号はセリフが増えても既存のセリフでは変わらない。
  // 位置（newestFirst の index）を key にすると、増えるたびに既存のセリフの key がずれて、別のセリフの内容が同じ DOM ノードへ上書きされる。
  // すると `data-latest` が外れる瞬間が起きず、押し上げ（`character-view.module.css` の `.balloon[data-latest="false"]`）が再生されない。
  const newestFirst = [...props.speeches].reverse()
  const oldestIndexOf = (indexFromNewest: number): number =>
    props.speeches.length - 1 - indexFromNewest

  return (
    <div className={styles["balloon-track"]}>
      {reaction.kind === "shown" && (
        <Balloon
          key={`reaction-${reaction.reaction}`}
          text={reaction.text}
          latest={true}
          speaker={props.speakerName}
          interaction={{ kind: "reaction", reaction: reaction.reaction }}
        />
      )}
      {newestFirst.map((speech, index) => {
        const latest = !reacting && index === 0
        return (
          <Balloon
            key={oldestIndexOf(index)}
            text={speech.text}
            latest={latest}
            speaker={latest ? props.speakerName : undefined}
            interaction={{
              kind: "toggleable",
              selected: speech.selected,
              onToggle: speech.onToggle,
            }}
          />
        )
      })}
    </div>
  )
}
