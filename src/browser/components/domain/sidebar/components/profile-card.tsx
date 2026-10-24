// 雑談中のサイドバーの最上段、プロフィールの札。
// 顔（`CharacterInfo.face`）・名前・自己紹介文（`CharacterInfo.tagline`）を並べる。
// キャラクターの切り替えは札に置かず、左上の帯の顔から開く選び口が持つ。
//
// 名前も自己紹介文も無ければその行を置かない（顔も `<CharacterFace>` が何も描かない）。

import type { ReactElement } from "react"

import { useSession } from "../../../../stores/session.ts"
import { Text } from "../../../ui/text/text.tsx"
import { VStack } from "../../../ui/v-stack/v-stack.tsx"
import { CharacterFace } from "../../character-face.tsx"
import styles from "./profile-card.module.css"

export function ProfileCard(): ReactElement {
  const faceUrl = useSession((session) => session.state.character?.face)
  const name = useSession((session) => session.state.character?.name)
  const tagline = useSession((session) => session.state.character?.tagline)

  return (
    <section className={styles["profile-card"]} aria-label="プロフィール">
      <CharacterFace url={faceUrl} alt={name ?? ""} className={styles["profile-card-face"]} />
      <VStack
        element="div"
        name={{ kind: "none" }}
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
    </section>
  )
}
