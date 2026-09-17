// 吹き出しの並び（<BalloonTrack>。docs/design.md 6.1）。**吹き出しはセリフ1件につき1つ**、
// DOM は新しい順（先頭が最新）に並べる。CSS の `.balloon-track`（`column-reverse`。
// `src/ui/styles/character.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる
// （旧・サーバ側で HTML を組み立てていた頃と同じ並びの規約。docs/requirements.md 4.2「吹き出し」）。
//
// セリフが1件も無いときは、プレースホルダを吹き出し1件として出す（案内文に差し替える案を
// 見送った経緯は docs/history/tasks-archive.md）。
//
// **ツールを実行している間の「作業中」の一言は、セリフの並び（`SessionState.speeches`）には
// 積まず、描くときにいちばん新しい吹き出しとして重ねる**（2026-09-17 決定。積むと記録
// （`SessionRecord`）とターンごとのセリフ（`protocol/turn-speech.ts`）にも混ざり、過去のターンを
// 遡ったときに「言っていないセリフ」が出てしまう）。ツールが終われば渡されなくなって消える。

import { type ReactElement } from "react"

import { Balloon } from "./balloon.tsx"

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
  /**
   * ツールを実行している間だけ、**いちばん新しい吹き出しとして重ねる一言**
   * （`character.json` の `workingSpeech`。文言はパックの定義から来る）。ツールが終われば
   * undefined になって消える。**セリフが0件のときはプレースホルダの代わりにこれだけが出る**
   * （「（まだ発話がありません）」は「いま出すものが無い」の言い方で、作業中には合わない）。
   */
  readonly workingSpeech: string | undefined
}

export function BalloonTrack(props: BalloonTrackProps): ReactElement {
  const speeches =
    props.workingSpeech === undefined ? props.speeches : [...props.speeches, props.workingSpeech]
  if (speeches.length === 0) {
    return (
      <div className="balloon-track">
        <Balloon text={props.emptyMessage ?? PLACEHOLDER_UTTERANCE} latest={true} />
      </div>
    )
  }

  // DOM は新しい順（先頭が最新）。`.balloon-track` の column-reverse で視覚上は下端に出る。
  const newestFirst = [...speeches].reverse()

  return (
    <div className="balloon-track">
      {newestFirst.map((speech, index) => (
        <Balloon key={index} text={speech} latest={index === 0} />
      ))}
    </div>
  )
}
