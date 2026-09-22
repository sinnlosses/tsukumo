// サイドバーの区画に置く「タスク一覧」ひとまとまり。**区画の枠は置き場所を貸す側から props で
// 受け取り**（`frame`）、見出しの文言・中身・開く口・画面いっぱいの表はここが決める
// （docs/design.md 2章「領域の機能と、置かれる機能」）。枠を import で取りに行くと、置かれる
// 機能から領域への辺になる（`test/architecture.test.ts` が落とす）。
//
// **タスクの購読と、表を開いているかどうかの state はここが持つ。** `main.tsx` の `<Root>` へ
// 上げると木の頂点がタスクを購読することになり、タスクが変わるたびに全領域が描き直される。

import { useState, type ComponentType, type ReactElement, type ReactNode } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { TaskBoard } from "./task-board.tsx"
import { TaskList, taskListTitle } from "./task-list.tsx"

/** 区画の枠に渡すもの。枠の側（領域）は、この形の部品を1つ公開する。 */
export type TaskSectionFrameProps = {
  readonly title: string
  readonly action: { readonly label: string; readonly onAction: () => void }
  readonly children: ReactNode
}

export type TaskSectionProps = {
  readonly frame: ComponentType<TaskSectionFrameProps>
}

export function TaskSection(props: TaskSectionProps): ReactElement {
  const tasks = useSessionSelector((session) => session.state.tasks)
  const [boardOpen, setBoardOpen] = useState(false)
  const Frame = props.frame

  return (
    <>
      <Frame
        title={taskListTitle(tasks)}
        action={{
          label: "一覧を見る",
          onAction: () => {
            setBoardOpen(true)
          },
        }}
      >
        <TaskList tasks={tasks} />
      </Frame>
      <TaskBoard
        tasks={tasks}
        open={boardOpen}
        onClose={() => {
          setBoardOpen(false)
        }}
      />
    </>
  )
}
