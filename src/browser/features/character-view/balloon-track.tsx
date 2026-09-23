// 吹き出しの並び（<BalloonTrack>。docs/design.md 6.1）。**吹き出しはセリフ1件につき1つ**、
// DOM は新しい順（先頭が最新）に並べる。CSS の `.balloon-track`（`column-reverse`。
// `character-view.module.css`）が視覚上は最新を下端に置き、過去のセリフを上へ押し上げる
// （旧・サーバ側で HTML を組み立てていた頃と同じ並びの規約。docs/display.md 4.2「吹き出し」）。
//
// セリフが1件も無いときは、プレースホルダを吹き出し1件として出す（案内文に差し替える案を
// 見送った経緯は docs/history/tasks-archive.md）。
//
// **吹き出しに出るのは `speak` で来たセリフだけ。** ツールの実行中に「作業中」の一言を重ねる
// 経路は、表情の自動の上書きごと撤去した（docs/display.md 4.2）。

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
   * そのターン向けの文言を渡す（`src/browser/features/character-view/hooks/use-character-view.ts`）。
   */
  readonly emptyMessage: string | undefined
  /**
   * 最新の吹き出しに添える話し手の名前（キャラクターの名前）。キャラクターが届いていない・名前が
   * 無いときは undefined で、名前を出さない。**プレースホルダには添えない**（キャラクターの言葉ではない）。
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
        />
      </div>
    )
  }

  // DOM は新しい順（先頭が最新）。`.balloon-track` の column-reverse で視覚上は下端に出る。
  // key は props.speeches の古い側から数えた位置（＝配列に足される前からの通し番号）。
  // speeches はターンの中で末尾へ積むだけ（src/shared/session-state.ts）なので、この番号は
  // セリフが増えても既存のセリフでは変わらない。**位置（newestFirst の index）を key にすると、
  // 増えるたびに既存のセリフの key がずれて、別のセリフの内容が同じ DOM ノードへ上書きされる**
  // （React がノードを再利用してしまい、`:first-child` から外れる瞬間が起きないので
  // balloon-push-up が再生されない）。古い側からの通し番号なら、増えても自分のノードのまま
  // 位置だけ動く（＝CSS の `:first-child` から外れる瞬間が起きるので押し上げが再生される。
  // character-view.module.css の `.balloon:not(:first-child)` のコメント参照）。
  const newestFirst = [...props.speeches].reverse()
  const oldestIndexOf = (indexFromNewest: number): number =>
    props.speeches.length - 1 - indexFromNewest

  return (
    <div className={styles["balloon-track"]}>
      {newestFirst.map((speech, index) => (
        <Balloon
          key={oldestIndexOf(index)}
          text={speech}
          latest={index === 0}
          speaker={index === 0 ? props.speakerName : undefined}
        />
      ))}
    </div>
  )
}
