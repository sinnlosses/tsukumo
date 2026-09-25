// `<Character>`（キャラクター画面）のロジック（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。**新しく作るダイアログ（`<CharacterCreate>`）を開いているかどうか**を
// state で持つ。表示上の状態なので URL には持たせない（`components/domain/sidebar/task-section.tsx` の
// `boardOpen` と同じ扱い。`docs/screen-design.md` 13.6）。
//
// **閉じるたびに `key` を進めて作り直す**——下書きの掃除を `<CharacterCreate>` の内側で state を
// 戻す形にすると、作れたと分かった瞬間に効果内で state を戻す呼び出しになり `useEffect` の中で
// setState を呼ぶ形になる。閉じる側（ここ）が `key` で作り直せば、次に開いたときは自然に空へ戻る
// （`docs/coding-standards.md`「useEffect の代わりに使うもの」の「props が変わったら state を
// 捨てる」）。

import { useState } from "react"

/** 新しく作るダイアログの開閉。`key` は閉じるたびに進み、次に開いたときに下書きを空へ戻す。 */
export type CharacterCreateDialogModel = {
  readonly key: number
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
}

export type UseCharacterResult = {
  readonly create: CharacterCreateDialogModel
}

export function useCharacter(): UseCharacterResult {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)

  return {
    create: {
      key,
      open,
      onOpen: () => {
        setOpen(true)
      },
      onClose: () => {
        setOpen(false)
        setKey((current) => current + 1)
      },
    },
  }
}
