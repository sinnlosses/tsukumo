// キャラクター画面のロジック。
// 新しく作るダイアログ（`<CharacterCreate>`）を開いているかどうかを state で持つ。表示上の状態なので URL には持たせない。
//
// 閉じるたびに `key` を進めて作り直す。
// 下書きの掃除を `<CharacterCreate>` の内側で state を戻す形にすると、作れたと分かった瞬間に `useEffect` の中で setState を呼ぶ形になる。

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
