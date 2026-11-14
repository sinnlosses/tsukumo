// サイドバーのタスクの一覧の見た目の型。見た目の部品はこれだけを受け取る。

import type { KeyboardEvent } from "react"

import type { TaskDifficulty, TaskLoopable } from "../../../../shared/repository/task-summary.ts"
import type { CodeSpanPart } from "../../../domain/code-span.ts"

export type SidebarTaskRow = {
  readonly id: string
  readonly optionId: string
  readonly summary: readonly CodeSpanPart[]
  readonly difficulty?: TaskDifficulty
  readonly loopable?: TaskLoopable
  readonly selected: boolean
  /** 待ちの行だけ、まだ済んでいない依存の ID。 */
  readonly waitingFor: readonly string[]
}

/** 「依頼」を押せるか。押せないときは理由を `title` に出す。 */
export type SidebarTaskRequestGate =
  | { readonly kind: "open" }
  | { readonly kind: "closed"; readonly reason: string }

export type SidebarTaskListView =
  | { readonly kind: "no-beads" }
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "list"
      readonly listId: string
      readonly activeOptionId?: string
      readonly ready: readonly SidebarTaskRow[]
      readonly waiting: readonly SidebarTaskRow[]
      readonly gate: SidebarTaskRequestGate
      readonly onSelect: (id: string) => void
      readonly onRequest: (id: string) => void
      readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    }
