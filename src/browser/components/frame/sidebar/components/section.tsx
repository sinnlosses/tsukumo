// サイドバーの区画1つぶんの枠。見出し（`h2`。小さいラベルの段）は `.sidebar-block-head` に止め、
// 中身だけ `.sidebar-block-scroll` で包んで内側にスクロールさせる。
//
// `action` を渡した区画は、見出しの右端にボタンが並ぶ（タスク一覧の「一覧を見る」）。
// 見出しそのものは押せるようにしない。
// 区画ごと開閉するのではなく別の場所（モーダル）を開く操作なので、押せる範囲は見出しの文字と分けておく。
//
// `.sidebar-block-scroll` がスクロールされている間だけ、止まった帯の下に線を出す（`data-scrolled`）。

import clsx from "clsx"
import { useState, type ReactElement, type ReactNode } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./section.module.css"

type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

type SidebarSectionProps = {
  readonly title: string
  /** 区画ごとの高さの取り方を足す class 名。 */
  readonly extraClass: string
  readonly action?: SidebarSectionAction
  /** 見出しの右端で `action` の左に並べる部品。無ければ `undefined`。 */
  readonly headerExtra?: ReactNode
  /** 見出しの題の横に出す件数（タスク一覧）。無ければ何も足さない。 */
  readonly count?: number
  /** 見出しの下で止まる帯の中に積む部品（探す欄）。無ければ何も足さない。 */
  readonly searchField?: ReactNode
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  const [scrolled, setScrolled] = useState(false)

  return (
    <section className={clsx(styles["sidebar-block"], props.extraClass)} aria-label={props.title}>
      <div className={styles["sidebar-block-head"]} data-scrolled={scrolled}>
        <Heading
          level={2}
          size="label"
          tone="ink-quiet"
          weight="semibold"
          className={styles["sidebar-block-heading"]}
        >
          <Text
            element="span"
            size="label"
            tone="inherit"
            weight="inherit"
            className={styles["sidebar-block-title"]}
          >
            {props.title}
            {props.count !== undefined && (
              <span className={styles["sidebar-block-count"]}>{props.count}</span>
            )}
          </Text>
          {props.headerExtra}
          {props.action !== undefined && (
            <Button
              variant="link"
              size="action"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "dialog" }}
              className={styles["sidebar-block-action"]}
              onClick={props.action.onAction}
            >
              {props.action.label}
            </Button>
          )}
        </Heading>
        {props.searchField}
      </div>
      <div
        ref={(element) => {
          if (element === null) {
            return
          }
          const handleScroll = () => {
            setScrolled(element.scrollTop > 0)
          }
          element.addEventListener("scroll", handleScroll, { passive: true })
          return () => {
            element.removeEventListener("scroll", handleScroll)
          }
        }}
        className={styles["sidebar-block-scroll"]}
      >
        {props.children}
      </div>
    </section>
  )
}
