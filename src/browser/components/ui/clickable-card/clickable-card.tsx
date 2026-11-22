// 押すと1つの操作になる箱。中身は Astryx の `ClickableCard` で、読み上げの名前は隠したボタンが持つ。
// 縁の色と線種だけを `tone` で替える。`variant` は既定のまま、根に出す `data-tone` を顔の class が拾う。
// CSS Modules は層に入らないので、`astryx-base` の層の `Card` の縁の宣言に勝つ。
// 隠したボタンは `aria-label` と `aria-disabled` しか受け付けないので、選んだ印の `aria-pressed` は描画の前にそのボタンへ書く。

import { ClickableCard as AstryxClickableCard } from "@astryxdesign/core/ClickableCard"
import { clsx } from "clsx"
import { type ReactElement, type ReactNode, useRef } from "react"

import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import styles from "./clickable-card.module.css"

type ClickableCardTone = "plain" | "accent" | "danger" | "dashed"

export type ClickableCardProps = {
  /** 読み上げの名前。箱の字と同じ中身を渡す。 */
  readonly label: string
  readonly tone: ClickableCardTone
  /** 選べる箱の選んだ印。渡さなければ `aria-pressed` を付けない。 */
  readonly pressed?: boolean
  readonly onClick: () => void
  /** 置き方（margin・flex・幅など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

export function ClickableCard(props: ClickableCardProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  useBeforePaintSync(() => {
    const button = rootRef.current?.querySelector(":scope > button")
    if (button === null || button === undefined) {
      return
    }
    if (props.pressed === undefined) {
      button.removeAttribute("aria-pressed")
    } else {
      button.setAttribute("aria-pressed", String(props.pressed))
    }
  }, [props.pressed])
  return (
    <AstryxClickableCard
      ref={rootRef}
      label={props.label}
      padding={2}
      onClick={props.onClick}
      className={clsx(styles["clickable-card"], props.className)}
      data-tone={props.tone}
      data-pressed={props.pressed}
    >
      {props.children}
    </AstryxClickableCard>
  )
}
