// 区画の一覧の押せるタスクID。押すと確認が開き、送るのはそちら。ここが持つのは開いているかどうかだけ。
//
// 確認は押した瞬間に組み立てる。
// 閉じた `<dialog>` でも中身は DOM に残るので、一覧に並ぶ件数だけ置くと常に同じ数の確認が居座る。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import taskBoardStyles from "../task-board.module.css"
import styles from "./task-run-button.module.css"
import { TaskRunConfirm } from "./task-run-confirm.tsx"

export function TaskRunButton(props: { readonly taskId: string }): ReactElement {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        className={clsx(taskBoardStyles["task-id"], styles["task-id-button"])}
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
