// キャラビュー本体（<CharacterView>。docs/design.md 6.1）の入口。ロジックは
// `hooks/use-character-view.ts` が持ち、見た目は `presentational-character-view.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter。1件目の `task-board` と
// 同じ形）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useCharacterView } from "./hooks/use-character-view.ts"
import { PresentationalCharacterView } from "./presentational-character-view.tsx"

export function CharacterView(): ReactElement {
  return <PresentationalCharacterView {...useCharacterView()} />
}
