// セリフのログ（<SpeechLog>）の**入口**。キャラビューの右上の「ログ」から開くモーダルで、
// **このセッションで言ったセリフをターンごとに並べる**。吹き出しは今のターンのぶんしか出さない
// （前のターンの最後の1件だけ残す。docs/requirements.md 4.2）ので、流れていったセリフを読み返す
// 口はここになる。
//
// 開閉と並びの組み立ては `hooks/use-speech-log.ts` が持ち、見た目は
// `presentational-speech-log.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useSpeechLog } from "./hooks/use-speech-log.ts"
import { PresentationalSpeechLog } from "./presentational-speech-log.tsx"

export function SpeechLog(): ReactElement {
  return <PresentationalSpeechLog {...useSpeechLog()} />
}
