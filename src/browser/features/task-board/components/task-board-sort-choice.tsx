// ドラフトの行の右端の3択（計画・却下・保留）と、却下の行の理由の欄。
// 選んだ札は色だけでなく、左の「●」と字の色で伝える。

import clsx from "clsx"
import type { ReactElement } from "react"

import { TextField } from "../../../components/ui/text-field/text-field.tsx"
import type { DraftSortChoice } from "../domain/draft-sort.ts"
import type { TaskBoardRowSort } from "../domain/task-board-view.ts"
import styles from "./task-board-sort-choice.module.css"

const CHOICES = [
  { choice: "plan", label: "計画" },
  { choice: "drop", label: "却下" },
  { choice: "hold", label: "保留" },
] as const satisfies readonly { readonly choice: DraftSortChoice; readonly label: string }[]

const CHOICE_CLASS = {
  plan: styles["task-board-sort-plan"],
  drop: styles["task-board-sort-drop"],
  hold: styles["task-board-sort-hold"],
} satisfies Record<DraftSortChoice, string | undefined>

type SortSome = Extract<TaskBoardRowSort, { readonly kind: "some" }>

export function TaskBoardSortChoice(props: {
  readonly rowId: string
  readonly sort: SortSome
}): ReactElement {
  const { sort } = props
  return (
    <span
      role="radiogroup"
      aria-label={`${props.rowId} の仕分け`}
      className={styles["task-board-sort-group"]}
      onClick={stopPropagation}
    >
      {CHOICES.map((item) => {
        const checked = sort.choice === item.choice
        return (
          <button
            key={item.choice}
            type="button"
            role="radio"
            aria-checked={checked}
            className={clsx(
              styles["task-board-sort-button"],
              CHOICE_CLASS[item.choice],
              checked && styles["task-board-sort-on"],
            )}
            onClick={() => {
              sort.onChoose(item.choice)
            }}
          >
            {checked && <span aria-hidden="true">● </span>}
            {item.label}
          </button>
        )
      })}
    </span>
  )
}

export function TaskBoardSortReason(props: {
  readonly rowId: string
  readonly sort: SortSome
}): ReactElement {
  return (
    <label
      className={styles["task-board-sort-reason"]}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <span className={styles["task-board-sort-reason-label"]}>却下の理由:</span>
      <TextField
        element="input"
        id={`task-board-sort-reason-${props.rowId}`}
        className={styles["task-board-sort-reason-input"]}
        value={props.sort.reason}
        onChange={props.sort.onReason}
      />
    </label>
  )
}

function stopPropagation(event: { readonly stopPropagation: () => void }): void {
  event.stopPropagation()
}
