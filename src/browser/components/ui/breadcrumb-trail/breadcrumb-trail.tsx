// パンくずの部品。中身は Astryx の `Breadcrumbs`・`BreadcrumbItem`。
// 最後の段は今いる場所（`aria-current`）で押せず、それより前の段は押すとその段へ戻る。区切りは「›」。

import { BreadcrumbItem, Breadcrumbs as AstryxBreadcrumbs } from "@astryxdesign/core/Breadcrumbs"
import type { ReactElement } from "react"

export type Crumb = {
  /** 同じ名前の段が並んでも区別できるよう、呼び出し側が渡す。 */
  readonly key: string
  readonly title: string
  /** 押したときの動き。最後の段では使わない。 */
  readonly onSelect: () => void
}

export type BreadcrumbTrailProps = {
  /** 先頭が最も外の段、末尾が今いる段。 */
  readonly crumbs: readonly Crumb[]
  /** `supporting` はサイドバー向けの小さい版。 */
  readonly variant: "default" | "supporting"
  /** nav のランドマークの名前。 */
  readonly label: string
}

export function BreadcrumbTrail(props: BreadcrumbTrailProps): ReactElement {
  return (
    <AstryxBreadcrumbs variant={props.variant} label={props.label} separator="›">
      {props.crumbs.map((crumb, index) =>
        index === props.crumbs.length - 1 ? (
          <BreadcrumbItem key={crumb.key} isCurrent>
            {crumb.title}
          </BreadcrumbItem>
        ) : (
          <BreadcrumbItem key={crumb.key} isCurrent={false} onClick={crumb.onSelect}>
            {crumb.title}
          </BreadcrumbItem>
        ),
      )}
    </AstryxBreadcrumbs>
  )
}
