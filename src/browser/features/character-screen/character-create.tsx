// **新しいキャラクターパックを作るダイアログ**（<CharacterCreate>。キャラクター画面の
// 「新しく作る」から開く。`docs/design.md` 7.1 / `docs/screen-design.md` 13.6）の**入口**。
// 開いているかどうかは呼び出し側（`character-screen.tsx`）の state が持ち、ここへは `open` と
// `onClose` で渡す。作りかけの値・押せるか・作る先は `hooks/use-character-create.ts`、見た目は
// `presentational-character-create.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。**`onClose` だけはフックの戻り値に
// 含めず、ここで素通りさせる**（`features/task-board/task-board.tsx` と同じ形）。

import { type ReactElement } from "react"

import { useCharacterCreate } from "./hooks/use-character-create.ts"
import { PresentationalCharacterCreate } from "./presentational-character-create.tsx"

export type CharacterCreateProps = {
  readonly open: boolean
  readonly onClose: () => void
}

export function CharacterCreate(props: CharacterCreateProps): ReactElement {
  return (
    <PresentationalCharacterCreate
      {...useCharacterCreate(props.open, props.onClose)}
      onClose={props.onClose}
    />
  )
}
