// `ui/` の部品を、状態ごとに代表を選んで並べる。

import type { ReactElement } from "react"

import { Badge } from "../../ui/badge/badge.tsx"
import { Button } from "../../ui/button/button.tsx"
import { ClickableCard } from "../../ui/clickable-card/clickable-card.tsx"
import { CodeBlock } from "../../ui/code-block/code-block.tsx"
import { Collapsible } from "../../ui/collapsible/collapsible.tsx"
import { Disclosure } from "../../ui/disclosure/disclosure.tsx"
import { Divider } from "../../ui/divider/divider.tsx"
import { ExpandButton } from "../../ui/expand-button/expand-button.tsx"
import { SaveButton } from "../../ui/expand-button/save-button.tsx"
import { FirstNoteList } from "../../ui/first-note-list/first-note-list.tsx"
import { Heading } from "../../ui/heading/heading.tsx"
import { CheckIcon, CopyIcon } from "../../ui/icon/icon.tsx"
import { Kbd } from "../../ui/kbd/kbd.tsx"
import { List, ListItem } from "../../ui/list/list.tsx"
import { MetadataList, MetadataListItem } from "../../ui/metadata-list/metadata-list.tsx"
import { Note } from "../../ui/note/note.tsx"
import { Quote } from "../../ui/quote/quote.tsx"
import { SmallIconButton } from "../../ui/small-icon-button/small-icon-button.tsx"
import { StatusDot } from "../../ui/status-dot/status-dot.tsx"
import { Step, Stepper } from "../../ui/stepper/stepper.tsx"
import { Surface } from "../../ui/surface/surface.tsx"
import {
  Table,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRows,
} from "../../ui/table/table.tsx"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"
import { Group } from "./ui-gallery-group.tsx"
import { InputGroups } from "./ui-gallery-input.tsx"
import { LayoutGroups } from "./ui-gallery-layout.tsx"
import { OverlayGroups } from "./ui-gallery-overlay.tsx"

const BADGE_TONES = ["neutral", "ok", "warn", "ng", "accent"] as const
const BADGE_SHAPES = ["pill", "square"] as const
const CLICKABLE_CARD_TONES = ["plain", "accent", "danger", "dashed"] as const
const STATUS_DOT_TONES = ["accent", "ok", "ng", "neutral"] as const
const DIVIDER_TONES = ["strong", "soft", "quiet"] as const
const SURFACE_TONES = ["surface", "raised", "accent", "ground"] as const
const SURFACE_RADII = ["sm", "md", "lg", "xl"] as const
const SURFACE_SHADOWS = ["none", "raised", "overlay"] as const
const NOTE_TONES = ["info", "warn", "ng", "ask"] as const
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
      <Group title="Surface（地 × 影・角丸）" parts={["surface"]}>
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
        {SURFACE_RADII.map((radius) => (
          <Surface
            key={`radius-${radius}`}
            element="div"
            tone="surface"
            space="md"
            radius={radius}
            shadow="none"
            className=""
          >
            <Text element="span" size="secondary" tone="ink" weight="normal" className="">
              radius {radius}
            </Text>
          </Surface>
        ))}
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
      <Group title="ClickableCard（縁）" parts={["clickable-card"]}>
        {CLICKABLE_CARD_TONES.map((tone) => (
          <ClickableCard key={tone} label={tone} tone={tone} onClick={() => {}} className="">
            <Text element="span" size="secondary" tone="ink" weight="normal" className="">
              {tone}
            </Text>
          </ClickableCard>
        ))}
      </Group>
      <Group title="StatusDot（色）" parts={["status-dot"]}>
        {STATUS_DOT_TONES.map((tone) => (
          <span key={tone} className={styles["design-row"]}>
            <StatusDot tone={tone} label={tone} />
            <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
              {tone}
            </Text>
          </span>
        ))}
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
      <Group title="Disclosure（閉じている・開いている）" parts={["disclosure"]}>
        {[false, true].map((open) => (
          <Disclosure
            key={String(open)}
            open={open}
            gap="block"
            hiddenOnNarrow={false}
            summaryTone="ink-quiet"
            summarySize="label"
            className=""
            summaryClassName=""
            summary={open ? "開いている" : "閉じている"}
          >
            <Text element="p" size="secondary" tone="ink" weight="normal" className="">
              開くと出る中身
            </Text>
          </Disclosure>
        ))}
      </Group>
      <Group title="ExpandButton（広げる）" parts={["expand-button"]}>
        <ExpandButton className="" onClick={() => {}} />
        <SaveButton placement="head" state="idle" className="" onClick={() => {}} />
      </Group>
      <Group title="SmallIconButton（絵だけの小さなボタン）" parts={["small-icon-button"]}>
        <SmallIconButton label="コピー" tooltip="コピー" onClick={() => {}}>
          <CopyIcon />
        </SmallIconButton>
        <SmallIconButton label="コピーした" tooltip="コピー" onClick={() => {}}>
          <CheckIcon />
        </SmallIconButton>
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
      <Group title="Table（見出し・本体・合計）" parts={["table"]}>
        <Table>
          <TableHead>
            <TableRow className="" header>
              <TableHeaderCell align="left" sort="unspecified" hidden={false}>
                名前
              </TableHeaderCell>
              <TableHeaderCell align="right" sort="ascending" hidden={false}>
                件数
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableRows>
            <TableRow className="" header={false}>
              <TableCell align="left" className="" hidden={false} span={1}>
                設計
              </TableCell>
              <TableCell align="right" className="" hidden={false} span={1}>
                12
              </TableCell>
            </TableRow>
          </TableRows>
          <TableFoot>
            <TableRow className="" header={false}>
              <TableCell align="left" className="" hidden={false} span={1}>
                合計
              </TableCell>
              <TableCell align="right" className="" hidden={false} span={1}>
                12
              </TableCell>
            </TableRow>
          </TableFoot>
        </Table>
      </Group>
      <Group title="Quote（本文 × 出典）" parts={["quote"]}>
        <Quote source="— 架空の出典">架空の引用の文</Quote>
      </Group>
      <Group title="Note（種類）" parts={["note"]}>
        {NOTE_TONES.map((tone) => (
          <Note key={tone} tone={tone} title={tone}>
            架空の注記の本文
          </Note>
        ))}
      </Group>
      <Group title="List（長いラベルは折り返す）" parts={["list"]}>
        <List hasDividers numbered={false} textSize="standard">
          <ListItem
            mark="●"
            label="架空の長いラベルの項目で、器の幅を越えても1行で切れずに折り返して全文が読めることを確かめるために、わざと同じような言い回しを重ねて長くしてある。折り返した2行目も、1行目の頭にそろって読める"
            description="架空の説明の行。行の高さは本文の読みやすい高さにそろう"
            end="済"
          />
          <ListItem label="短いラベル" />
        </List>
        <List hasDividers={false} numbered={false} textSize="compact">
          <ListItem mark="✓" label="詰めた段。字は手順の行と同じ大きさ" end="済" />
          <ListItem mark="●" label="詰めた段の2行目" description="説明の行も同じ字の大きさ" />
        </List>
      </Group>
      <Group title="MetadataList（名前と値）" parts={["metadata-list"]}>
        <MetadataList title="架空の見出し">
          <MetadataListItem label="名前">架空の値</MetadataListItem>
          <MetadataListItem label="場所">架空の場所</MetadataListItem>
        </MetadataList>
      </Group>
      <Group title="Stepper（手順）" parts={["stepper"]}>
        <Stepper
          activeStep={1}
          label="架空の手順"
          density="balanced"
          emphasizeActive={false}
          textSize="standard"
        >
          <Step step={0} label="架空の1つ目">
            架空の1つ目の本文
          </Step>
          <Step step={1} label="架空の2つ目">
            架空の2つ目の本文
          </Step>
          <Step step={2} label="架空の3つ目" />
        </Stepper>
        <Stepper
          activeStep={1}
          label="強調つきの手順"
          density="compact"
          emphasizeActive
          textSize="standard"
        >
          <Step step={0} label="済んだ段" />
          <Step step={1} label="今の段" />
          <Step step={2} label="これからの段" />
        </Stepper>
      </Group>
      <Group title="Collapsible（開いた形・閉じた形）" parts={["collapsible"]}>
        <Collapsible trigger="開いた形" defaultOpen chevronPosition="end">
          架空の本文。字の大きさは本文の段にそろう
        </Collapsible>
        <Collapsible trigger="閉じた形" defaultOpen={false} chevronPosition="end">
          架空の本文
        </Collapsible>
        <Collapsible trigger="印が前の形" defaultOpen chevronPosition="start">
          架空の本文。山形の印が見出しの字の前に来る
        </Collapsible>
      </Group>
      <Group title="CodeBlock（長い行は横にスクロール）" parts={["code-block"]}>
        <CodeBlock
          language="typescript"
          code={`const sample = "架空の非常に長い行がここに入り、折り返さず横にスクロールして読めることを確かめるための文字列を続ける、続ける、続ける、続ける、続ける"\nconsole.log(sample)`}
        />
      </Group>
      <Group title="Kbd（キー）" parts={["kbd"]}>
        <Kbd keys="mod+k" />
        <Kbd keys="shift+enter" />
      </Group>
      <Group title="FirstNoteList（初回だけの説明）" parts={["first-note-list"]}>
        <FirstNoteList
          notes={[{ id: "design-first-note", text: "架空の初回の説明" }]}
          onAcknowledge={() => undefined}
        />
      </Group>
      <InputGroups />
      <OverlayGroups />
      <LayoutGroups />
    </VStack>
  )
}
