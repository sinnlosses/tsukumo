// 左の札のセッション側の中身。
// 「今日」「昨日」の群に行を並べ、末尾に切り替え画面を開く口を置く。
// 使用中の行は白抜きの丸を添えて押せない。行を押すと選んだ印が付くだけで、詳細は開かない。

import type { ReactElement } from "react"

import { SESSION_SWITCHER_GROUP_LABELS } from "../../../../../features/session-switcher/session-switcher-row.ts"
import { Kbd } from "../../../../ui/kbd/kbd.tsx"
import type { SessionOutlineRow } from "./domain/session-outline-row.ts"
import type { SessionOutlineModel } from "./hooks/use-session-outline.ts"
import styles from "./main-view.module.css"

const OCCUPIED_TITLE = "別のウィンドウで使用中"
const OPEN_SWITCHER_LABEL = "ほかの作業ツリー・探す"

export function PresentationalSessionOutline({
  sections,
  selectedKey,
  onSelectRow,
  onOpenSwitcher,
}: SessionOutlineModel): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <div
          key={section.group}
          role="group"
          aria-label={SESSION_SWITCHER_GROUP_LABELS[section.group]}
          className={styles["outline-session-group"]}
        >
          <div className={styles["outline-session-group-head"]} aria-hidden="true">
            {SESSION_SWITCHER_GROUP_LABELS[section.group]}
          </div>
          {section.rows.map((row) => (
            <SessionRow
              key={row.key}
              row={row}
              selected={row.key === selectedKey}
              onSelectRow={onSelectRow}
            />
          ))}
        </div>
      ))}
      <button type="button" className={styles["outline-session-more"]} onClick={onOpenSwitcher}>
        <span>{OPEN_SWITCHER_LABEL}</span>
        <Kbd keys="mod+j" />
      </button>
    </>
  )
}

function SessionRow(props: {
  readonly row: SessionOutlineRow
  readonly selected: boolean
  readonly onSelectRow: (key: string) => void
}): ReactElement {
  const { row } = props
  const blocked = row.sessionId === undefined || row.occupiedElsewhere
  return (
    <button
      type="button"
      className={styles["outline-session"]}
      data-selected={props.selected}
      data-current={row.current}
      aria-disabled={blocked}
      aria-current={row.current ? "true" : undefined}
      title={row.occupiedElsewhere ? OCCUPIED_TITLE : row.heading}
      onClick={() => {
        if (!blocked) {
          props.onSelectRow(row.key)
        }
      }}
    >
      <span
        className={styles["outline-session-mark"]}
        data-occupied={row.occupiedElsewhere}
        aria-hidden="true"
      />
      <span className={styles["outline-row-text"]}>{row.heading}</span>
      <span className={styles["outline-session-time"]}>{row.timeLabel}</span>
    </button>
  )
}
