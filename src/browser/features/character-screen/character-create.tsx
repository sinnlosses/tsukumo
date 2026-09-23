// **新しいキャラクターパックを作る画面**（<CharacterCreate>。`#character/new`。`docs/design.md`
// 7.1 / `docs/screen-design.md` 13.6）の**入口**。キャラクター画面から入り、左上の「← キャラクターへ戻る」で戻る。
// 作りかけの値・押せるか・作る／切り替えるの送り先は `hooks/use-character-create.ts`、見た目は
// `presentational-character-create.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useCharacterCreate } from "./hooks/use-character-create.ts"
import { PresentationalCharacterCreate } from "./presentational-character-create.tsx"

export function CharacterCreate(): ReactElement {
  return <PresentationalCharacterCreate {...useCharacterCreate()} />
}
