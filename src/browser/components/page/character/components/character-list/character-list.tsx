// キャラクター画面の左の列、パックの一覧（<CharacterList>。docs/screen-design.md 13.6）。
// 見出し「キャラクター」と件数、パックごとの行（丸い顔・名前・「表情 <枚数> · 使用中」）、点線の
// 「新しく作る」（押すと呼び出し側の `<CharacterCreate>` ダイアログを開く。`hooks/use-character.ts`）。
//
// 行はただのリンク（`#character?pack=<名前>`）で、押すと右側がそのパックの詳しい設定に替わる。
// 選んでいるパックは hash が持つので、再読み込みしても同じ行が選ばれたまま（`stores/screen.tsx`）。
// 選んでいる行は `aria-current="page"` で示す（色だけにしない。13.1 原則1）。
//
// ストアを読んで行へ畳み、渡された `onCreate` をそのまま口に付けるだけ（振る舞いは「畳む」の
// 1種類）なので、container / presenter には割らない（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { EXPRESSIONS } from "../../../../../../shared/expression.ts"
import { usePackHref } from "../../../../../stores/screen.tsx"
import { useSessionSelector } from "../../../../../stores/session.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import styles from "../../character.module.css"
import { PlusIcon } from "../action-icon/action-icon.tsx"
import { useSelectedPack } from "../hooks/use-selected-pack.ts"

export function CharacterList(props: { readonly onCreate: () => void }): ReactElement {
  const packs = useSessionSelector((session) => session.state.characterPacks)
  const selected = useSelectedPack()
  const packHref = usePackHref()
  const selectedName = selected.kind === "ready" ? selected.character.pack : undefined

  return (
    <nav className={styles["character-list"]} aria-label="キャラクター一覧">
      <div className={styles["character-list-heading"]}>
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          キャラクター
        </Heading>
        <Text element="span" size="action" tone="ink-quiet" weight="inherit" className="">
          {packs.length}
        </Text>
      </div>
      {packs.map((entry) => {
        const count = entry.character.expressionsWithPortrait.length
        const countText =
          count === EXPRESSIONS.length
            ? `表情 ${String(count)}`
            : `表情 ${String(count)} / ${String(EXPRESSIONS.length)}`
        const isSelected = entry.name === selectedName
        return (
          <a
            key={entry.name}
            className={styles["character-list-row"]}
            href={packHref(entry.name)}
            aria-current={isSelected ? "page" : undefined}
          >
            {entry.character.face === undefined ? (
              <span className={styles["character-list-face-blank"]} />
            ) : (
              <img className={styles["character-list-face"]} src={entry.character.face} alt="" />
            )}
            <VStack
              element="span"
              name={{ kind: "none" }}
              ref={undefined}
              gap="none"
              align="stretch"
              justify="start"
              wrap="nowrap"
              className={styles["character-list-text"] ?? ""}
            >
              <Text
                element="span"
                size="subheading"
                tone="inherit"
                weight={isSelected ? "bold" : "normal"}
                className={styles["character-list-name"] ?? ""}
              >
                {entry.label}
              </Text>
              <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
                {entry.inUse ? `${countText} · 使用中` : countText}
              </Text>
            </VStack>
          </a>
        )
      })}
      <button type="button" className={styles["character-list-new"]} onClick={props.onCreate}>
        <PlusIcon />
        新しく作る
      </button>
    </nav>
  )
}
