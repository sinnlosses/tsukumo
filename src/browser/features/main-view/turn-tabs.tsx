// やり取りのタブ。**新しいものが左**に並ぶ。2件未満のときはタブそのものを出さない（スクロールする
// 理由が無い。`docs/requirements.md` 4.2）。
//
// **見えている名前はやり取りの中身から作る**（`domain/turn-tab-label.ts`）。並びの位置（「3つ前」）は
// やり取りが進むたびにずれるので、名前には入れず `title` に添える。「今回」だけは位置でも意味が
// あるので、先頭のタブの名前の前に小さく出す。

import { type ReactElement } from "react"

import { type TurnTab } from "./domain/turn-tab-label.ts"
import styles from "./main-view.module.css"

export type TurnTabsProps = {
  /** 新しい順（今回が先頭）に並んだ、やり取りのタブ。 */
  readonly tabs: readonly TurnTab[]
  readonly activeTurnId: number | undefined
  readonly onSelect: (turnId: number) => void
}

const TURN_TAB_LABEL_CURRENT = "今回"

export function TurnTabs(props: TurnTabsProps): ReactElement | null {
  if (props.tabs.length < 2) {
    return null
  }

  return (
    <div className={styles["turn-tabs"]} role="tablist">
      {props.tabs.map((tab, index) => (
        <button
          type="button"
          className={`${styles["turn-tab"]}${
            tab.id === props.activeTurnId ? ` ${styles["is-active"]}` : ""
          }`}
          key={tab.id}
          title={`${relativePosition(index)}: ${tab.fullLabel}`}
          onClick={() => {
            props.onSelect(tab.id)
          }}
        >
          {index === 0 && (
            <span className={styles["turn-tab-current"]}>{TURN_TAB_LABEL_CURRENT}</span>
          )}
          <span className={styles["turn-tab-label"]}>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 新しい順の添字を、今回からの距離の呼び名にする（`title` にだけ出す）。 */
function relativePosition(index: number): string {
  return index === 0 ? TURN_TAB_LABEL_CURRENT : `${String(index)}つ前`
}
