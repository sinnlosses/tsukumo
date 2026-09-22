// 入力欄本体（<Composer>。docs/design.md 6.1）の**入口**。下書き・補完の候補と選択位置・添えた
// 画像とキーの読み替えは `hooks/use-composer.ts` が持ち、見た目（`<textarea>`・候補一覧・
// <TurnStatus> を含む `<form>`）は `presentational-composer.tsx` が持つ（docs/design.md 2章
// 「機能の中を分ける」の container / presenter）。
//
// `/` と `@` の**絞り方**は `command-suggestions.tsx` / `file-suggestions.tsx` にあり、
// **キー操作と確定**はフックが持つ（送信の Enter と同じ `keydown` を共有するため）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useComposer } from "./hooks/use-composer.ts"
import { PresentationalComposer } from "./presentational-composer.tsx"

export function Composer(): ReactElement {
  return <PresentationalComposer {...useComposer()} />
}
