// レポートの目次の器。
// 本文の左の縁に見出しの数だけ短い線（枝）を縦に並べ、縁にポインタが乗ると見出しの名前の一覧を本文の上に重ねて開く（本文は動かさない）。
// 縁は転がしても札の頭のすぐ下に残る。
//
// 枝の線はポインタで押せる目印で、キーボードとスクリーンリーダーには一覧の行だけを見せる（同じ見出しへの口を2つ読ませない）。

import clsx from "clsx"
import { List } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import type { ReportOutlineModel, ReportOutlineRow } from "./hooks/use-report-outline.ts"
import styles from "./report-outline.module.css"

const OUTLINE_LABEL = "目次"

export type PresentationalReportOutlineProps = ReportOutlineModel & {
  readonly children: ReactNode
}

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.contentRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalReportOutline({
  visible,
  rows,
  positionLabel,
  open,
  listId,
  contentRef,
  navRef,
  listRef,
  triggerRef,
  onRailPointerEnter,
  onRailPointerLeave,
  onTriggerFocus,
  onNavBlur,
  onNavKeyDown,
  onSelect,
  children,
}: PresentationalReportOutlineProps): ReactElement {
  return (
    <div className={styles["outline-frame"]} data-outline={visible ? "shown" : "hidden"}>
      {visible && (
        <div
          className={styles["outline-rail"]}
          data-open={open}
          onPointerEnter={onRailPointerEnter}
          onPointerLeave={onRailPointerLeave}
        >
          <nav
            className={styles["outline-nav"]}
            aria-label={OUTLINE_LABEL}
            ref={navRef}
            onBlur={onNavBlur}
            onKeyDown={onNavKeyDown}
          >
            <button
              type="button"
              className={styles["outline-trigger"]}
              ref={triggerRef}
              aria-label={OUTLINE_LABEL}
              aria-expanded={open}
              aria-controls={listId}
              onFocus={onTriggerFocus}
            >
              <List size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
            {rows.map((row, index) => (
              <button
                type="button"
                key={index}
                className={styles["outline-branch"]}
                tabIndex={-1}
                aria-hidden="true"
                data-level={row.level}
                data-active={row.isActive}
                data-in-section={row.inActiveSection}
                onClick={() => {
                  onSelect(index)
                }}
              >
                <span className={styles["outline-branch-line"]} />
              </button>
            ))}
            {open && (
              <OutlineList
                id={listId}
                listRef={listRef}
                rows={rows}
                positionLabel={positionLabel}
                onSelect={onSelect}
              />
            )}
          </nav>
        </div>
      )}
      <div className={styles["outline-content"]} ref={contentRef}>
        {children}
      </div>
    </div>
  )
}

/**
 * 縁の右に重ねる、見出しの名前の一覧。いま読んでいる見出しは地と左の印で、いまの節の見出しは明るい字で見せる。
 * props を分解して受けるのは `PresentationalReportOutline` と同じ理由。
 */
function OutlineList({
  id,
  listRef,
  rows,
  positionLabel,
  onSelect,
}: {
  readonly id: string
  readonly listRef: ReportOutlineModel["listRef"]
  readonly rows: readonly ReportOutlineRow[]
  readonly positionLabel: string
  readonly onSelect: (index: number) => void
}): ReactElement {
  return (
    <div id={id} className={styles["outline-list"]} ref={listRef}>
      <div className={styles["outline-list-head"]}>
        <span className={styles["outline-list-title"]}>{OUTLINE_LABEL}</span>
        <span className={styles["outline-list-position"]}>{positionLabel}</span>
      </div>
      {rows.map((row, index) => (
        <button
          type="button"
          key={index}
          className={clsx(styles["outline-row"], row.inActiveSection && styles["is-in-section"])}
          data-level={row.level}
          aria-current={row.isActive ? "location" : undefined}
          onClick={() => {
            onSelect(index)
          }}
        >
          <span className={styles["outline-row-mark"]} aria-hidden="true" />
          <span className={styles["outline-row-text"]}>{row.text}</span>
        </button>
      ))}
    </div>
  )
}
