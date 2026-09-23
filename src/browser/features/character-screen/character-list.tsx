// キャラクター画面の左の列、**パックの一覧**（<CharacterList>。docs/screen-design.md 13.6）。
// 見出し「キャラクター」と件数、パックごとの行（丸い顔・名前・「表情 <枚数> · 使用中」）、点線の
// 「新しく作る」（作る画面 `#character/new` へのリンク）。
//
// **行はただのリンク**（`#character?pack=<名前>`）で、押すと右側がそのパックの詳しい設定に替わる。
// 選んでいるパックは hash が持つので、再読み込みしても同じ行が選ばれたまま（`stores/screen.tsx`）。
// 選んでいる行は `aria-current="page"` で示す（色だけにしない。13.1 原則1）。
//
// ストアを読んで行へ畳むだけ（振る舞いは「畳む」の1種類）なので、container / presenter には
// 割らない（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { EXPRESSIONS } from "../../../shared/expression.ts"
import { usePackHref, useScreenHref } from "../../stores/screen.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./character-screen.module.css"
import { PlusIcon } from "./components/action-icon.tsx"
import { useSelectedPack } from "./hooks/use-selected-pack.ts"

export function CharacterList(): ReactElement {
  const packs = useSessionSelector((session) => session.state.characterPacks)
  const selected = useSelectedPack()
  const packHref = usePackHref()
  const screenHref = useScreenHref()
  const selectedName = selected.kind === "ready" ? selected.character.pack : undefined

  return (
    <nav className={styles["character-list"]} aria-label="キャラクター一覧">
      <div className={styles["character-list-heading"]}>
        <h2 className={styles["character-section-heading"]}>キャラクター</h2>
        <span className={styles["character-list-count"]}>{packs.length}</span>
      </div>
      {packs.map((entry) => {
        const count = entry.character.expressionsWithPortrait.length
        const countText =
          count === EXPRESSIONS.length
            ? `表情 ${String(count)}`
            : `表情 ${String(count)} / ${String(EXPRESSIONS.length)}`
        return (
          <a
            key={entry.name}
            className={styles["character-list-row"]}
            href={packHref(entry.name)}
            aria-current={entry.name === selectedName ? "page" : undefined}
          >
            {entry.character.face === undefined ? (
              <span className={styles["character-list-face-blank"]} />
            ) : (
              <img className={styles["character-list-face"]} src={entry.character.face} alt="" />
            )}
            <span className={styles["character-list-text"]}>
              <span className={styles["character-list-name"]}>{entry.label}</span>
              <span className={styles["character-list-meta"]}>
                {entry.inUse ? `${countText} · 使用中` : countText}
              </span>
            </span>
          </a>
        )
      })}
      <a className={styles["character-list-new"]} href={screenHref("character-create")}>
        <PlusIcon />
        新しく作る
      </a>
    </nav>
  )
}
