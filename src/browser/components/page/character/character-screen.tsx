// キャラクター画面（`#character`。`docs/screen-design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// **パックの持ち物（立ち絵・差し色・背景）だけ**。
//
// **左に一覧（`<CharacterList>`）、右に選んでいるパックの詳しい設定（`<CharacterEdit>`）の2段組。**
// 選んでいるパックは hash の `pack`（`stores/screen.tsx`）が持ち、使用中以外のパックも右側で
// そのまま直せる（書き込む先はコマンドの `pack`。`docs/design.md` 7.1）。
//
// **新しく作るダイアログ（`<CharacterCreate>`）を開いているかどうかは、ここが state で持つ。**
// 表示上の状態なので URL には持たせない（`components/domain/sidebar/task-section.tsx` の `boardOpen` と
// 同じ扱い。`docs/screen-design.md` 13.6）。**閉じるたびに `key` を進めて作り直す**——下書きの
// 掃除を `<CharacterCreate>` の内側で state を戻す形にすると、作れたと分かった瞬間に効果内で
// state を戻す呼び出しになり `useEffect` の中で setState を呼ぶ形になる。閉じる側（ここ）が
// `key` で作り直せば、次に開いたときは自然に空へ戻る
// （`docs/coding-standards.md`「useEffect の代わりに使うもの」の「props が変わったら state を
// 捨てる」）。
//
// **会話へ戻る口と答え待ちの印は、全画面の最上部の帯**（`components/domain/screen-nav/`。13.9）に
// あるので、この画面は持たない。
//
// **地・領域・字の色（利用者の設定）は帯の歯車にある**（13.6 の表。色を「利用者が決める部分」と
// 「キャラクターが決める部分」に割ったので、パックの持ち物である差し色だけがここに残る）。

import { useState, type ReactElement } from "react"

import { CharacterCreate } from "./character-create.tsx"
import { CharacterEdit } from "./character-edit.tsx"
import { CharacterList } from "./character-list.tsx"
import styles from "./character-screen.module.css"

export function CharacterScreen(): ReactElement {
  const [createOpen, setCreateOpen] = useState(false)
  const [createKey, setCreateKey] = useState(0)

  return (
    <div className={styles["character-screen-columns"]}>
      <CharacterList
        onCreate={() => {
          setCreateOpen(true)
        }}
      />
      <CharacterEdit />
      <CharacterCreate
        key={createKey}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setCreateKey((key) => key + 1)
        }}
      />
    </div>
  )
}
