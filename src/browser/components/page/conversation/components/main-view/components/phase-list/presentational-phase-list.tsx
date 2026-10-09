// 狭い画面の「済んだ段 · 中間レポート」。1段1行の一覧と、押すと下から上がる板（中間レポートの本文と、前後の段へ移るボタン）。
// 広い画面では CSS で消える（中間レポートは点線の箱で本文ごと積む）。
//
// 板の中の本文は、`Turn` が隠した同じ本文より DOM の前に置く（この一覧は `<Turn>` の前に並ぶ）。
// 隠した側は `display: none` で読み上げからも外れ、ページ内のリンクの飛び先（脚注の `id`）は先に当たるこちらになる。

import clsx from "clsx"
import type { ReactElement } from "react"

import { BottomSheet } from "../../../../../../ui/bottom-sheet/bottom-sheet.tsx"
import type { PhaseRow } from "../../domain/phase-row.ts"
import { ReportHead } from "../report-head/report-head.tsx"
import { Report } from "../report/report.tsx"
import type { PhaseListModel, PhaseMove } from "./hooks/use-phase-list.ts"
import styles from "./phase-list.module.css"

const HEADING = "済んだ段 · 中間レポート"
const SHEET_LABEL = "中間レポート"
const CHECK_MARK = "✓"
const PREVIOUS_MARK = "‹"
const NEXT_MARK = "›"

export function PresentationalPhaseList(props: {
  readonly list: PhaseListModel
  readonly turnId: number
}): ReactElement | null {
  const { list } = props
  if (list.rows.length === 0) {
    return null
  }
  const { sheet } = list

  return (
    <section className={styles["phase-list"]} aria-label={HEADING}>
      <h4 className={styles["phase-list-heading"]}>{HEADING}</h4>
      <ul className={styles["phase-list-rows"]}>
        {list.rows.map((row) => (
          <li key={row.stepId}>
            <PhaseRowButton row={row} onOpen={list.onOpen} />
          </li>
        ))}
      </ul>
      <BottomSheet
        open={sheet.kind === "open"}
        contentKey={sheet.kind === "open" ? String(sheet.row.stepId) : ""}
        ariaLabel={SHEET_LABEL}
        onClose={list.onClose}
        header={
          sheet.kind === "open" && (
            <>
              <span className={styles["phase-list-check"]} aria-hidden="true">
                {CHECK_MARK}
              </span>
              <span className={styles["phase-list-sheet-position"]}>
                {sheet.row.duration === ""
                  ? sheet.position
                  : `${sheet.position} · ${sheet.row.duration}`}
              </span>
              <span className={styles["phase-list-sheet-title"]}>{sheet.row.title}</span>
            </>
          )
        }
        footer={
          sheet.kind === "open"
            ? {
                kind: "shown",
                node: (
                  <>
                    <MoveButton move={sheet.previous} direction="previous" onOpen={list.onOpen} />
                    <MoveButton move={sheet.next} direction="next" onOpen={list.onOpen} />
                  </>
                ),
              }
            : { kind: "none" }
        }
      >
        {sheet.kind === "open" && (
          <>
            <ReportHead
              label="none"
              task={sheet.row.body.task}
              phase={{ kind: "none" }}
              className=""
            />
            <Report
              markdown={sheet.row.body.report}
              reveal={false}
              turnId={props.turnId}
              className=""
            />
          </>
        )}
      </BottomSheet>
    </section>
  )
}

function PhaseRowButton(props: {
  readonly row: PhaseRow
  readonly onOpen: (row: PhaseRow) => void
}): ReactElement {
  const { row } = props
  return (
    <button
      type="button"
      className={styles["phase-list-row"]}
      aria-haspopup="dialog"
      onClick={() => {
        props.onOpen(row)
      }}
    >
      <span className={styles["phase-list-check"]} aria-hidden="true">
        {CHECK_MARK}
      </span>
      <span className={styles["phase-list-number"]}>{row.number}</span>
      <span className={styles["phase-list-title"]}>{row.title}</span>
      <span className={styles["phase-list-duration"]}>{row.duration}</span>
      <span className={styles["phase-list-chevron"]} aria-hidden="true">
        {NEXT_MARK}
      </span>
    </button>
  )
}

/** 前後へ移るボタン。端では押せない(`aria-disabled`)。 */
function MoveButton(props: {
  readonly move: PhaseMove
  readonly direction: "previous" | "next"
  readonly onOpen: (row: PhaseRow) => void
}): ReactElement {
  const { move, direction } = props
  const label =
    direction === "previous"
      ? `${PREVIOUS_MARK} ${move.kind === "move" ? move.position : ""}`.trim()
      : `${move.kind === "move" ? move.position : ""} ${NEXT_MARK}`.trim()
  return (
    <button
      type="button"
      className={clsx(styles["phase-list-move"], move.kind === "disabled" && styles["is-disabled"])}
      aria-disabled={move.kind === "disabled"}
      aria-label={`${direction === "previous" ? "前の段" : "次の段"}${move.kind === "move" ? ` ${move.position}` : ""}`}
      onClick={() => {
        if (move.kind === "move") {
          props.onOpen(move.row)
        }
      }}
    >
      {label}
    </button>
  )
}
