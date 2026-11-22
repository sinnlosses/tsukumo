// 絵だけの小さなボタンの部品。コードの塊の写しボタンなど、帯の中に置く操作に使う。中身は Astryx の `IconButton`（ghost・sm）。
// 見える字が無いので `label`（名前）を必須にし、`tooltip` は触れたときの案内に使う。

import { IconButton } from "@astryxdesign/core/IconButton"
import type { ReactElement, ReactNode } from "react"

export type SmallIconButtonProps = {
  readonly label: string
  readonly tooltip: string
  readonly onClick: () => void
  readonly children: ReactNode
}

export function SmallIconButton(props: SmallIconButtonProps): ReactElement {
  return (
    <IconButton
      type="button"
      label={props.label}
      icon={props.children}
      variant="ghost"
      size="sm"
      tooltip={props.tooltip}
      onClick={props.onClick}
    />
  )
}
