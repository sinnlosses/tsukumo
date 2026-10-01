// レポートの目次の器。
// 本文の左に見出しの名前の一覧を常に開いた列として置き、本文はその幅ぶん右へ寄る。
// 列は転がしても札の頭のすぐ下に残る。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { ReportOutlineModel } from "./hooks/use-report-outline.ts"
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
  contentRef,
  navRef,
  listRef,
  onNavKeyDown,
  onSelect,
  children,
}: PresentationalReportOutlineProps): ReactElement {
  return (
    <div className={styles["outline-frame"]} data-outline={visible ? "shown" : "hidden"}>
      {visible && (
        <div className={styles["outline-rail"]}>
          <nav
            className={styles["outline-nav"]}
            aria-label={OUTLINE_LABEL}
            ref={navRef}
            onKeyDown={onNavKeyDown}
          >
            <div className={styles["outline-list-head"]}>
              <span className={styles["outline-list-title"]}>{OUTLINE_LABEL}</span>
              <span className={styles["outline-list-position"]}>{positionLabel}</span>
            </div>
            <div className={styles["outline-list"]} ref={listRef}>
              {rows.map((row, index) => (
                <button
                  type="button"
                  key={index}
                  className={clsx(
                    styles["outline-row"],
                    row.inActiveSection && styles["is-in-section"],
                  )}
                  data-level={row.level}
                  aria-current={row.isActive ? "location" : undefined}
                  title={row.text}
                  onClick={() => {
                    onSelect(index)
                  }}
                >
                  <span className={styles["outline-row-mark"]} aria-hidden="true" />
                  <span className={styles["outline-row-text"]}>{row.text}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
      <div className={styles["outline-content"]} ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
