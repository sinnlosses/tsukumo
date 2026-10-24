// 「…」の口から開く操作の一覧。持つのは開閉・キーボード・位置・顔で、行は props で受ける。
//
// 押せない行は `aria-disabled` の1通り（フォーカスは ↑↓ で飛ばすが、`title` を読ませるため要素は残す）。

import clsx from "clsx"
import { MoreHorizontal } from "lucide-react"
import { Fragment, useId, type ReactElement } from "react"

import { Button } from "../button/button.tsx"
import { useMenu } from "./hooks/use-menu.ts"
import styles from "./menu.module.css"

type MenuItemTone = "default" | "danger"

export type MenuItem = {
  readonly key: string
  readonly label: string
  readonly tone: MenuItemTone
  readonly disabled: boolean
  /** この行の前に区切りの線を引く。 */
  readonly separatorBefore: boolean
  readonly onSelect: () => void
}

export type MenuProps = {
  /** 押す口の `aria-label` と `title`。開いた面の名前にも使う。 */
  readonly triggerLabel: string
  readonly disabled: boolean
  readonly items: readonly MenuItem[]
  /** 置き方だけを渡す。 */
  readonly className: string
}

const MENU_ITEM_TONE_CLASS = {
  default: undefined,
  danger: styles["menu-item-tone-danger"],
} satisfies Record<MenuItemTone, string | undefined>

export function Menu(props: MenuProps): ReactElement {
  const menu = useMenu()
  // 預け先はここで分解して受ける（`menu.rootRef` の形のまま渡すと `react(refs)` が落ちる）。
  const { open, rootRef, triggerRef, panelRef, onToggle, select, onPanelKeyDown } = menu
  const panelId = useId()

  return (
    <div ref={rootRef} className={clsx(styles["menu"], props.className)}>
      <Button
        variant="ghost-hover-outline"
        size="secondary"
        pressed="none"
        disabled={props.disabled}
        ariaLabel={props.triggerLabel}
        disclosure={{
          kind: "popover",
          popup: "menu",
          ref: triggerRef,
          expanded: open,
          controls: panelId,
        }}
        title={props.triggerLabel}
        className={styles["menu-trigger"]}
        onClick={onToggle}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </Button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label={props.triggerLabel}
          tabIndex={-1}
          className={styles["menu-panel"]}
          onKeyDown={onPanelKeyDown}
        >
          {props.items.map((item) => (
            <Fragment key={item.key}>
              {item.separatorBefore && (
                <div role="separator" className={styles["menu-separator"]} />
              )}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled}
                className={clsx(styles["menu-item"], MENU_ITEM_TONE_CLASS[item.tone])}
                onClick={() => {
                  if (!item.disabled) {
                    select(item.onSelect)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return
                  }
                  // ネイティブの押下（Enter は keydown・Space は keyup の click）と二重にしない。
                  event.preventDefault()
                  if (!item.disabled) {
                    select(item.onSelect)
                  }
                }}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
