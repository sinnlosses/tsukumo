// キャラビュー本体の**器だけ**（<PresentationalCharacterView>。docs/design.md 6.1）。立ち絵
// （<Portrait>）と吹き出しの並び（<BalloonTrack>）を同じ領域に同居させる
// （`docs/glossary.md`「キャラビュー」）。フックも算出も持たず、`hooks/use-character-view.ts` が
// 組み立てた値をそのまま部品へ渡す（docs/design.md 2章「機能の中を分ける」）。
//
// 右上の「ログ」（<SpeechLog>）は自分で記録を読む部品で、ここは置くだけ。ログの床にも同じ
// 立ち絵を立たせるので、立ち絵と話し手の名前はここから渡す。
//
// **立ち絵の素材（URL）が無いときは `<Portrait>` を出さず、吹き出しだけで成立させる**
// （docs/requirements.md 4.2「フォールバック」）。

import { type ReactElement } from "react"

import { Portrait } from "../../components/portrait.tsx"
import { BalloonTrack } from "./balloon-track.tsx"
import styles from "./character-view.module.css"
import { type CharacterViewModel } from "./hooks/use-character-view.ts"
import { SpeechLog } from "./speech-log.tsx"

export type PresentationalCharacterViewProps = CharacterViewModel

export function PresentationalCharacterView({
  portraitUrl,
  accent,
  altText,
  expression,
  outfit,
  motion,
  speeches,
  emptyMessage,
  speakerName,
}: PresentationalCharacterViewProps): ReactElement {
  const portrait = portraitUrl !== undefined && (
    <Portrait
      url={portraitUrl}
      accent={accent}
      altText={altText}
      expression={expression}
      outfit={outfit}
      motion={motion}
      className={styles["portrait"]}
    />
  )
  return (
    <div className={styles["character-region"]}>
      <SpeechLog portrait={portrait} speakerName={speakerName} />
      <div className={styles["character-layout"]}>
        {portrait}
        <BalloonTrack speeches={speeches} emptyMessage={emptyMessage} speakerName={speakerName} />
      </div>
    </div>
  )
}
