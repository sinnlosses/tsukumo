// やり取りのタブ。**新しいものが左（[今回][1つ前][n つ前]…）**。2件未満のときはタブそのものを
// 出さない（スクロールする理由が無い。`docs/requirements.md` 4.2）。

import { type ReactElement } from "react"

import styles from "./main-view.module.css"

export type TurnTabsProps = {
  /** 新しい順（今回が先頭）に並んだ、やり取りの通し番号。 */
  readonly turnIds: readonly number[]
  readonly activeTurnId: number | undefined
  readonly onSelect: (turnId: number) => void
}

const TURN_TAB_LABEL_CURRENT = "今回"

function turnTabLabel(index: number): string {
  return index === 0 ? TURN_TAB_LABEL_CURRENT : `${String(index)}つ前`
}

export function TurnTabs(props: TurnTabsProps): ReactElement | null {
  if (props.turnIds.length < 2) {
    return null
  }

  return (
    <div className={styles["turn-tabs"]} role="tablist">
      {props.turnIds.map((turnId, index) => (
        <button
          type="button"
          className={`${styles["turn-tab"]}${
            turnId === props.activeTurnId ? ` ${styles["is-active"]}` : ""
          }`}
          key={turnId}
          onClick={() => {
            props.onSelect(turnId)
          }}
        >
          {turnTabLabel(index)}
        </button>
      ))}
    </div>
  )
}
