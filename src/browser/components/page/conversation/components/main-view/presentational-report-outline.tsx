// やり取りの列の器。
// 左の列の上に、集計期間の中のやり取りと、見ているやり取りの見出しの一覧を置く。
// 高さは立ち絵と左上の席に被らないところで止まり（置き場の `<ConversationLayout>` が決める）、超えた分は一覧だけが転がる。
// 狭い画面（760px 以下）では左の列ごと出さない。
// 頭は「やり取り｜セッション」の切り替えで、畳んだ形・やり取りが無い場面・始め方の一覧の場面は、その1行だけの帯になる。

import clsx from "clsx"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { withOccurrenceKeys } from "../../../../../domain/occurrence-key.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { TabList } from "../../../../ui/tab-list/tab-list.tsx"
import { TURN_RESULT_MARKS } from "../../domain/turn-result-mark.ts"
import type { OutlineSide } from "../../stores/outline-side.ts"
import {
  TURN_ROW_ATTRIBUTE,
  type ReportOutlineModel,
  type ReportOutlineReportRow,
  type ReportOutlineRow,
  type ReportOutlineTurnRow,
} from "./hooks/use-report-outline.ts"
import styles from "./main-view.module.css"

const OUTLINE_LABEL = "やり取り"
const SESSIONS_LABEL = "セッション"
const OUTLINE_LIST_ID = "outline-list"
const EMPTY_BAND_TITLE = "依頼を送ると、ここに並ぶ"
const COLLAPSE_LABEL = "やり取りを畳む"
const EXPAND_LABEL = "やり取りを開く"

const TURN_STEP_KEY_HINT = "前後のやり取りへは [ ] キー"
const HEADING_STEP_KEY_HINT = "レポートの見出しへは { } キー"

const ACTIVE_TURN_MARK = "●"

const REPORT_LABEL_TEXT = {
  final: "最終",
  interim: "レポート",
} as const satisfies Record<"final" | "interim", string>

/** 札の頭の切り替え（やり取り・セッション）に要るもの。側と件数は呼ぶ側が持つ。 */
export type OutlineSideModel = {
  readonly side: OutlineSide
  readonly onSelectSide: (side: OutlineSide) => void
  readonly sessionCount: number
  /** セッション側のとき一覧の器の中へ出す中身。 */
  readonly sessionBody: ReactNode
}

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
  side,
  onSelectSide,
  sessionCount,
  sessionBody,
}: ReportOutlineModel & OutlineSideModel): ReactElement {
  return (
    <nav
      className={styles["outline-nav"]}
      aria-label={OUTLINE_LABEL}
      data-outline-collapsed={collapsed}
      ref={navRef}
      onKeyDown={onNavKeyDown}
    >
      <OutlineHead
        side={side}
        turnCount={turnRows.length}
        sessionCount={sessionCount}
        onSelectSide={onSelectSide}
        toggle={{ collapsed, onToggle: onToggleCollapse }}
      />
      {!collapsed && (
        <div className={styles["outline-list"]} id={OUTLINE_LIST_ID} ref={listRef}>
          {side === "sessions"
            ? sessionBody
            : turnRows.map((turn) => (
                <div
                  key={turn.id}
                  className={clsx(
                    styles["outline-turn-group"],
                    turn.isActive && styles["is-active"],
                  )}
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
      )}
    </nav>
  )
}

/** やり取りが1件も無い帯（始め方の一覧）と、始め方の一覧を出したまま過去を見ていない帯。切り替えの1行だけを出す。 */
export function OutlineBand(props: {
  readonly turnCount: number
  readonly sessionCount: number
  readonly onSelectSide: (side: OutlineSide) => void
  /** 「セッション」を押して開いたときの一覧。無いあいだは帯のまま。 */
  readonly sessionBody?: ReactNode
}): ReactElement {
  const open = props.sessionBody !== undefined
  return (
    <nav
      className={styles["outline-nav"]}
      aria-label={OUTLINE_LABEL}
      data-outline-collapsed={!open}
      title={props.turnCount === 0 ? EMPTY_BAND_TITLE : undefined}
    >
      <OutlineHead
        side={open ? "sessions" : "turns"}
        turnCount={props.turnCount}
        sessionCount={props.sessionCount}
        onSelectSide={props.onSelectSide}
        turnsLocked={!open}
        toggle={
          open
            ? {
                collapsed: false,
                onToggle: () => {
                  props.onSelectSide("turns")
                },
              }
            : undefined
        }
      />
      {open && (
        <div className={styles["outline-list"]} id={OUTLINE_LIST_ID}>
          {props.sessionBody}
        </div>
      )}
    </nav>
  )
}

function OutlineHead(props: {
  readonly side: OutlineSide
  readonly turnCount: number
  readonly sessionCount: number
  readonly onSelectSide: (side: OutlineSide) => void
  /** 畳む口。帯には無い。 */
  readonly toggle?: { readonly collapsed: boolean; readonly onToggle: () => void }
  /** 「やり取り」を押せないか（セッション側を開いていない帯）。 */
  readonly turnsLocked?: boolean
}): ReactElement {
  const { toggle } = props
  return (
    <div className={styles["outline-list-head"]}>
      <div className={styles["outline-side-tabs"]} title={TURN_STEP_KEY_HINT}>
        <TabList
          label="左の札の側"
          value={props.side}
          panelId={OUTLINE_LIST_ID}
          tabs={[
            {
              value: "turns",
              label: OUTLINE_LABEL,
              id: "outline-tab-turns",
              endContent: <OutlineCount count={props.turnCount} />,
            },
            {
              value: "sessions",
              label: SESSIONS_LABEL,
              id: "outline-tab-sessions",
              endContent: <OutlineCount count={props.sessionCount} />,
            },
          ]}
          onChange={(next) => {
            if (next === "turns" && props.turnsLocked === true) {
              return
            }
            props.onSelectSide(next)
          }}
        />
      </div>
      {toggle !== undefined && (
        <Button
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel={toggle.collapsed ? EXPAND_LABEL : COLLAPSE_LABEL}
          disclosure={{ kind: "expander", expanded: !toggle.collapsed }}
          className={styles["outline-toggle"]}
          onClick={toggle.onToggle}
        >
          {toggle.collapsed ? (
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronUp size={14} strokeWidth={2} aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  )
}

function OutlineCount(props: { readonly count: number }): ReactElement {
  return (
    <span className={styles["outline-count"]} role="img" aria-label={`${String(props.count)}件`}>
      {props.count}
    </span>
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
          title={`${reportRow.title}\n${HEADING_STEP_KEY_HINT}`}
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
          </button>
        ),
      )}
    </>
  )
}
