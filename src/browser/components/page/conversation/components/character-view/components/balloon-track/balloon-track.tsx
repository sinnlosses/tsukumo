// 吹き出しの並び。吹き出しはセリフ1件につき1つ、DOM は新しい順（先頭が最新）に並べる。
// CSS の `.balloon-track`（`column-reverse`。`character-view.module.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる。
//
// 吹き出しに出るのは `speak` で来たセリフと、反応の1行だけ。
// 反応はセリフより新しい位置（最新）に出す。
// セリフも反応も無ければ吹き出しを出さず、並びの器だけを残す（セリフのログが `anchor-name` で器に重なる）。
//
// 時刻は、名前を添える最新の1件では名前の隣、ほかは吹き出しの脇（`.balloon-row`）に出す。時刻が分からなければ出さない。

import type { ReactElement, ReactNode } from "react"

import type { ClockStamp } from "../../../../domain/clock-stamp.ts"
import styles from "../../character-view.module.css"
import type { BalloonReaction, CharacterViewSpeech } from "../../hooks/use-character-view.ts"
import { Balloon } from "../balloon/balloon.tsx"

const NO_TIME = { kind: "unknown" } satisfies ClockStamp

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
  const { reaction, speakerName } = props
  const reacting = reaction.kind === "shown" || reaction.kind === "writing"

  // key は props.speeches の古い側から数えた位置（＝配列に足される前からの通し番号）。
  // speeches はターンの中で末尾へ積むだけ（`applySessionEvent`）なので、この番号はセリフが増えても既存のセリフでは変わらない。
  // 位置（newestFirst の index）を key にすると、増えるたびに既存のセリフの key がずれて、別のセリフの内容が同じ DOM ノードへ上書きされる。
  // すると `data-latest` が外れる瞬間が起きず、押し上げ（`character-view.module.css` の `.balloon-row` の `balloon-push-up`）が再生されない。
  const newestFirst = [...props.speeches].reverse()
  const oldestIndexOf = (indexFromNewest: number): number =>
    props.speeches.length - 1 - indexFromNewest

  return (
    <div className={styles["balloon-track"]}>
      {reaction.kind === "shown" && (
        <BalloonRow
          key={`reaction-${reaction.reaction}`}
          sideTime={speakerName === undefined ? reaction.time : NO_TIME}
        >
          <Balloon
            text={reaction.text}
            latest={true}
            speaker={speakerName}
            time={reaction.time}
            interaction={{ kind: "reaction", reaction: reaction.reaction }}
          />
        </BalloonRow>
      )}
      {reaction.kind === "writing" && (
        <BalloonRow key="reaction-writing" sideTime={NO_TIME}>
          <Balloon
            text=""
            latest={true}
            speaker={speakerName}
            time={NO_TIME}
            interaction={{ kind: "writing" }}
          />
        </BalloonRow>
      )}
      {newestFirst.map((speech, index) => {
        const latest = !reacting && index === 0
        const speaker = latest ? speakerName : undefined
        return (
          <BalloonRow
            key={oldestIndexOf(index)}
            sideTime={speaker === undefined ? speech.time : NO_TIME}
          >
            <Balloon
              text={speech.text}
              latest={latest}
              speaker={speaker}
              time={speech.time}
              interaction={{
                kind: "toggleable",
                selected: speech.selected,
                onToggle: speech.onToggle,
              }}
            />
          </BalloonRow>
        )
      })}
    </div>
  )
}

/** 吹き出し1件と、その脇の時刻（`sideTime` が分からなければ出さない）。 */
function BalloonRow(props: {
  readonly sideTime: ClockStamp
  readonly children: ReactNode
}): ReactElement {
  return (
    <div className={styles["balloon-row"]}>
      {props.children}
      {props.sideTime.kind === "known" && (
        <time className={styles["balloon-side-time"]} dateTime={props.sideTime.dateTime}>
          {props.sideTime.text}
        </time>
      )}
    </div>
  )
}
