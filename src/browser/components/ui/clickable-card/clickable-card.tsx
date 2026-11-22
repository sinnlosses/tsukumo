// 押すと1つの操作になる箱。中身は Astryx の `ClickableCard` で、読み上げの名前は隠したボタンが持つ。
// 縁の色と線種だけを `tone` で替える。`variant` は既定のまま、根に出す `data-tone` を顔の class が拾う。
// CSS Modules は層に入らないので、`astryx-base` の層の `Card` の縁の宣言に勝つ。

import { ClickableCard as AstryxClickableCard } from "@astryxdesign/core/ClickableCard"
import { clsx } from "clsx"
import type { ReactElement, ReactNode } from "react"

import styles from "./clickable-card.module.css"

type ClickableCardTone = "plain" | "accent" | "danger" | "dashed"

export type ClickableCardProps = {
  /** 読み上げの名前。箱の字と同じ中身を渡す。 */
  readonly label: string
  readonly tone: ClickableCardTone
  readonly onClick: () => void
  /** 置き方（margin・flex・幅など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

export function ClickableCard(props: ClickableCardProps): ReactElement {
  return (
    <AstryxClickableCard
      label={props.label}
      padding={2}
      onClick={props.onClick}
      className={clsx(styles["clickable-card"], props.className)}
      data-tone={props.tone}
    >
      {props.children}
    </AstryxClickableCard>
  )
}
