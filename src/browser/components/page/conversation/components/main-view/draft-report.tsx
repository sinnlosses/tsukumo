// 書いている途中のレポートの紙。最終レポートと同じ紙の面に、届いた部品と、まだ届いていない部品の骨組みを描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { MainViewDraft } from "../../../../../../shared/session/main-view-shape.ts"
import { PendingPaper, Report } from "../../../../../features/report/report.tsx"
import { REPORT_DRAFT_ATTRIBUTE } from "./domain/report-heading.ts"
import { useDraftPop } from "./hooks/use-draft-pop.ts"
import styles from "./main-view.module.css"
import { ReportHead } from "./report-head.tsx"

type DraftReportProps = {
  readonly draft: MainViewDraft
  readonly turnId: number
  /** このやり取りに中間レポートがあるか（`MainViewTurn.hasInterimReport`）。見出しの行のラベルを出す条件の1つ。 */
  readonly hasInterimReport: boolean
}

/** 読み上げに言う紙の名前。 */
const DRAFT_NAME = "書きかけのレポート"

/** 根がまだ届いていない草稿は、ポンを掛ける塊を持たない。 */
const NO_ARRIVALS: readonly unknown[] = []

/**
 * 書いている途中のレポート。届いた塊をポンと出す（`useDraftPop`）。
 * 見出しの行は最終レポートと同じ条件（`task` があるか、中間レポートのあるやり取り）で出し、書き終えたときに行が増減しないようにする。
 * 引数を書いている途中のあいだは、読み上げに書いている途中だと言う（`aria-busy`）。
 */
export function DraftReport(props: DraftReportProps): ReactElement {
  const { draft } = props
  const { ref, motion } = useDraftPop(
    draft.kind === "parts" ? draft.components : NO_ARRIVALS,
    styles["draft-pop"],
  )
  return (
    <section
      ref={ref}
      className={clsx(styles["main-step"], styles["is-draft"])}
      aria-label={DRAFT_NAME}
      aria-busy={draft.kind === "blank" || draft.writing}
      {...{ [REPORT_DRAFT_ATTRIBUTE]: "" }}
    >
      {draft.kind === "blank" ? (
        <PendingPaper blink={motion} blockClassName={styles["detail-block"]} />
      ) : (
        <>
          <ReportHead
            label={draft.task.kind === "task" || props.hasInterimReport ? "draft" : "none"}
            task={draft.task}
            phase={{ kind: "none" }}
            className=""
          />
          <Report
            body={draft.regions}
            reveal={false}
            turnId={props.turnId}
            className=""
            revealClassName={styles["draft-pop"]}
            blockClassName={styles["detail-block"]}
            pending={{ ...draft.pending, blink: motion }}
          />
        </>
      )}
    </section>
  )
}
