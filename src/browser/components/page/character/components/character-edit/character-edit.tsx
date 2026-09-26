// キャラクター画面の右側、選んでいるパックの詳しい設定（名乗り・表情・差し色・背景。<CharacterEdit>。
// `docs/screen-design.md` 13.6 / `docs/design.md` 7.1）の入口。選んでいるパックの姿を畳み、選んだ画像を送るのは
// `hooks/use-character-edit.ts`、見た目は `presentational-character-edit.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useCharacterEdit } from "../hooks/use-character-edit.ts"
import { PresentationalCharacterEdit } from "./presentational-character-edit.tsx"

export function CharacterEdit(): ReactElement {
  return <PresentationalCharacterEdit {...useCharacterEdit()} />
}
