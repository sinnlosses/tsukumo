// 吹き出しの並び（<BalloonTrack>。docs/design.md 6.1）。**吹き出しはセリフ1件につき1つ**、
// DOM は新しい順（先頭が最新）に並べる。CSS の `.balloon-track`（`column-reverse`。
// `src/ui/style/character.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる
// （旧・サーバ側で HTML を組み立てていた頃と同じ並びの規約。docs/requirements.md 4.2「吹き出し」）。
//
// セリフが1件も無いときは、プレースホルダを吹き出し1件として出す（案内文に差し替える案を
// 見送った経緯は docs/history/tasks-archive.md）。

import { type ReactElement } from "react"

import { Balloon } from "./balloon.tsx"

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

export type BalloonTrackProps = {
  /** 古い→新しいの順（`SessionState.speeches` と同じ並び）。 */
  readonly speeches: readonly string[]
}

export function BalloonTrack(props: BalloonTrackProps): ReactElement {
  if (props.speeches.length === 0) {
    return (
      <div className="balloon-track">
        <Balloon text={PLACEHOLDER_UTTERANCE} latest={true} />
      </div>
    )
  }

  // DOM は新しい順（先頭が最新）。`.balloon-track` の column-reverse で視覚上は下端に出る。
  const newestFirst = [...props.speeches].reverse()

  return (
    <div className="balloon-track">
      {newestFirst.map((speech, index) => (
        <Balloon key={index} text={speech} latest={index === 0} />
      ))}
    </div>
  )
}
