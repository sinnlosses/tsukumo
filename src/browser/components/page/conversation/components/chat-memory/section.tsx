// 雑談の欄外の区画1つぶんの枠。見出し（`h2`）は欄外の題と同じ小さな札にし、中身は `.sidebar-block-scroll` で包む。
// 区画は自分では転がらず、転がすのは区画を並べた入れ物。
//
// `action` を渡した区画は、見出しの右端にボタンが並ぶ（覚えていることの「編集」）。
// 見出しそのものは押せるようにしない。押せる範囲は見出しの文字と分けておく。

import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import styles from "./chat-memory.module.css"

type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

type SidebarSectionProps = {
  readonly title: string
  readonly action?: SidebarSectionAction
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={styles["sidebar-block"]} aria-label={props.title}>
      <div className={styles["sidebar-block-head"]}>
        <Heading
          level={2}
          size="subheading"
          tone="ink-quiet"
          weight="normal"
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
          </Text>
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
      </div>
      <div className={styles["sidebar-block-scroll"]}>{props.children}</div>
    </section>
  )
}
