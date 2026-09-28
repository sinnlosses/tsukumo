// 吹き出しの並び。吹き出しはセリフ1件につき1つ、DOM は新しい順（先頭が最新）に並べる。
// CSS の `.balloon-track`（`column-reverse`。`character-view.module.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる。
//
// セリフが1件も無いときは、プレースホルダを吹き出し1件として出す。
// 吹き出しに出るのは `speak` で来たセリフだけ。

import type { ReactElement } from "react"

import styles from "../../character-view.module.css"
import type { CharacterViewSpeech } from "../../hooks/use-character-view.ts"
import { Balloon } from "../balloon/balloon.tsx"

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

export type BalloonTrackProps = {
  /** 古い→新しいの順（`SessionState.speeches` と同じ並び）。 */
  readonly speeches: readonly CharacterViewSpeech[]
  /**
   * セリフが1件も無いときに出す文言。
   * undefined なら今のターン向けの既定文（「まだ」＝これから来る、の言い方）。
   * 過去のターンには合わないので、呼び出し側がそのターン向けの文言を渡す。
   */
  readonly emptyMessage: string | undefined
  /**
   * 最新の吹き出しに添える話し手の名前（キャラクターの名前）。キャラクターが届いていない・名前が
   * 無いときは undefined で、名前を出さない。プレースホルダには添えない（キャラクターの言葉ではない）。
   */
  readonly speakerName: string | undefined
}

export function BalloonTrack(props: BalloonTrackProps): ReactElement {
  if (props.speeches.length === 0) {
    return (
      <div className={styles["balloon-track"]}>
        <Balloon
          text={props.emptyMessage ?? PLACEHOLDER_UTTERANCE}
          latest={true}
          speaker={undefined}
          interaction={{ kind: "static" }}
        />
      </div>
    )
  }

  // key は props.speeches の古い側から数えた位置（＝配列に足される前からの通し番号）。
  // speeches はターンの中で末尾へ積むだけ（`applySessionEvent`）なので、この番号はセリフが増えても既存のセリフでは変わらない。
  // 位置（newestFirst の index）を key にすると、増えるたびに既存のセリフの key がずれて、別のセリフの内容が同じ DOM ノードへ上書きされる。
  // すると `data-latest` が外れる瞬間が起きず、押し上げ（`character-view.module.css` の `.balloon[data-latest="false"]`）が再生されない。
  const newestFirst = [...props.speeches].reverse()
  const oldestIndexOf = (indexFromNewest: number): number =>
    props.speeches.length - 1 - indexFromNewest

  return (
    <div className={styles["balloon-track"]}>
      {newestFirst.map((speech, index) => (
        <Balloon
          key={oldestIndexOf(index)}
          text={speech.text}
          latest={index === 0}
          speaker={index === 0 ? props.speakerName : undefined}
          interaction={{ kind: "toggleable", selected: speech.selected, onToggle: speech.onToggle }}
        />
      ))}
    </div>
  )
}
