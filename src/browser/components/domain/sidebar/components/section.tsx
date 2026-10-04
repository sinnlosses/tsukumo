// サイドバーの区画1つぶんの枠。見出し（`h2`）と `filters` は `.sidebar-block-head` にまとめて止め、
// 中身だけ `.sidebar-block-scroll` で包んで内側にスクロールさせる。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// 見出しそのものは押せるようにしない。
// 区画ごと開閉するのではなく別の場所（モーダル）を開く操作なので、押せる範囲は見出しの文字と分けておく。
//
// `.sidebar-block-scroll` がスクロールされている間だけ、止まった帯の下に線と影を出す（`data-scrolled`）。

import clsx from "clsx"
import { useState, type ReactElement, type ReactNode } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { SettingsIcon } from "../../../ui/icon/icon.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./section.module.css"

export type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

export type SidebarSectionProps = {
  readonly title: string
  /** 区画ごとの高さの取り方を足す class 名。 */
  readonly extraClass: string
  readonly action: SidebarSectionAction | undefined
  /** 見出しの右端の歯車（`label` は読み上げの名前）。無ければ何も足さない。 */
  readonly settings: SidebarSectionAction | undefined
  /** 見出しの下に続けて止める行（タスク一覧の絞り込みのチップ）。無ければ何も足さない。 */
  readonly filters: ReactNode | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  const [scrolled, setScrolled] = useState(false)

  return (
    <section className={clsx(styles["sidebar-block"], props.extraClass)} aria-label={props.title}>
      <div className={styles["sidebar-block-head"]} data-scrolled={scrolled}>
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
          {props.settings !== undefined && (
            <Button
              variant="ghost"
              size="action"
              pressed="none"
              disabled={false}
              ariaLabel={props.settings.label}
              ariaHasPopup="dialog"
              disclosure={{ kind: "none" }}
              title={props.settings.label}
              className={styles["sidebar-block-settings"]}
              onClick={props.settings.onAction}
            >
              <SettingsIcon />
            </Button>
          )}
        </Heading>
        {props.filters}
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
