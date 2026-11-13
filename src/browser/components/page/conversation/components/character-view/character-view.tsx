// キャラビュー本体の入口。

import type { ReactElement, ReactNode } from "react"

import { useCharacterView } from "./hooks/use-character-view.ts"
import {
  type CharacterViewPlacement,
  PresentationalCharacterView,
} from "./presentational-character-view.tsx"

/** `hands` は狭い画面で顔と吹き出しの下に出す「手元」か「待ち」の行。 */
export function CharacterView(props: {
  readonly hands?: ReactNode
  /** 舞台の吹き出しの下に出す「手元」「待ち」の行。 */
  readonly stageHands?: ReactNode
  /** 舞台のいちばん上の段に置く部屋の頭。 */
  readonly roomHead?: ReactNode
  /** 部屋の頭のすぐ下に置く「今日の灯り」。 */
  readonly today?: ReactNode
  readonly placement?: CharacterViewPlacement
}): ReactElement {
  return (
    <PresentationalCharacterView
      {...useCharacterView()}
      hands={props.hands}
      stageHands={props.stageHands}
      roomHead={props.roomHead}
      today={props.today}
      placement={props.placement}
    />
  )
}
