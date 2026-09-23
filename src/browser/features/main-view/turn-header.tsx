// ターンの札の頭（`<TurnHeader>`。`docs/requirements.md` 4.2）の**入口**。
//
// 開閉・一覧の並び・前後の押す先は `hooks/use-turn-header.ts` が持ち、見た目は
// `presentational-turn-header.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useTurnHeader, type TurnHeaderProps } from "./hooks/use-turn-header.ts"
import { PresentationalTurnHeader } from "./presentational-turn-header.tsx"

export type { TurnHeaderEntry, TurnHeaderProps } from "./hooks/use-turn-header.ts"

export function TurnHeader(props: TurnHeaderProps): ReactElement {
  return <PresentationalTurnHeader {...useTurnHeader(props)} />
}
