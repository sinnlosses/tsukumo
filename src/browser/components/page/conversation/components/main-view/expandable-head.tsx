// 最終レポートの見出しの行。右上の「広げる」を押すと、同じレポートを画面いっぱいの板で出す。

import { type ReactElement, useRef, useState } from "react"

import type { MainViewStepBody } from "../../../../../../shared/session/main-view-shape.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { ExpandButton } from "../../../../ui/expand-button/expand-button.tsx"
import { SaveButton } from "../../../../ui/expand-button/save-button.tsx"
import { useReportExport } from "./hooks/use-report-export.ts"
import styles from "./main-view.module.css"
import { ReportExportNotice } from "./report-export-notice.tsx"

const COLLAPSE_LABEL = "閉じる"
const BOARD_LABEL = "最終レポート"

type ExpandableHeadProps = {
  readonly turnId: number
  readonly body: Extract<MainViewStepBody, { readonly kind: "text" }>
  readonly head: ReactElement
  /** 板の `Report` に渡す class（ポンの演出と、ステップ末尾の余白の打ち消しが指す綴り）。 */
  readonly reportClassNames: {
    readonly revealClassName: string
    readonly blockClassName: string
  }
}

/** 最終レポートの見出しの行の右上に「広げる」を置き、押すと同じレポートを画面いっぱいの板で出す。板に書き上げの演出は掛けない。 */
export function ExpandableHead(props: ExpandableHeadProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const exporting = useReportExport(props.turnId)
  const { body } = props
  const close = (): void => setExpanded(false)
  // 紙の本文の根は見出しの行の兄弟の直下か、部品の一覧で描く本文の入れ物（a2ui-react-report）の直下にある。板の本文の根は列の中にある。
  const saveFromPaper = (): void =>
    exporting.save(
      frameRef.current?.parentElement?.querySelector(
        ":scope > [data-report-body], :scope > a2ui-react-report > [data-report-body]",
      ) ?? undefined,
    )
  const saveFromBoard = (): void =>
    exporting.save(columnRef.current?.querySelector("[data-report-body]") ?? undefined)
  return (
    <>
      <div className={styles["report-head-frame"]} ref={frameRef}>
        {props.head}
        <div className={styles["report-head-actions"]}>
          <SaveButton
            placement="head"
            state={exporting.state}
            className={styles["report-save"]}
            onClick={saveFromPaper}
          />
          <span className={styles["report-head-rule"]} aria-hidden="true" />
          <ExpandButton className={styles["report-expand"]} onClick={() => setExpanded(true)} />
        </div>
      </div>
      {!expanded && <ReportExportNotice model={exporting} onRetry={saveFromPaper} />}
      {expanded && (
        <Dialog
          open={true}
          ariaLabel={BOARD_LABEL}
          backdrop="dim"
          placement={{ kind: "auto" }}
          onClose={close}
          className={styles["report-board"]}
        >
          <div className={styles["report-board-body"]}>
            <div className={styles["report-board-column"]} ref={columnRef}>
              {props.head}
              <Report
                body={body.report}
                reveal={false}
                turnId={props.turnId}
                className=""
                {...props.reportClassNames}
              />
            </div>
          </div>
          <ReportExportNotice model={exporting} onRetry={saveFromBoard} />
          <div className={styles["report-board-bar"]}>
            <SaveButton
              placement="bar"
              state={exporting.state}
              className=""
              onClick={saveFromBoard}
            />
            <Button
              variant="outline-surface"
              size="secondary"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["report-board-close"]}
              onClick={close}
            >
              {COLLAPSE_LABEL}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}
