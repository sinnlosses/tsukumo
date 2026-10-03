// レポートの目次の器。
// 本文の左に見出しの名前の一覧を列として置き、本文はその幅ぶん右へ寄る。
// 列は転がしても札の頭のすぐ下に残る。

import clsx from "clsx"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { LayoutResizer } from "../../../../../../ui/layout-resizer/layout-resizer.tsx"
import { outlineWidthFromRatio } from "./domain/outline-panel.ts"
import type { ReportOutlineModel } from "./hooks/use-report-outline.ts"
import styles from "./report-outline.module.css"

const OUTLINE_LABEL = "目次"
const COLLAPSE_LABEL = "目次を畳む"
const EXPAND_LABEL = "目次を開く"
const RESIZER_LABEL = "目次と本文の境界"

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
  frameRef,
  contentRef,
  navRef,
  listRef,
  onNavKeyDown,
  onSelect,
  collapsed,
  onToggleCollapse,
  widthStyle,
  onWidthChange,
  onWidthCommit,
  children,
}: PresentationalReportOutlineProps): ReactElement {
  return (
    <div
      className={styles["outline-frame"]}
      data-outline={visible ? "shown" : "hidden"}
      data-outline-collapsed={collapsed}
      style={collapsed ? undefined : widthStyle}
      ref={frameRef}
    >
      {visible && (
        <div className={styles["outline-rail"]}>
          <nav
            className={styles["outline-nav"]}
            aria-label={OUTLINE_LABEL}
            ref={navRef}
            onKeyDown={onNavKeyDown}
          >
            {collapsed ? (
              <Button
                variant="ghost"
                size="action"
                pressed="none"
                disabled={false}
                ariaLabel={EXPAND_LABEL}
                disclosure={{ kind: "expander", expanded: false }}
                ariaHasPopup={undefined}
                title={undefined}
                className={styles["outline-toggle"]}
                onClick={onToggleCollapse}
              >
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
              </Button>
            ) : (
              <>
                <div className={styles["outline-list-head"]}>
                  <span className={styles["outline-list-head-text"]}>
                    <span className={styles["outline-list-title"]}>{OUTLINE_LABEL}</span>
                    <span className={styles["outline-list-position"]}>{positionLabel}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="action"
                    pressed="none"
                    disabled={false}
                    ariaLabel={COLLAPSE_LABEL}
                    disclosure={{ kind: "expander", expanded: true }}
                    ariaHasPopup={undefined}
                    title={undefined}
                    className={styles["outline-toggle"]}
                    onClick={onToggleCollapse}
                  >
                    <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                  </Button>
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
              </>
            )}
          </nav>
        </div>
      )}
      {visible && !collapsed && (
        <LayoutResizer
          orientation="vertical"
          containerRef={frameRef}
          ariaLabel={RESIZER_LABEL}
          toValue={outlineWidthFromRatio}
          onChange={onWidthChange}
          onCommit={onWidthCommit}
          className=""
        />
      )}
      <div className={styles["outline-content"]} ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
