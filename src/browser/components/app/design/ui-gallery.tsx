// `ui/` の部品を、状態ごとに代表を選んで並べる。

import type { ReactElement } from "react"

import { Badge } from "../../ui/badge/badge.tsx"
import { Button } from "../../ui/button/button.tsx"
import { Divider } from "../../ui/divider/divider.tsx"
import { Heading } from "../../ui/heading/heading.tsx"
import { Surface } from "../../ui/surface/surface.tsx"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"
import { Group } from "./ui-gallery-group.tsx"
import { InputGroups } from "./ui-gallery-input.tsx"
import { LayoutGroups } from "./ui-gallery-layout.tsx"
import { OverlayGroups } from "./ui-gallery-overlay.tsx"

const BADGE_TONES = ["neutral", "ok", "warn", "ng", "accent"] as const
const BADGE_SHAPES = ["pill", "square"] as const
const DIVIDER_TONES = ["strong", "soft", "quiet"] as const
const SURFACE_TONES = ["surface", "raised", "accent"] as const
const SURFACE_SHADOWS = ["none", "raised", "overlay"] as const
const BUTTON_VARIANTS = ["outline", "solid-accent", "solid-danger", "ghost", "link"] as const

export function UiGallery(): ReactElement {
  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      <Group title="Surface（地 × 影）" parts={["surface"]}>
        {SURFACE_TONES.flatMap((tone) =>
          SURFACE_SHADOWS.map((shadow) => (
            <Surface
              key={`${tone}-${shadow}`}
              element="div"
              tone={tone}
              space="md"
              radius="lg"
              shadow={shadow}
              className=""
            >
              <Text element="span" size="secondary" tone="ink" weight="normal" className="">
                {tone} / {shadow}
              </Text>
            </Surface>
          )),
        )}
      </Group>
      <Group title="Badge（色 × 形）" parts={["badge"]}>
        {BADGE_TONES.flatMap((tone) =>
          BADGE_SHAPES.map((shape) => (
            <Badge key={`${tone}-${shape}`} tone={tone} shape={shape} className="">
              {tone} {shape}
            </Badge>
          )),
        )}
      </Group>
      <Group title="Divider（濃さ × 向き）" parts={["divider"]}>
        {DIVIDER_TONES.map((tone) => (
          <div key={tone} className={styles["design-row"]}>
            <Divider tone={tone} orientation="horizontal" className="" />
            <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
              {tone}
            </Text>
            <Divider
              tone={tone}
              orientation="vertical"
              className={styles["design-vertical-rule"]}
            />
          </div>
        ))}
      </Group>
      <Group title="Button（種類 × 押せる・押せない）" parts={["button"]}>
        {BUTTON_VARIANTS.flatMap((variant) =>
          [false, true].map((disabled) => (
            <Button
              key={`${variant}-${String(disabled)}`}
              variant={variant}
              size="action"
              pressed="none"
              disabled={disabled}
              disclosure={{ kind: "none" }}
              className=""
              onClick={() => {}}
            >
              {variant}
              {disabled ? "（押せない）" : ""}
            </Button>
          )),
        )}
      </Group>
      <Group title="Heading・Text（字の段）" parts={["heading", "text"]}>
        <Heading level={3} size="heading" tone="ink" weight="bold" className="">
          見出し
        </Heading>
        <Text element="span" size="body" tone="ink" weight="normal" className="">
          本文
        </Text>
        <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
          補足
        </Text>
        <Text element="span" size="label" tone="accent" weight="semibold" className="">
          ラベル
        </Text>
      </Group>
      <InputGroups />
      <OverlayGroups />
      <LayoutGroups />
    </VStack>
  )
}
