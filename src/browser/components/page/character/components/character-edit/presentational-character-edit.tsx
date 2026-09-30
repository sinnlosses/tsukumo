// キャラクター画面の右側、選んでいるパックの詳しい設定の器。
// 上から 名乗り → 顔 → 表情の格子 → 差し色（画面の差し色と立ち絵の差し色を横に並べる） → 背景。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import characterStyles from "../../character.module.css"
import { AccentSwatch } from "../accent-swatch/accent-swatch.tsx"
import type { CharacterEditModel } from "../hooks/use-character-edit.ts"
import styles from "./character-edit.module.css"
import { CharacterDelete } from "./components/character-delete/character-delete.tsx"
import { CharacterProfile } from "./components/character-profile/character-profile.tsx"
import { ImageField } from "./components/image-field/image-field.tsx"
import { PortraitCard } from "./components/portrait-card/portrait-card.tsx"

export type PresentationalCharacterEditProps = CharacterEditModel

export function PresentationalCharacterEdit(
  props: PresentationalCharacterEditProps,
): ReactElement | null {
  if (props.kind === "waiting") {
    return null
  }

  return (
    <div className={styles["character-detail"]}>
      <CharacterProfile profile={props.profile} />
      <VStack
        element="section"
        name={{ kind: "labelledby", id: "character-face" }}
        ref={undefined}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-section"]}
      >
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          <span id="character-face">顔</span>
        </Heading>
        <ImageField field={props.face} disabled={props.disabled} />
      </VStack>
      <VStack
        element="section"
        name={{ kind: "labelledby", id: "character-expressions" }}
        ref={undefined}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-section"]}
      >
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          <span id="character-expressions">表情</span>
        </Heading>
        <div className={styles["character-gallery"]}>
          {props.cards.map((card) => (
            <PortraitCard key={card.expression} card={card} disabled={props.disabled} />
          ))}
        </div>
      </VStack>
      <div className={styles["character-accents"]}>
        <VStack
          element="section"
          name={{ kind: "labelledby", id: "character-screen-accent" }}
          ref={undefined}
          gap="md"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["character-section"]}
        >
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="sm"
            align="center"
            justify="start"
            wrap="nowrap"
            className={styles["character-section-bar"]}
          >
            <Heading level={2} size="body" tone="inherit" weight="bold" className="">
              <span id="character-screen-accent">画面の差し色</span>
            </Heading>
            {props.resetChatAccent.kind === "shown" ? (
              <Button
                type="button"
                variant="link"
                size="action"
                pressed="none"
                disabled={props.disabled}
                ariaLabel={undefined}
                disclosure={{ kind: "none" }}
                ariaHasPopup={undefined}
                title={undefined}
                className=""
                onClick={props.resetChatAccent.onClick}
              >
                雑談も仕事と同じにする
              </Button>
            ) : (
              <Text
                element="span"
                size="action"
                tone="ink-quiet"
                weight="normal"
                className={styles["character-section-note"]}
              >
                雑談も仕事と同じ
              </Text>
            )}
          </HStack>
          <div className={characterStyles["character-swatches-screen"]}>
            <AccentSwatch swatch={props.workAccent} disabled={props.disabled} />
            <AccentSwatch swatch={props.chatAccent} disabled={props.disabled} />
          </div>
        </VStack>
        <VStack
          element="section"
          name={{ kind: "labelledby", id: "character-outfit-accent" }}
          ref={undefined}
          gap="md"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["character-section"]}
        >
          <Heading level={2} size="body" tone="inherit" weight="bold" className="">
            <span id="character-outfit-accent">立ち絵の差し色</span>
          </Heading>
          <div className={styles["character-swatches-outfit"]}>
            {props.outfitAccents.map((field) => (
              <AccentSwatch key={field.outfit} swatch={field} disabled={props.disabled} />
            ))}
          </div>
        </VStack>
      </div>
      <VStack
        element="section"
        name={{ kind: "labelledby", id: "character-background" }}
        ref={undefined}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-section"]}
      >
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          <span id="character-background">背景</span>
        </Heading>
        <ImageField field={props.background} disabled={props.disabled} />
      </VStack>
      <CharacterDelete band={props.deleteBand} />
    </div>
  )
}
