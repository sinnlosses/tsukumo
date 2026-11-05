// 見本帳の `ui/` の節のうち、配置（Stack・HStack）・アイコン・読み込み中（Skeleton・Spinner・TypingDots）の部品。

import type { ReactElement, ReactNode } from "react"

import { HStack } from "../../ui/h-stack/h-stack.tsx"
import {
  AchievementIcon,
  ArrowRightIcon,
  ChatIcon,
  CharacterIcon,
  HistoryIcon,
  ListIcon,
  MaximizeIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SwitchIcon,
  TokenIcon,
  TrashIcon,
  UploadIcon,
  WorkIcon,
} from "../../ui/icon/icon.tsx"
import { Skeleton } from "../../ui/skeleton/skeleton.tsx"
import { Spinner } from "../../ui/spinner/spinner.tsx"
import { Stack } from "../../ui/stack/stack.tsx"
import { Surface } from "../../ui/surface/surface.tsx"
import { Text } from "../../ui/text/text.tsx"
import { TypingDots } from "../../ui/typing-dot-list/typing-dot-list.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"
import { Group } from "./ui-gallery-group.tsx"

const ICONS = [
  UploadIcon,
  TrashIcon,
  PlusIcon,
  SwitchIcon,
  PencilIcon,
  RefreshIcon,
  ArrowRightIcon,
  MaximizeIcon,
  ListIcon,
  HistoryIcon,
  WorkIcon,
  ChatIcon,
  CharacterIcon,
  TokenIcon,
  AchievementIcon,
] as const

export function LayoutGroups(): ReactElement {
  return (
    <>
      <Group title="Stack・HStack・VStack（向き × 間隔）" parts={["stack", "h-stack", "v-stack"]}>
        <VStack
          element="div"
          name={{ kind: "none" }}
          gap="xs"
          align="start"
          justify="start"
          wrap="nowrap"
          className=""
        >
          <Cell>VStack の1</Cell>
          <Cell>VStack の2</Cell>
        </VStack>
        <Stack
          element="div"
          name={{ kind: "none" }}
          direction="row"
          gap="sm"
          align="center"
          justify="between"
          wrap="nowrap"
          className=""
        >
          <Cell>Stack の1</Cell>
          <Cell>Stack の2</Cell>
        </Stack>
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="lg"
          align="center"
          justify="start"
          wrap="wrap"
          className=""
        >
          <Cell>横に並ぶ1</Cell>
          <Cell>横に並ぶ2</Cell>
        </HStack>
      </Group>
      <Group title="Icon（口に添える絵）" parts={["icon"]}>
        {ICONS.map((Icon) => (
          <Icon key={Icon.name} />
        ))}
      </Group>
      <Group title="Skeleton（読み込み中の塊）" parts={["skeleton"]}>
        <Skeleton className={styles["design-skeleton"]}>{undefined}</Skeleton>
      </Group>
      <Group title="Spinner（回る輪）" parts={["spinner"]}>
        <Spinner className="" />
      </Group>
      <Group title="TypingDots（書いている点）" parts={["typing-dot-list"]}>
        <TypingDots />
      </Group>
    </>
  )
}

function Cell(props: { readonly children: ReactNode }): ReactElement {
  return (
    <Surface element="div" tone="raised" space="sm" radius="md" shadow="none" className="">
      <Text element="span" size="secondary" tone="ink" weight="normal" className="">
        {props.children}
      </Text>
    </Surface>
  )
}
