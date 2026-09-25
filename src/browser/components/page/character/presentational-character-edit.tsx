// キャラクター画面の右側、**選んでいるパックの詳しい設定**の**器だけ**
// （<PresentationalCharacterEdit>。docs/screen-design.md 13.6 / 7.1）。上から 名乗り → 顔 →
// 表情の格子 → 差し色（画面の差し色と立ち絵の差し色を横に並べる） → 背景。名乗りは
// `components/character-profile.tsx`、顔は `components/face-field.tsx`、表情のカードは
// `components/portrait-card.tsx`、色見本は `components/accent-swatch.tsx`、背景は
// `components/background-field.tsx` に任せる。フックも算出も持たず、`hooks/use-character-edit.ts` が
// 畳んだ値をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { Heading } from "../../../components/ui/heading/heading.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { VStack } from "../../../components/ui/v-stack/v-stack.tsx"
import styles from "./character-screen.module.css"
import { AccentSwatch } from "./components/accent-swatch.tsx"
import { BackgroundField } from "./components/background-field.tsx"
import { CharacterDelete } from "./components/character-delete.tsx"
import { CharacterProfile } from "./components/character-profile.tsx"
import { FaceField } from "./components/face-field.tsx"
import { PortraitCard } from "./components/portrait-card.tsx"
import { type CharacterEditModel } from "./hooks/use-character-edit.ts"

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
        className={styles["character-section"] ?? ""}
      >
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          <span id="character-face">顔</span>
        </Heading>
        <FaceField face={props.face} disabled={props.disabled} />
      </VStack>
      <VStack
        element="section"
        name={{ kind: "labelledby", id: "character-expressions" }}
        ref={undefined}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-section"] ?? ""}
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
          className={styles["character-section"] ?? ""}
        >
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="sm"
            align="center"
            justify="start"
            wrap="nowrap"
            className=""
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
                className={styles["character-section-note"] ?? ""}
              >
                雑談も仕事と同じ
              </Text>
            )}
          </HStack>
          <div className={styles["character-swatches-screen"]}>
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
          className={styles["character-section"] ?? ""}
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
        className={styles["character-section"] ?? ""}
      >
        <Heading level={2} size="body" tone="inherit" weight="bold" className="">
          <span id="character-background">背景</span>
        </Heading>
        <BackgroundField background={props.background} disabled={props.disabled} />
      </VStack>
      <CharacterDelete band={props.deleteBand} />
    </div>
  )
}
