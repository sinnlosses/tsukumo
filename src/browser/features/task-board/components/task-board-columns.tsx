// タスクのモーダルの2列（左に一覧・右に詳細）と、その間の仕切り。
// 仕切りの ref と幅はここで持つ（ref を props の入れ物越しに描画中に読むと lint の `react(refs)` が落ちる）。

import type { ReactElement, ReactNode } from "react"

import { LayoutResizer } from "../../../components/ui/layout-resizer/layout-resizer.tsx"
import { useTaskBoardListWidth } from "../hooks/use-task-board-list-width.ts"
import taskBoardStyles from "../task-board.module.css"

export type TaskBoardColumnsProps = {
  readonly list: ReactNode
  readonly detail: ReactNode
}

export function TaskBoardColumns(props: TaskBoardColumnsProps): ReactElement {
  const { columnsRef, style, toValue, onChange, onCommit } = useTaskBoardListWidth()
  return (
    <div ref={columnsRef} className={taskBoardStyles["task-board-columns"]} style={style}>
      <div className={taskBoardStyles["task-board-list-column"]}>{props.list}</div>
      <LayoutResizer
        orientation="vertical"
        containerRef={columnsRef}
        ariaLabel="一覧と詳細の仕切り"
        toValue={toValue}
        onChange={onChange}
        onCommit={onCommit}
        className=""
      />
      <div className={taskBoardStyles["task-board-detail-column"]}>{props.detail}</div>
    </div>
  )
}
