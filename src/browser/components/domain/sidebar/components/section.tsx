// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で包んで内側にスクロールさせる。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// 見出しそのものは押せるようにしない。
// 区画ごと開閉するのではなく別の場所（モーダル）を開く操作なので、押せる範囲は見出しの文字と分けておく。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "../sidebar.module.css"

export type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

export type SidebarSectionProps = {
  readonly title: string
  /** 区画ごとの高さの取り方を足す class 名。 */
  readonly extraClass: string
  readonly action: SidebarSectionAction | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={clsx(styles["sidebar-block"], props.extraClass)} aria-label={props.title}>
      <Heading
        level={2}
        size="subheading"
        tone="ink"
        weight="bold"
        className={styles["sidebar-block-heading"]}
      >
        <Text
          element="span"
          size="inherit"
          tone="inherit"
          weight="inherit"
          className={styles["sidebar-block-title"]}
        >
          {props.title}
        </Text>
        {props.action !== undefined && (
          <Button
            type="button"
            variant="link"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup="dialog"
            disclosure={{ kind: "none" }}
            title={undefined}
            className={styles["sidebar-block-action"]}
            onClick={props.action.onAction}
          >
            {props.action.label}
          </Button>
        )}
      </Heading>
      <div className={styles["sidebar-block-scroll"]}>{props.children}</div>
    </section>
  )
}
