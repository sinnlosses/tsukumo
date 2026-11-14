// 見本帳の `ui/` の節のうち、重なる面の部品（Dialog・BottomSheet・Menu・ImageZoom）。開くボタンを置き、押すと出る。

import { useState, type ReactElement } from "react"

import { BottomSheet } from "../../ui/bottom-sheet/bottom-sheet.tsx"
import { Button } from "../../ui/button/button.tsx"
import { Dialog } from "../../ui/dialog/dialog.tsx"
import { ImageZoom } from "../../ui/image-zoom/image-zoom.tsx"
import { Menu, type MenuItem } from "../../ui/menu/menu.tsx"
import { Text } from "../../ui/text/text.tsx"
import styles from "./design.module.css"
import { Group } from "./ui-gallery-group.tsx"

const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#8aa"/><circle cx="160" cy="90" r="50" fill="#fff"/></svg>',
  )

const MENU_ITEMS = [
  {
    key: "a",
    label: "操作その1",
    tone: "default",
    disabled: false,
    separatorBefore: false,
    onSelect: () => {},
  },
  {
    key: "b",
    label: "押せない操作",
    tone: "default",
    disabled: true,
    separatorBefore: false,
    onSelect: () => {},
  },
  {
    key: "c",
    label: "消す操作",
    tone: "danger",
    disabled: false,
    separatorBefore: true,
    onSelect: () => {},
  },
] as const satisfies readonly MenuItem[]

export function OverlayGroups(): ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)

  return (
    <>
      <Group title="Dialog（開くと出る）" parts={["dialog"]}>
        <Opener label="Dialog を開く" onOpen={() => setDialogOpen(true)} />
        <Dialog
          open={dialogOpen}
          ariaLabel="見本のダイアログ"
          backdrop="dim"
          placement={{ kind: "auto" }}
          onClose={() => setDialogOpen(false)}
          className={styles["design-dialog"]}
        >
          <Text element="p" size="body" tone="ink" weight="normal" className="">
            ダイアログの中身（架空の短い文）
          </Text>
          <CloseButton onClose={() => setDialogOpen(false)} />
        </Dialog>
      </Group>
      <Group title="BottomSheet（狭い画面で開くと出る）" parts={["bottom-sheet"]}>
        <Opener label="BottomSheet を開く" onOpen={() => setSheetOpen(true)} />
        <BottomSheet
          open={sheetOpen}
          contentKey="design"
          ariaLabel="見本の板"
          onClose={() => setSheetOpen(false)}
          header={
            <Text element="span" size="body" tone="ink" weight="bold" className="">
              板の頭
            </Text>
          }
          footer={{ kind: "shown", node: <CloseButton onClose={() => setSheetOpen(false)} /> }}
        >
          <Text element="p" size="body" tone="ink" weight="normal" className="">
            板の中身（760px 以下の幅でだけ開いたままになる）
          </Text>
        </BottomSheet>
      </Group>
      <Group title="Menu（開くと出る）" parts={["menu"]}>
        <Menu triggerLabel="見本のメニュー" disabled={false} items={MENU_ITEMS} className="" />
        <Menu triggerLabel="押せないメニュー" disabled={true} items={MENU_ITEMS} className="" />
      </Group>
      <Group title="ImageZoom（開くと出る）" parts={["image-zoom"]}>
        <Opener label="ImageZoom を開く" onOpen={() => setZoomOpen(true)} />
        {zoomOpen && (
          <ImageZoom
            src={SAMPLE_IMAGE}
            alt="見本の絵"
            size="original"
            fallback={{ kind: "none" }}
            onClose={() => setZoomOpen(false)}
          />
        )}
      </Group>
    </>
  )
}

function Opener(props: { readonly label: string; readonly onOpen: () => void }): ReactElement {
  return (
    <Button
      variant="outline"
      size="action"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "dialog" }}
      className=""
      onClick={props.onOpen}
    >
      {props.label}
    </Button>
  )
}

function CloseButton(props: { readonly onClose: () => void }): ReactElement {
  return (
    <Button
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className=""
      onClick={props.onClose}
    >
      閉じる
    </Button>
  )
}
