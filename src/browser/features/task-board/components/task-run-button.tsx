// 押せるタスクID（区画の一覧と表の両方がこれを置く）。押すと確認（`task-run-confirm.tsx`）が
// 開き、送るのはそちら。ここが持つのは**開いているかどうか**だけ。
//
// **表の ID セルは `<th scope="row">` なので、セルごとではなく中身だけをボタンにする**
// （行全体を押せるようにすると、見出しのセルが押す口を兼ねることになる）。
//
// **確認は押した瞬間に組み立てる。** 閉じた `<dialog>` でも中身は DOM に残るので、一覧に並ぶ
// 件数だけ置くと常に同じ数の確認が居座る。
//
// 済んだタスク（`done`）・着手中（`doing`）のIDも押せるままにする——実行してよいかを決めるのは
// `/next-task` の側で、画面は `develop/tasks.json` を読むだけ（書き換える口は持たない）。

import { useState, type ReactElement } from "react"

import styles from "../task-board.module.css"
import { TaskRunConfirm } from "./task-run-confirm.tsx"

export function TaskRunButton(props: { readonly taskId: string }): ReactElement {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        className={`${styles["task-id"]} ${styles["task-id-button"]}`}
        onClick={() => {
          setConfirming(true)
        }}
      >
        {props.taskId}
      </button>
      {confirming && (
        <TaskRunConfirm
          taskId={props.taskId}
          onClose={() => {
            setConfirming(false)
          }}
        />
      )}
    </>
  )
}
