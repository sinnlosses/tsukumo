// 書いている途中のレポートの札。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { MainViewDraft } from "../../../../../../shared/session/main-view-shape.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { REPORT_DRAFT_ATTRIBUTE } from "./domain/report-heading.ts"
import { DRAFT_SLOT_ATTRIBUTE, useDraftPen } from "./hooks/use-draft-pen.ts"
import { useDraftPop } from "./hooks/use-draft-pop.ts"
import styles from "./main-view.module.css"

type DraftReportProps = {
  readonly draft: MainViewDraft
  readonly turnId: number
  /** 次の部品を待っている草稿か（いちばん後ろの草稿）。待つあいだは末尾に罫線の欄を出す。 */
  readonly waiting: boolean
}

/** 書いている途中のレポート。届いた塊をポンと出し（`useDraftPop`）、待つあいだはミニ立ち絵を次の欄に立たせる（`useDraftPen`）。 */
export function DraftReport(props: DraftReportProps): ReactElement {
  const { draft } = props
  const { ref, motion } = useDraftPop(draft.components, styles["draft-pop"])
  const slotShown = motion && props.waiting
  useDraftPen(
    ref,
    slotShown ? { kind: "on", turnId: props.turnId } : { kind: "off" },
    draft.components.length,
  )
  return (
    <section
      ref={ref}
      className={clsx(styles["main-step"], styles["is-interim"])}
      {...{ [REPORT_DRAFT_ATTRIBUTE]: "" }}
    >
      <Report
        body={draft.regions}
        reveal={false}
        turnId={props.turnId}
        className=""
        revealClassName={styles["draft-pop"]}
        blockClassName={styles["detail-block"]}
      />
      {slotShown && (
        <div
          className={styles["draft-slot"]}
          aria-hidden="true"
          {...{ [DRAFT_SLOT_ATTRIBUTE]: "" }}
        />
      )}
    </section>
  )
}
