// 吹き出しの並び（<BalloonTrack>。docs/design.md 6.1）。**吹き出しはセリフ1件につき1つ**、
// DOM は新しい順（先頭が最新）に並べる。CSS の `.balloon-track`（`column-reverse`。
// `character-view.module.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる
// （旧・サーバ側で HTML を組み立てていた頃と同じ並びの規約。docs/requirements.md 4.2「吹き出し」）。
//
// セリフが1件も無いときは、プレースホルダを吹き出し1件として出す（案内文に差し替える案を
// 見送った経緯は docs/history/tasks-archive.md）。
//
// **吹き出しに出るのは `speak` で来たセリフだけ。** ツールの実行中に「作業中」の一言を重ねる
// 経路は、表情の自動の上書きごと 2026-09-17 に撤去した（docs/requirements.md 4.2）。

import { type ReactElement } from "react"

import { Balloon } from "./balloon.tsx"
import styles from "./character-view.module.css"

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

export type BalloonTrackProps = {
  /** 古い→新しいの順（`SessionState.speeches` と同じ並び）。 */
  readonly speeches: readonly string[]
  /**
   * セリフが1件も無いときに出す文言。undefined なら今のターン向けの既定文
   * （「まだ」＝これから来る、の言い方）。**過去のターンには合わない**ので、呼び出し側が
   * そのターン向けの文言を渡す（`src/ui/features/character-view/character-view.tsx`）。
   */
  readonly emptyMessage: string | undefined
}

export function BalloonTrack(props: BalloonTrackProps): ReactElement {
  if (props.speeches.length === 0) {
    return (
      <div className={styles["balloon-track"]}>
        <Balloon text={props.emptyMessage ?? PLACEHOLDER_UTTERANCE} latest={true} />
      </div>
    )
  }

  // DOM は新しい順（先頭が最新）。`.balloon-track` の column-reverse で視覚上は下端に出る。
  const newestFirst = [...props.speeches].reverse()

  return (
    <div className={styles["balloon-track"]}>
      {newestFirst.map((speech, index) => (
        <Balloon key={index} text={speech} latest={index === 0} />
      ))}
    </div>
  )
}
