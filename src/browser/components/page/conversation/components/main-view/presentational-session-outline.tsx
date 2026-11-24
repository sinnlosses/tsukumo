// 左の札のセッション側の中身。
// 「今日」「昨日」の群に行を並べ、末尾に切り替え画面を開く口を置く。
// 使用中の行は白抜きの丸を添えて押せない。行を押すと札の右隣に詳細が開き、同じ行をもう一度押すと閉じる。
// 切り替えるのは詳細のボタンだけで、行を押す・Enter を押すだけでは切り替えない。

import type { KeyboardEvent, ReactElement, RefObject } from "react"

import { SESSION_SWITCHER_GROUP_LABELS } from "../../../../../features/session-switcher/session-switcher-row.ts"
import { Kbd } from "../../../../ui/kbd/kbd.tsx"
import type { SessionOutlineRow } from "./domain/session-outline-row.ts"
import type { SessionDetailPop } from "./hooks/use-session-detail-pop.ts"
import type { SessionOutlineModel } from "./hooks/use-session-outline.ts"
import styles from "./main-view.module.css"
import { PresentationalSessionDetailPanel } from "./presentational-session-detail-panel.tsx"

const OCCUPIED_TITLE = "別のウィンドウで使用中"
const OPEN_SWITCHER_LABEL = "ほかの作業ツリー・探す"
const SESSION_ROW_SELECTOR = "button[data-session-row]:not([aria-disabled='true'])"

export function PresentationalSessionOutline({
  sections,
  selectedKey,
  onSelectRow,
  detail,
  onMove,
  pop,
  onOpenSwitcher,
}: SessionOutlineModel): ReactElement {
  const { anchorRef, listRef } = pop
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && detail !== undefined) {
      event.preventDefault()
      detail.onClose()
      anchorRef.current?.focus()
      return
    }
    const step = stepOf(event.key)
    if (step === 0) {
      return
    }
    event.preventDefault()
    if (detail !== undefined) {
      onMove(step)
      return
    }
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(SESSION_ROW_SELECTOR)]
    const focused = rows.findIndex((element) => element === document.activeElement)
    rows[focused + step]?.focus()
  }
  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 子のボタンのキー操作を束ねる包み */}
      <div ref={listRef} className={styles["outline-session-list"]} onKeyDown={onKeyDown}>
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
                anchorRef={anchorRef}
                pop={pop}
                onSelectRow={onSelectRow}
              />
            ))}
          </div>
        ))}
        <button type="button" className={styles["outline-session-more"]} onClick={onOpenSwitcher}>
          <span>{OPEN_SWITCHER_LABEL}</span>
          <Kbd keys="mod+j" />
        </button>
      </div>
      <PresentationalSessionDetailPanel detail={detail} pop={pop} />
    </>
  )
}

/** ↑ は前へ、↓ は次へ。ほかのキーは 0。 */
function stepOf(key: string): number {
  if (key === "ArrowDown") {
    return 1
  }
  return key === "ArrowUp" ? -1 : 0
}

function SessionRow(props: {
  readonly row: SessionOutlineRow
  readonly selected: boolean
  /** 開いている行だけが結ぶ。詳細の面はこの行に結ぶ。 */
  readonly anchorRef: RefObject<HTMLButtonElement | null>
  readonly pop: SessionDetailPop
  readonly onSelectRow: (key: string) => void
}): ReactElement {
  const { row } = props
  const blocked = row.sessionId === undefined || row.occupiedElsewhere
  return (
    <button
      type="button"
      ref={props.selected ? props.anchorRef : undefined}
      className={styles["outline-session"]}
      data-session-row=""
      data-selected={props.selected}
      data-current={row.current}
      aria-disabled={blocked}
      aria-current={row.current ? "true" : undefined}
      aria-expanded={props.selected}
      title={row.occupiedElsewhere ? OCCUPIED_TITLE : row.heading}
      onClick={() => {
        if (!blocked) {
          props.onSelectRow(row.key)
        }
      }}
      onKeyDown={(event) => {
        // 面は最上層に出るので、順に Tab を送ると詳細へ届くまで後ろの行を通る。開いている行からは直に詳細のボタンへ移す。
        if (event.key === "Tab" && !event.shiftKey && props.selected) {
          event.preventDefault()
          props.pop.focusDetail()
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
