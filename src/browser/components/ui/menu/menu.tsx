// 「…」の口から開く操作の一覧。中身は Astryx の `MoreMenu` で、行は props で受けて Astryx の行に写す。狭い画面では下の板で出す。

import { MoreMenu } from "@astryxdesign/core/MoreMenu"
import type { ReactElement } from "react"

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
  /** ボタンの名前。開いた面の名前にも使う。 */
  readonly triggerLabel: string
  readonly disabled: boolean
  readonly items: readonly MenuItem[]
  /** 置き方だけを渡す。 */
  readonly className: string
}

const TONE_VARIANT = {
  default: "default",
  danger: "destructive",
} satisfies Record<MenuItemTone, "default" | "destructive">

export function Menu(props: MenuProps): ReactElement {
  return (
    <MoreMenu
      label={props.triggerLabel}
      isDisabled={props.disabled}
      presentation="adaptive"
      className={props.className}
      items={props.items.flatMap((item) => [
        ...(item.separatorBefore ? [{ type: "divider" as const }] : []),
        {
          id: item.key,
          label: item.label,
          variant: TONE_VARIANT[item.tone],
          isDisabled: item.disabled,
          onClick: item.onSelect,
        },
      ])}
    />
  )
}
