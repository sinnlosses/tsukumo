// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の**器だけ**。フックも算出も持たず、
// 受け取った値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。中の部品は
// `components/`、行の畳み方は `board-row.ts`、開閉の同期は `hooks/use-task-board.ts`。
//
// サイドバーの区画は幅が 300px ほどしかなく要約が2〜3行に折り返すので、**一覧を見渡すのは
// 画面いっぱいの表**に任せる（docs/requirements.md 4.2）。
//
// **`<dialog>` は top layer に出る**ので、サイドバー領域の `overflow` には切り取られない。
// Esc で閉じるのと、閉じたときにフォーカスを開く口へ戻すのはブラウザのモーダル挙動に任せる。

import { type MouseEvent, type ReactElement, type RefObject } from "react"

import { TaskTable } from "./components/task-table.tsx"
import { type BoardRow } from "./hooks/use-task-board.ts"
import styles from "./task-board.module.css"

export type PresentationalTaskBoardProps = {
  readonly rows: readonly BoardRow[] | undefined
  /** `<dialog>` に付ける ref。開閉は `hooks/use-task-board.ts` が DOM へ写す。 */
  readonly ref: RefObject<HTMLDialogElement | null>
  readonly onClose: () => void
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
}

/**
 * **props はここだけ分解して受ける**（他の部品は `props.x` のまま）。ref を `props.ref` の形で
 * 描画中に読むと `react(refs)`（規約「レンダー中に ref を読み書きしない」）が落ちるため。
 */
export function PresentationalTaskBoard({
  rows,
  ref,
  onClose,
  onDialogClick,
}: PresentationalTaskBoardProps): ReactElement {
  return (
    <dialog
      ref={ref}
      className={styles["task-board"]}
      aria-label="タスク一覧"
      onClose={onClose}
      onClick={onDialogClick}
    >
      <div className={styles["task-board-body"]}>
        <div className={styles["task-board-head"]}>
          <h2 className={styles["task-board-heading"]}>タスク一覧</h2>
          <button type="button" className={styles["task-board-close"]} onClick={onClose}>
            閉じる
          </button>
        </div>
        <TaskTable rows={rows} />
      </div>
    </dialog>
  )
}
