// キャラクター画面（`#character`。`docs/screen-design.md` 13.6 / 6.1）の入口。会話の画面と
// 入れ替わる（重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに
// 置く: パックの持ち物（立ち絵・差し色・背景）だけ。
//
// 新しく作るダイアログの開閉は `hooks/use-character.ts`、見た目は `presentational-character.tsx` が
// 持つ（docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useCharacter } from "./hooks/use-character.ts"
import { PresentationalCharacter } from "./presentational-character.tsx"

export function Character(): ReactElement {
  return <PresentationalCharacter {...useCharacter()} />
}
