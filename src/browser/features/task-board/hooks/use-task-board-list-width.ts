// タスクのモーダルの一覧と詳細の間の仕切り。左の一覧の幅をドラッグで変え、`localStorage` に保つ。
// ドラッグの間は描き直さず、2列の器へ直接 `--task-board-list-width` を書く。

import { useRef, useState, type CSSProperties, type RefObject } from "react"

import {
  loadTaskBoardListWidth,
  saveTaskBoardListWidth,
  taskBoardListWidthFromRatio,
} from "../domain/task-board-list-width.ts"

export type TaskBoardListWidth = {
  /** 一覧と詳細を横に並べる器。仕切りのドラッグが比率の基準にし、ドラッグ中はここへ幅を書く。 */
  readonly columnsRef: RefObject<HTMLDivElement | null>
  readonly style: CSSProperties
  readonly toValue: (ratio: number, rect: DOMRect) => number
  readonly onChange: (px: number) => void
  readonly onCommit: (px: number) => void
}

const LIST_WIDTH_VARIABLE = "--task-board-list-width"

export function useTaskBoardListWidth(): TaskBoardListWidth {
  const columnsRef = useRef<HTMLDivElement>(null)
  const [widthPx, setWidthPx] = useState(loadTaskBoardListWidth)

  return {
    columnsRef,
    style: widthPx === undefined ? {} : { [LIST_WIDTH_VARIABLE]: `${String(widthPx)}px` },
    toValue: taskBoardListWidthFromRatio,
    onChange: (px) => {
      columnsRef.current?.style.setProperty(LIST_WIDTH_VARIABLE, `${String(px)}px`)
    },
    onCommit: (px) => {
      setWidthPx(px)
      saveTaskBoardListWidth(px)
    },
  }
}
