// セリフのログの入口。キャラビューの右上の「ログ」（狭い画面では吹き出し）から開くモーダル。
// キャラビューの舞台をそのまま上へ伸ばし、このセッションで言ったセリフを吹き出しのまま遡って読む。

import type { ReactElement, ReactNode } from "react"

import type { PinnedSpeech } from "../../domain/pinned-speech.ts"
import { useSpeechLog } from "./hooks/use-speech-log.ts"
import { PresentationalSpeechLog } from "./presentational-speech-log.tsx"

export type SpeechLogProps = {
  /**
   * キャラビューに立っている立ち絵。キャラビューが渡す（表情・衣装・動きがキャラビューと
   * 同じものになる）。素材が無いときは何も描かない値。
   */
  readonly portrait: ReactNode
  /** 最新の吹き出しに添える話し手の名前。キャラビューの最新の吹き出しと同じもの。 */
  readonly speakerName: string | undefined
  /** いま留めている行（キャラビューと状態を共有する）。何も留めていなければ undefined。 */
  readonly pinnedSpeech: PinnedSpeech | undefined
  /** ログの行を押したとき。キャラビューの吹き出しと同じ状態を動かす。 */
  readonly onToggleSpeech: (turnId: number, index: number) => void
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
}

export function SpeechLog(props: SpeechLogProps): ReactElement {
  return (
    <PresentationalSpeechLog
      {...useSpeechLog(props.open, props.pinnedSpeech, props.onToggleSpeech)}
      open={props.open}
      onOpen={props.onOpen}
      onClose={props.onClose}
      portrait={props.portrait}
      speakerName={props.speakerName}
    />
  )
}
