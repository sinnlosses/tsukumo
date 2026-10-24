// タスクのモーダルの下端の帯（絞り込み「ドラフト」で仕分けを選んだとき）。
// 件数入りの「頼む」を押すと、選んだぶんを1通にまとめた確認が開く。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import type { TaskBoardSortBand as TaskBoardSortBandView } from "../domain/task-board-view.ts"
import styles from "./task-board-sort-band.module.css"

type SortSome = Extract<TaskBoardSortBandView, { readonly kind: "some" }>

export function TaskBoardSortBand(props: { readonly band: SortSome }): ReactElement {
  const band = props.band
  return (
    <div className={styles["task-board-sort-band"]}>
      <Button
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["task-board-sort-reset"]}
        onClick={band.onReset}
      >
        仕分けを戻す
      </Button>
      <span className={styles["task-board-sort-hold-count"]}>
        保留の {band.holdCount} 件は触らない
      </span>
      <Button
        variant="solid-accent"
        size="subheading"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        ariaHasPopup="dialog"
        disclosure={{ kind: "none" }}
        title={undefined}
        className={styles["task-board-sort-request"]}
        onClick={band.onRequest}
      >
        {requestLabelOf(band)}
      </Button>
    </div>
  )
}

/** 「計画 2・却下 1 を頼む」。0件の側は出さない。 */
function requestLabelOf(band: SortSome): string {
  const parts = [
    band.planCount > 0 ? `計画 ${band.planCount}` : undefined,
    band.dropCount > 0 ? `却下 ${band.dropCount}` : undefined,
  ].filter((part) => part !== undefined)
  return `${parts.join("・")} を頼む`
}
