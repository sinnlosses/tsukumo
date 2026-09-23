// 送信⇄中断のボタンと経過/所要の表示（<TurnStatus>。docs/design.md 6.1）の**入口**。
// 経過時間の刻みと押す先の決め方は `hooks/use-turn-status.ts` が持ち、見た目は
// `presentational-turn-status.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useTurnStatus } from "./hooks/use-turn-status.ts"
import { PresentationalTurnStatus } from "./presentational-turn-status.tsx"

export function TurnStatus(): ReactElement {
  return <PresentationalTurnStatus {...useTurnStatus()} />
}
