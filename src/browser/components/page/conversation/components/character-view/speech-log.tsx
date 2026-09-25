// セリフのログ（<SpeechLog>）の**入口**。キャラビューの右上の「ログ」から開くモーダルで、
// **キャラビューの舞台をそのまま上へ伸ばし、このセッションで言ったセリフを吹き出しのまま遡って
// 読む**。吹き出しは今のターンのぶんしか出さない
// （前のターンの最後の1件だけ残す。docs/display.md 4.2）ので、流れていったセリフを読み返す
// 口はここになる。
//
// 開閉と並びの組み立ては `hooks/use-speech-log.ts` が持ち、見た目は
// `presentational-speech-log.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement, type ReactNode } from "react"

import { useSpeechLog } from "./hooks/use-speech-log.ts"
import { PresentationalSpeechLog } from "./presentational-speech-log.tsx"

export type SpeechLogProps = {
  /**
   * キャラビューに立っている立ち絵。**キャラビューが渡す**（表情・衣装・動きがキャラビューと
   * 同じものになる）。素材が無いときは何も描かない値。
   */
  readonly portrait: ReactNode
  /** 最新の吹き出しに添える話し手の名前。キャラビューの最新の吹き出しと同じもの。 */
  readonly speakerName: string | undefined
}

export function SpeechLog(props: SpeechLogProps): ReactElement {
  return <PresentationalSpeechLog {...useSpeechLog()} {...props} />
}
