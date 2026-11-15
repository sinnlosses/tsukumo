// やり取りの列の器。
// 左の列の上に、集計期間の中のやり取りと、見ているやり取りの見出しの一覧を置く。
// 高さは立ち絵と左上の席に被らないところで止まり（置き場の `<ConversationLayout>` が決める）、超えた分は一覧だけが転がる。
// 狭い画面（760px 以下）では左の列ごと出さない。

import clsx from "clsx"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactElement } from "react"

import { withOccurrenceKeys } from "../../../../../domain/occurrence-key.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { TURN_RESULT_MARKS } from "../../domain/turn-result-mark.ts"
import {
  TURN_ROW_ATTRIBUTE,
  type ReportOutlineModel,
  type ReportOutlineReportRow,
  type ReportOutlineRow,
  type ReportOutlineTurnRow,
} from "./hooks/use-report-outline.ts"
import styles from "./main-view.module.css"

const OUTLINE_LABEL = "やり取り"
const COLLAPSE_LABEL = "やり取りを畳む"
const EXPAND_LABEL = "やり取りを開く"

const TURN_STEP_KEY_HINT = "前後のやり取りへは [ ] キー"

const ACTIVE_TURN_MARK = "●"

const REPORT_LABEL_TEXT = {
  final: "最終",
  interim: "レポート",
} as const satisfies Record<"final" | "interim", string>

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.navRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 * 本文の器（`contentRef`）は列の外（メインビューの根）に結ぶので、ここでは受けない。
 */
export function PresentationalReportOutline({
  turnRows,
  onSelectTurn,
  reportRow,
  onSelectReport,
  rows,
  navRef,
  listRef,
  onNavKeyDown,
  onSelect,
  collapsed,
  onToggleCollapse,
}: ReportOutlineModel): ReactElement {
  return (
    <nav
      className={styles["outline-nav"]}
      aria-label={OUTLINE_LABEL}
      data-outline-collapsed={collapsed}
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
          className={styles["outline-toggle"]}
          onClick={onToggleCollapse}
        >
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </Button>
      ) : (
        <>
          <div className={styles["outline-list-head"]}>
            <span className={styles["outline-list-title"]} title={TURN_STEP_KEY_HINT}>
              {OUTLINE_LABEL}
            </span>
            <Button
              variant="ghost"
              size="action"
              pressed="none"
              disabled={false}
              ariaLabel={COLLAPSE_LABEL}
              disclosure={{ kind: "expander", expanded: true }}
              className={styles["outline-toggle"]}
              onClick={onToggleCollapse}
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
          <div className={styles["outline-list"]} ref={listRef}>
            {turnRows.map((turn) => (
              <div
                key={turn.id}
                className={clsx(styles["outline-turn-group"], turn.isActive && styles["is-active"])}
              >
                <TurnRow turn={turn} onSelectTurn={onSelectTurn} />
                {turn.isActive && (
                  <HeadingRows
                    reportRow={reportRow}
                    onSelectReport={onSelectReport}
                    rows={rows}
                    onSelect={onSelect}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}

function TurnRow(props: {
  readonly turn: ReportOutlineTurnRow
  readonly onSelectTurn: (turnId: number) => void
}): ReactElement {
  const { turn } = props
  const result = TURN_RESULT_MARKS[turn.result]
  return (
    <button
      type="button"
      className={styles["outline-turn"]}
      {...{ [TURN_ROW_ATTRIBUTE]: turn.id }}
      data-result={turn.result}
      aria-current={turn.isActive ? "true" : undefined}
      aria-label={`${result.label}: ${turn.title}${turn.asideCount > 0 ? `（補足メッセージ ${String(turn.asideCount)}件）` : ""}`}
      title={turn.title}
      onClick={() => {
        props.onSelectTurn(turn.id)
      }}
    >
      <span className={styles["outline-turn-mark"]} aria-hidden="true">
        {turn.isActive ? ACTIVE_TURN_MARK : result.mark}
      </span>
      <span className={styles["outline-turn-body"]}>
        <span className={styles["outline-row-text"]}>{turn.title}</span>
        {turn.asideCount > 0 && (
          <span className={styles["outline-turn-aside"]} aria-hidden="true">
            {`脇 ${String(turn.asideCount)}`}
          </span>
        )}
      </span>
    </button>
  )
}

function HeadingRows(props: {
  readonly reportRow: ReportOutlineReportRow
  readonly onSelectReport: () => void
  readonly rows: readonly ReportOutlineRow[]
  readonly onSelect: (index: number) => void
}): ReactElement {
  const { reportRow } = props
  return (
    <>
      {reportRow.kind === "shown" && (
        <button
          type="button"
          className={styles["outline-row"]}
          data-level="report"
          aria-current={reportRow.isActive ? "location" : undefined}
          title={reportRow.title}
          onClick={props.onSelectReport}
        >
          <span className={styles["outline-row-mark"]} aria-hidden="true" />
          <span className={styles["outline-report-label"]}>
            {REPORT_LABEL_TEXT[reportRow.label]}
          </span>
          <span className={styles["outline-row-text"]}>{reportRow.title}</span>
        </button>
      )}
      {withOccurrenceKeys(props.rows, (row) => `${row.level}:${row.text}`).map(
        ({ key, item: row, index }) => (
          <button
            type="button"
            key={key}
            className={clsx(styles["outline-row"], row.inActiveSection && styles["is-in-section"])}
            data-level={row.level}
            aria-current={row.isActive ? "location" : undefined}
            title={row.text}
            onClick={() => {
              props.onSelect(index)
            }}
          >
            <span className={styles["outline-row-mark"]} aria-hidden="true" />
            <span className={styles["outline-row-text"]}>{row.text}</span>
            {row.askCount !== undefined && (
              <span
                className={styles["outline-row-ask"]}
                aria-label={`聞いたこと ${String(row.askCount)}件`}
              >
                {`聞 ${String(row.askCount)}`}
              </span>
            )}
            {row.noteCount !== undefined && (
              <span
                className={styles["outline-row-note"]}
                aria-label={`頼みごと ${String(row.noteCount)}件`}
              >
                {`頼 ${String(row.noteCount)}`}
              </span>
            )}
          </button>
        ),
      )}
    </>
  )
}
