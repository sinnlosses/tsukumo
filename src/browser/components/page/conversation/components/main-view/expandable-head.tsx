// 最終レポートの見出しの行。右上の「広げる」を押すと、同じレポートを画面いっぱいの板で出す。

import { type ReactElement, useState } from "react"

import type { MainViewStepBody } from "../../../../../../shared/session/main-view-shape.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { MaximizeIcon } from "../../../../ui/icon/icon.tsx"
import styles from "./main-view.module.css"

const EXPAND_LABEL = "広げる"
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
  const { body } = props
  const close = (): void => setExpanded(false)
  return (
    <>
      <div className={styles["report-head-frame"]}>
        {props.head}
        <Button
          variant="ghost-hover-rule-soft"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "dialog" }}
          className={styles["report-expand"]}
          onClick={() => setExpanded(true)}
        >
          <MaximizeIcon /> {EXPAND_LABEL}
        </Button>
      </div>
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
            <div className={styles["report-board-column"]}>
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
          <div className={styles["report-board-bar"]}>
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
