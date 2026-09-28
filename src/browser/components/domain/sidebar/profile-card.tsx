// 雑談中のサイドバーの最上段、プロフィールの札。
// 顔（`CharacterInfo.face`）・名前・ひとことプロフィール（`CharacterInfo.tagline`）と、右端の「変える ⌄」でキャラクターを切り替える。
//
// 「変える」は見た目のボタンの上に、透明にした本物の `<select>` を重ねたもの（`CharacterSwitch`）。
// ⌄ は共有の `<Select>` の枠が描く矢印で、枠ごと札の口いっぱいに広げるので、`<select>` を透明にしても矢印だけは見えたまま残る。
// 押すとブラウザの選択肢の一覧が開き、キーボード（矢印・先頭の字・Esc）も読み上げもブラウザが持つので、独自の開閉にしない。
// 見える字は「変える」のままで、選んでいるパックの名前は札の名前の側が見せる。
//
// 名前もひとことプロフィールも無ければその行を置かない（顔も `<CharacterFace>` が何も描かない）。

import type { ReactElement } from "react"

import { useSession } from "../../../stores/session.ts"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import { CharacterFace } from "../character-face.tsx"
import { CharacterSwitch } from "./character-switch.tsx"
import styles from "./sidebar.module.css"

const PROFILE_CHARACTER_SELECT_ID = "tsukumo-profile-character"

export function ProfileCard(): ReactElement {
  const faceUrl = useSession((session) => session.state.character?.face)
  const name = useSession((session) => session.state.character?.name)
  const tagline = useSession((session) => session.state.character?.tagline)
  const hasCharacterPacks = useSession((session) => session.state.characterPacks.length > 0)

  return (
    <section className={styles["profile-card"]} aria-label="プロフィール">
      <CharacterFace url={faceUrl} alt={name ?? ""} className={styles["profile-card-face"]} />
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="xs"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["profile-card-text"]}
      >
        {name !== undefined && (
          <Text
            element="p"
            size="heading"
            tone="ink"
            weight="bold"
            className={styles["profile-card-name"]}
          >
            {name}
          </Text>
        )}
        {tagline !== undefined && (
          <Text
            element="p"
            size="action"
            tone="ink-quiet"
            weight="inherit"
            className={styles["profile-card-tagline"]}
          >
            {tagline}
          </Text>
        )}
      </VStack>
      {hasCharacterPacks && (
        <span className={styles["profile-card-change"]}>
          <span aria-hidden="true" className={styles["profile-card-change-face"]}>
            変える
          </span>
          <CharacterSwitch
            id={PROFILE_CHARACTER_SELECT_ID}
            ariaLabel="キャラクターを変える"
            frameClassName={styles["profile-card-change-frame"]}
            className={styles["profile-card-change-select"]}
          />
        </span>
      )}
    </section>
  )
}
