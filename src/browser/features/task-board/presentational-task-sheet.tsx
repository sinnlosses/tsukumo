// サイドシートの器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
//
// 非モーダルの `<aside>` で、会話の画面の置き場（中央の列の進行の帯の下から入力欄の上まで）に収まる。
// 最上位の層には出さず、位置も測らない。
// 上から、前後の口・「一覧モードで開く」・閉じる口の帯 → 詳細（内側で転がる） → 操作の帯。
// 詳細はタスクごとに作り直す（前のタスクで転がした位置を持ち越さない）。
// 確認（`TaskRunConfirm`）はモーダルの `<dialog>` で最上位の層に出るので、サイドシートの上に重なる。
//
// つながりの札・本文中の ID・パンくずの「戻る」は、押すと詳細が作り直り押した要素ごと DOM から消えて
// フォーカスが body へ落ち、Esc・Alt+← が器に届かなくなる。`focusSignal` が増えるたびに器へフォーカスを戻す
// （0 のままの初回はフォーカスを奪わない）。

import { useRef, type ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  MaximizeIcon,
} from "../../components/ui/icon/icon.tsx"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { TaskBoardAction } from "./components/task-board-action.tsx"
import { TaskDetail } from "./components/task-detail.tsx"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import styles from "./components/task-sheet.module.css"
import { TASK_SHEET_DOM_ID } from "./domain/task-row-dom-id.ts"
import type { TaskSheetView } from "./hooks/use-task-sheet-view.ts"

const TITLE_ID = "task-sheet-title"

export function PresentationalTaskSheet(props: {
  readonly view: TaskSheetView
}): ReactElement | undefined {
  const { view } = props
  const asideRef = useRef<HTMLElement>(null)
  const focusSignal = view.kind === "open" ? view.focusSignal : 0

  useExternalSync(() => {
    if (focusSignal > 0) {
      asideRef.current?.focus()
    }
  }, [focusSignal])

  if (view.kind === "closed") {
    return undefined
  }
  const { selection } = view
  return (
    <aside
      ref={asideRef}
      id={TASK_SHEET_DOM_ID}
      aria-labelledby={TITLE_ID}
      tabIndex={-1}
      className={styles["task-sheet"]}
      onKeyDown={view.onKeyDown}
    >
      <div className={styles["task-sheet-head"]}>
        <span className={styles["task-sheet-step"]}>
          <Button
            variant="ghost"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel="前のタスク"
            disclosure={{ kind: "none" }}
            className={styles["task-sheet-tool"]}
            onClick={() => {
              view.onStep(-1)
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel="次のタスク"
            disclosure={{ kind: "none" }}
            className={styles["task-sheet-tool"]}
            onClick={() => {
              view.onStep(1)
            }}
          >
            <ChevronRightIcon />
          </Button>
        </span>
        <span className={styles["task-sheet-step"]}>
          {view.listMode.kind === "some" && (
            <Button
              variant="ghost"
              size="action"
              pressed="none"
              disabled={false}
              ariaLabel="一覧モードで開く"
              disclosure={{ kind: "dialog" }}
              title="一覧モードで開く"
              className={styles["task-sheet-tool"]}
              onClick={view.listMode.onOpen}
            >
              <MaximizeIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel="閉じる"
            disclosure={{ kind: "none" }}
            className={styles["task-sheet-tool"]}
            onClick={view.onClose}
          >
            <CloseIcon />
          </Button>
        </span>
      </div>
      <div className={styles["task-sheet-body"]}>
        <TaskDetail
          key={selection.detail.id}
          detail={selection.detail}
          titleId={TITLE_ID}
          breadcrumb={selection.breadcrumb}
          knownIds={view.knownIds}
          onJump={selection.onJump}
          onCopy={selection.onCopy}
        />
      </div>
      <TaskBoardAction lead={false} opener={selection.opener} run={selection.run} />
      {view.confirm.kind === "open" && (
        <TaskRunConfirm target={view.confirm.target} onClose={view.onConfirmClose} />
      )}
    </aside>
  )
}
