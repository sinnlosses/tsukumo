// キャラクター画面の左の列、パックの一覧。
// 見出しと件数は重ねる紙の頭が持つ。ここはパックごとの行（丸い顔・名前・「表情 <枚数> · 使用中」）、点線の「新しく作る」を置く。
//
// 行はただのリンク（`#character?pack=<名前>`）で、押すと右側がそのパックの詳しい設定に替わる。
// 選んでいる行は `aria-current="page"` で示す（色だけにしない）。

import type { ReactElement } from "react"

import { EXPRESSIONS } from "../../../../../../shared/character-pack/expression.ts"
import { usePackHref } from "../../../../../stores/screen.tsx"
import { useSession } from "../../../../../stores/session.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { PlusIcon } from "../../../../ui/icon/icon.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { useSelectedPack } from "../hooks/use-selected-pack.ts"
import styles from "./character-list.module.css"

export function CharacterList(props: { readonly onCreate: () => void }): ReactElement {
  const packs = useSession((session) => session.state.characterPacks)
  const selected = useSelectedPack()
  const packHref = usePackHref()
  const selectedName = selected.kind === "ready" ? selected.character.pack : undefined

  return (
    <nav className={styles["character-list"]} aria-label="キャラクター一覧">
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
              gap="none"
              align="stretch"
              justify="start"
              wrap="nowrap"
              className={styles["character-list-text"]}
            >
              <Text
                element="span"
                size="subheading"
                tone="inherit"
                weight={isSelected ? "bold" : "normal"}
                className={styles["character-list-name"]}
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
      <Button
        variant="outline-dashed"
        size="subheading"
        pressed="none"
        disabled={false}
        disclosure={{ kind: "none" }}
        className={styles["character-list-new"]}
        onClick={props.onCreate}
      >
        <PlusIcon />
        新しく作る
      </Button>
    </nav>
  )
}
