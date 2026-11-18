// 進み具合のプログレスバーの下線の区間を押すと、その区間の下に重なって出るフェーズの詳細の面。
// 見出し（状態の印・名前・位置と状態と所要）・済んだフェーズのまとめ・手順・まだのフェーズの一言を描く。

import type { ReactElement } from "react"

import { CurrentWorkStepGroup } from "../../../../../features/current-work/current-work-step-group.tsx"
import { CheckIcon } from "../../../../ui/icon/icon.tsx"
import type { PhaseDetail } from "./domain/phase-detail.ts"
import styles from "./main-view.module.css"

export function PresentationalPhaseDetail(props: {
  readonly detail: PhaseDetail
  /** 面を置く要素の左上からの px。 */
  readonly left: number
  readonly top: number
}): ReactElement {
  const { detail, left, top } = props
  return (
    <section
      role="region"
      aria-label={`${detail.name} の詳細`}
      className={styles["work-strip-phase-pop"]}
      data-phase-state={detail.state}
      style={{ left: `${String(left)}px`, top: `${String(top)}px` }}
    >
      <header className={styles["work-strip-phase-pop-head"]}>
        <span aria-hidden="true" className={styles["work-strip-phase-pop-mark"]}>
          {detail.state === "done" && <CheckIcon />}
          {(detail.state === "current" || detail.state === "asking") && (
            <span className={styles["work-strip-phase-pop-ring"]} />
          )}
          {detail.state === "upcoming" && (
            <span className={styles["work-strip-phase-pop-hollow"]} />
          )}
        </span>
        {detail.number !== "" && (
          <span className={styles["work-strip-phase-pop-number"]}>{detail.number}</span>
        )}
        <b className={styles["work-strip-phase-pop-name"]}>{detail.name}</b>
        <span className={styles["work-strip-phase-pop-meta"]}>{detail.meta}</span>
      </header>
      {detail.summary !== "" && (
        <p className={styles["work-strip-phase-pop-note"]}>{detail.summary}</p>
      )}
      {detail.groups.length > 0 && (
        <div className={styles["work-strip-phase-pop-steps"]}>
          {detail.groups.map((group) => (
            <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
          ))}
        </div>
      )}
      {detail.note !== "" && <p className={styles["work-strip-phase-pop-note"]}>{detail.note}</p>}
    </section>
  )
}
