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
// 詳細が作り直り押した要素ごと DOM から消えるので、フォーカスがウィンドウ（body）へ落ちて ↑↓・Alt+←
// が器に届かなくなる。`focusSignal` が増えるたびに器へフォーカスを戻す
// （0 のままの初回の描画では検索欄の `autoFocus` を奪わないよう、そのときは戻さない）。

import type { ReactElement } from "react"
import { useRef } from "react"

import { Dialog } from "../../components/ui/dialog/dialog.tsx"
import { Surface } from "../../components/ui/surface/surface.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { DraftSortBand, DraftSortPanel } from "./components/draft-sort-panel.tsx"
import { TaskBoardAction } from "./components/task-board-action.tsx"
import { TaskBoardColumns } from "./components/task-board-column-list.tsx"
import { TaskBoardFilterBar } from "./components/task-board-filter-bar.tsx"
import { TaskBoardHead } from "./components/task-board-head.tsx"
import { TaskBoardKeyHint } from "./components/task-board-key-hint.tsx"
import { TaskBoardList } from "./components/task-board-list.tsx"
import { TaskBoardSearch } from "./components/task-board-search.tsx"
import { TaskDetail } from "./components/task-detail.tsx"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import { TaskSkeleton } from "./components/task-skeleton.tsx"
import type { TaskBoardView } from "./domain/task-board-view.ts"
import { BOARD_SORT_PANE_DOM_ID } from "./domain/task-row-dom-id.ts"
import styles from "./task-board.module.css"

const SORT_TITLE_ID = "task-board-sort-title"

export function PresentationalTaskBoard(props: TaskBoardView): ReactElement {
  const content = props.content
  const frameRef = useRef<HTMLDivElement>(null)

  useExternalSync(() => {
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
        <Surface
          element="div"
          tone="surface"
          space="none"
          radius="xl"
          shadow="overlay"
          className={styles["task-board-surface"]}
        >
          <div
            ref={frameRef}
            className={styles["task-board-frame"]}
            tabIndex={-1}
            onKeyDown={props.onKeyDown}
          >
            <TaskBoardHead
              listed={
                content.kind === "known"
                  ? {
                      kind: "some",
                      total: content.total,
                      search: (
                        <TaskBoardSearch
                          query={content.query}
                          listId={content.listId}
                          activeOptionId={content.activeOptionId}
                          onQueryChange={props.onQueryChange}
                          onKeyDown={props.onSearchKeyDown}
                        />
                      ),
                    }
                  : { kind: "none" }
              }
              onClose={props.onClose}
            />
            {content.kind === "known" && (
              <TaskBoardFilterBar
                chips={content.chips}
                workRepos={content.workRepos}
                onWorkRepo={props.onWorkRepo}
                draftSort={props.draftSort}
                onFilter={props.onFilter}
              />
            )}
            {content.kind === "loading" && (
              <div className={styles["task-board-message"]}>
                <TaskSkeleton />
              </div>
            )}
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
              <TaskBoardColumns
                list={
                  <TaskBoardList
                    listId={content.listId}
                    stages={content.stages}
                    omittedClosedCount={content.omittedClosedCount}
                    onSelect={props.onSelect}
                  />
                }
                detail={
                  <>
                    {props.draftSort.kind === "open" && (
                      <section
                        id={BOARD_SORT_PANE_DOM_ID}
                        aria-labelledby={SORT_TITLE_ID}
                        className={styles["task-board-sort-pane"]}
                        onKeyDown={props.draftSort.onPaneKeyDown}
                      >
                        <DraftSortPanel
                          panel={props.draftSort.panel}
                          titleId={SORT_TITLE_ID}
                          onClose={props.draftSort.onClose}
                        />
                      </section>
                    )}
                    {content.selection.kind === "some" && (
                      <TaskDetail
                        key={content.selection.detail.id}
                        detail={content.selection.detail}
                        titleId="task-board-detail-title"
                        breadcrumb={content.selection.breadcrumb}
                        knownIds={content.knownIds}
                        onJump={content.selection.onJump}
                        onCopy={content.selection.onCopy}
                      />
                    )}
                  </>
                }
              />
            )}
            {content.kind === "known" && props.draftSort.kind === "open" && (
              <DraftSortBand band={props.draftSort.panel.band} />
            )}
            {content.kind === "known" && content.selection.kind === "some" && (
              <TaskBoardAction
                lead={<TaskBoardKeyHint />}
                opener={content.selection.opener}
                run={content.selection.run}
              />
            )}
          </div>
        </Surface>
      )}
      {props.confirm.kind === "open" && (
        <TaskRunConfirm target={props.confirm.target} onClose={props.onConfirmClose} />
      )}
    </Dialog>
  )
}
