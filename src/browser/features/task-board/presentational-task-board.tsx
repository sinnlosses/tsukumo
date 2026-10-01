// タスクのモーダルの器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
//
// `<dialog>` は top layer に出るので、サイドバー領域の `overflow` には切り取られない。
// 中身は開いている間だけ描く。
// 検索欄の `autoFocus` は描いた瞬間にしか効かないので、常に描いておくと開いたときにフォーカスが入らない。
//
// ↑↓ は中身の器（`tabIndex={-1}`）で受ける。
// 行や本文のような押せない所を押すとフォーカスはこの器に移るので、そのあとも ↑↓ が効く。
// 詳細は選んだタスクごとに作り直す（前のタスクで転がした位置を持ち越さない）。
// 確認（`TaskRunConfirm`）は器の外に置く。器の中に置くと、確認の中で打った ↑↓ が React の木を伝って下の一覧の選択を動かす。
//
// つながりの札・本文中の ID・パンくずの「戻る」はリンク・ボタン（押せる要素）で、押すと
// 詳細が作り直り押した要素ごと DOM から消えるので、フォーカスが窓（body）へ落ちて ↑↓・Alt+←
// が器に届かなくなる。`focusSignal` が増えるたびに器へフォーカスを戻す
// （0 のままの初回の描画では検索欄の `autoFocus` を奪わないよう、そのときは戻さない）。

import type { ReactElement } from "react"
import { useEffect, useRef } from "react"

import { Dialog } from "../../components/ui/dialog/dialog.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import { TaskBoardAction } from "./components/task-board-action.tsx"
import { TaskBoardFilterBar } from "./components/task-board-filter-bar.tsx"
import { TaskBoardHead } from "./components/task-board-head.tsx"
import { TaskBoardList } from "./components/task-board-list.tsx"
import { TaskDetail } from "./components/task-detail.tsx"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import type { TaskBoardView } from "./hooks/use-task-board.ts"
import styles from "./task-board.module.css"

export function PresentationalTaskBoard(props: TaskBoardView): ReactElement {
  const content = props.content
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (props.focusSignal > 0) {
      frameRef.current?.focus()
    }
  }, [props.focusSignal])

  return (
    <Dialog
      open={props.open}
      ariaLabel="タスク"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["task-board"]}
    >
      {props.open && (
        <div
          ref={frameRef}
          className={styles["task-board-frame"]}
          tabIndex={-1}
          onKeyDown={props.onKeyDown}
        >
          <TaskBoardHead countsText={props.countsText} onClose={props.onClose} />
          {content.kind === "unknown" && (
            <Text
              element="p"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["task-board-message"]}
            >
              タスクの一覧が読めない
            </Text>
          )}
          {content.kind === "empty" && (
            <Text
              element="p"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["task-board-message"]}
            >
              タスクが無い
            </Text>
          )}
          {content.kind === "known" && (
            <div className={styles["task-board-columns"]}>
              <div className={styles["task-board-list-column"]}>
                <TaskBoardFilterBar
                  query={content.query}
                  chips={content.chips}
                  listId={content.listId}
                  activeOptionId={content.activeOptionId}
                  onQueryChange={props.onQueryChange}
                  onFilter={props.onFilter}
                />
                <TaskBoardList
                  listId={content.listId}
                  rows={content.rows}
                  onSelect={props.onSelect}
                />
              </div>
              <div className={styles["task-board-detail-column"]}>
                {content.selection.kind === "some" && (
                  <>
                    <TaskDetail
                      key={content.selection.detail.id}
                      detail={content.selection.detail}
                      breadcrumb={content.selection.breadcrumb}
                      knownIds={content.knownIds}
                      onJump={content.selection.onJump}
                    />
                    <TaskBoardAction
                      onCopy={content.selection.onCopy}
                      opener={content.selection.opener}
                      run={content.selection.run}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {props.confirm.kind === "open" && (
        <TaskRunConfirm taskId={props.confirm.taskId} onClose={props.onConfirmClose} />
      )}
    </Dialog>
  )
}
